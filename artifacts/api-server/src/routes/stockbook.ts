import { Router } from "express";
import { db, stockbookTable } from "@workspace/db";
import { and, or, ilike, eq, isNotNull, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { getAllStockbook, debugStockbookFind, fmTextTimestampToMs, setStockTracked } from "../lib/filemaker";
import { getSetting, setSetting } from "../lib/settings";
import { logger } from "../lib/logger";

const router = Router();

router.get("/otypes", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ otype: stockbookTable.otype })
    .from(stockbookTable)
    .where(isNotNull(stockbookTable.otype))
    .orderBy(stockbookTable.otype);
  const values = rows.map((r) => r.otype as string).filter(Boolean);
  res.json({ otypes: values });
});

router.get("/", requireAuth, async (req, res): Promise<void> => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const otype = typeof req.query.otype === "string" ? req.query.otype.trim() : "";
  const terms = search.split(/\s+/).filter(Boolean);

  const conditions = [
    ...(terms.length
      ? terms.map((term) =>
          or(
            ilike(stockbookTable.pcode, `%${term}%`),
            ilike(stockbookTable.description, `%${term}%`),
          ),
        )
      : []),
    ...(otype ? [eq(stockbookTable.otype, otype)] : []),
  ];

  const rows = conditions.length
    ? await db
        .select()
        .from(stockbookTable)
        .where(and(...conditions))
        .orderBy(stockbookTable.pcode)
    : await db.select().from(stockbookTable).orderBy(stockbookTable.pcode);

  const lastSynced = rows.reduce(
    (latest, r) =>
      r.lastSyncedAt && (!latest || r.lastSyncedAt > latest) ? r.lastSyncedAt : latest,
    null as Date | null,
  );

  res.json({ items: rows, lastSyncedAt: lastSynced, total: rows.length });
});

async function syncStockbook(
  req: Parameters<typeof requireAuth>[0],
  res: Parameters<typeof requireAuth>[1],
  progressInterval = 50,
): Promise<void> {
  (req.socket as { setNoDelay?: (v: boolean) => void } | null)?.setNoDelay?.(true);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(": connected\n\n");

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    (res as unknown as { flush?: () => void }).flush?.();
  };

  let fmRecords: ReturnType<typeof getAllStockbook> extends Promise<infer T> ? T : never;
  try {
    fmRecords = await getAllStockbook((fetched, total) => {
      if (progressInterval <= 1 || fetched % progressInterval === 0 || fetched === total) {
        send({ type: "progress", phase: "fetch", fetched, total });
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "FileMaker sync failed";
    logger.error({ err }, `FileMaker stockbook sync failed: ${message}`);
    send({ type: "error", message });
    res.end();
    return;
  }

  const { records, maxFmTimestamp } = fmRecords;

  if (!records.length) {
    send({ type: "done", synced: 0, message: "No records returned from FileMaker StockBook." });
    res.end();
    return;
  }

  // Deduplicate by pcode — FileMaker can return duplicate PCODEs; keep last.
  const deduped = Array.from(
    records.reduce((map, r) => {
      map.set(r.pcode, r);
      return map;
    }, new Map<string, (typeof records)[0]>()).values(),
  );

  // JS-side delta filter: read the epoch ms of the stored cutoff and only
  // upsert records whose Replit_ModifiedDate (parsed to epoch ms) is newer.
  // This avoids writing all 16k+ unchanged records to SQLite on every sync.
  //
  // We do NOT use a FM-side criterion for this because FileMaker text
  // comparison of mixed 12h/24h timestamp formats gives wrong ordering
  // (e.g. "02:30:00 pm" < "11:45:01" even though 2:30 PM is later).
  // Fetching all records from FM and filtering here is reliable regardless
  // of which timestamp format Replit_ModifiedDate uses.
  //
  // Records with fmModifiedMs === 0 (empty / unparseable field) are always
  // included — we never silently drop a record we can't parse.
  const storedSince = await getSetting("stockbook_fm_since").catch(() => null);
  const sinceMs = storedSince ? fmTextTimestampToMs(storedSince) : 0;
  const toUpsert = sinceMs > 0
    ? deduped.filter((r) => r.fmModifiedMs === 0 || r.fmModifiedMs > sinceMs)
    : deduped;

  if (toUpsert.length === 0) {
    logger.info({ fetched: records.length, sinceMs }, "Stockbook sync: all records already up to date");
    // Still persist maxFmTimestamp so the cutoff stays fresh even if nothing changed.
    if (maxFmTimestamp) {
      await setSetting("stockbook_fm_since", maxFmTimestamp).catch(() => null);
    }
    send({ type: "done", synced: 0, total: records.length, syncedAt: new Date().toISOString() });
    res.end();
    return;
  }

  const now = new Date();
  let saved = 0;
  const total = toUpsert.length;

  try {
    for (const r of toUpsert) {
      await db
        .insert(stockbookTable)
        .values({
          pcode: r.pcode,
          description: r.description || "",
          qtyOnHand: Number.isFinite(r.qtyOnHand) ? r.qtyOnHand : 0,
          unit: r.unit,
          location: r.location,
          otype: r.otype,
          project: r.project,
          pid: r.pid,
          tagStockTracked: r.tracked,
          lastSyncedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: stockbookTable.pcode,
          set: {
            description: sql`excluded.description`,
            qtyOnHand: sql`excluded.qty_on_hand`,
            unit: sql`excluded.unit`,
            location: sql`excluded.location`,
            otype: sql`excluded.otype`,
            project: sql`excluded.project`,
            pid: sql`excluded.pid`,
            tagStockTracked: sql`excluded.tag_stock_tracked`,
            lastSyncedAt: sql`excluded.last_synced_at`,
            updatedAt: sql`excluded.updated_at`,
          },
        });

      saved++;
      if (saved % 50 === 0 || saved === total) {
        send({ type: "progress", phase: "save", saved, total });
      }
    }
  } catch (saveErr) {
    const message = saveErr instanceof Error ? saveErr.message : "Database save failed";
    logger.error({ saveErr }, `Stockbook save to database failed: ${message}`);
    send({ type: "error", message: `Save failed: ${message}` });
    res.end();
    return;
  }

  // Mark any local record NOT in the FileMaker result set as untracked.
  // This handles the case where Tag_StockTracked was set to 0 directly in
  // FileMaker — those records won't appear in the sync fetch, so we clear
  // their local flag to keep the UI in sync with FileMaker's true state.
  try {
    const syncedPcodes = deduped.map((r) => r.pcode);
    if (syncedPcodes.length > 0) {
      await db.execute(sql`
        UPDATE stockbook
        SET tag_stock_tracked = false, updated_at = NOW()
        WHERE tag_stock_tracked = true
          AND pcode != ALL(${syncedPcodes})
      `);
    }
  } catch (e) {
    logger.warn({ e }, "Could not clear untracked stockbook records after sync");
  }

  // Persist the highest Replit_ModifiedDate seen so the next sync can use it
  // as the JS-side epoch cutoff for delta filtering.
  if (maxFmTimestamp) {
    try {
      await setSetting("stockbook_fm_since", maxFmTimestamp);
      logger.info({ maxFmTimestamp }, "Stored stockbook_fm_since for next delta sync");
    } catch (e) {
      logger.warn({ e }, "Could not persist stockbook_fm_since");
    }
  }

  logger.info({ fetched: records.length, upserted: toUpsert.length }, "Stockbook sync complete");
  send({ type: "done", synced: toUpsert.length, total: records.length, syncedAt: now.toISOString() });
  res.end();
}

// Debug endpoint: probe FileMaker with several Replit_ModifiedDate criterion
// formats and show raw dataInfo so we can diagnose delta-sync behaviour.
// GET /api/stockbook/debug-delta
router.get("/debug-delta", requireAuth, async (req, res): Promise<void> => {
  const stored = await getSetting("stockbook_fm_since").catch(() => null);

  const tests = await Promise.allSettled([
    // A: stored FM timestamp as-is (what delta sync will actually send)
    stored
      ? debugStockbookFind({ Tag_StockTracked: "1", Replit_ModifiedDate: `>${stored}` })
      : Promise.resolve({ skipped: "no stored timestamp yet" }),
    // B: sanity check — all tracked records (should be 18k+)
    debugStockbookFind({ Tag_StockTracked: "1" }),
  ]);

  res.json({
    stored_fm_since: stored,
    results: {
      A_deltaWithStored: tests[0].status === "fulfilled"
        ? tests[0].value
        : { error: String((tests[0] as PromiseRejectedResult).reason) },
      B_allTracked: tests[1].status === "fulfilled"
        ? tests[1].value
        : { error: String((tests[1] as PromiseRejectedResult).reason) },
    },
  });
});

router.patch("/:pcode/tracked", requireAuth, async (req, res): Promise<void> => {
  const pcode = req.params.pcode;
  const { tracked } = req.body as { tracked?: unknown };

  if (typeof tracked !== "boolean") {
    res.status(400).json({ error: "tracked must be a boolean" });
    return;
  }

  try {
    const found = await setStockTracked(pcode, tracked);
    if (!found) {
      res.status(404).json({ error: `PCODE "${pcode}" not found in FileMaker StockBook` });
      return;
    }
    // Mirror the change in the local DB so the UI reflects it immediately.
    await db
      .update(stockbookTable)
      .set({ tagStockTracked: tracked, updatedAt: new Date() })
      .where(eq(stockbookTable.pcode, pcode));
    res.json({ pcode, tracked });
  } catch (err) {
    const message = err instanceof Error ? err.message : "FileMaker update failed";
    logger.error({ err, pcode }, `Failed to update Tag_StockTracked for ${pcode}`);
    res.status(502).json({ error: message });
  }
});

router.post("/sync", requireAuth, async (req, res): Promise<void> => {
  await syncStockbook(req, res, 50);
});

router.post("/sync/full", requireAuth, async (req, res): Promise<void> => {
  logger.info("Stockbook sync: fetching all tracked records from FileMaker");
  await syncStockbook(req, res, 1);
});

export default router;
