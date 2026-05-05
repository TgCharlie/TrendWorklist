import { Router } from "express";
import { db, stockbookTable } from "@workspace/db";
import { like, or, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { getAllStockbook, debugStockbookFind, fmTextTimestampToMs } from "../lib/filemaker";
import { getSetting, setSetting } from "../lib/settings";
import { logger } from "../lib/logger";

const router = Router();

router.get("/", requireAuth, async (req, res): Promise<void> => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  const rows = search
    ? await db
        .select()
        .from(stockbookTable)
        .where(
          or(
            like(stockbookTable.pcode, `%${search}%`),
            like(stockbookTable.description, `%${search}%`),
          ),
        )
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
  since?: string,
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

  // sinceMs is used for JS-side filtering regardless of whether FM applied
  // its own text criterion. This catches any records FM might miss (e.g. the
  // Dec→Jan year-boundary edge case with MM/DD/YYYY 24h format).
  const sinceMs = since ? fmTextTimestampToMs(since) : 0;

  let fmRecords: ReturnType<typeof getAllStockbook> extends Promise<infer T> ? T : never;
  try {
    fmRecords = await getAllStockbook((fetched, total) => {
      if (progressInterval <= 1 || fetched % progressInterval === 0 || fetched === total) {
        send({ type: "progress", phase: "fetch", fetched, total });
      }
    }, since);
  } catch (err) {
    const message = err instanceof Error ? err.message : "FileMaker sync failed";
    logger.error({ err }, `FileMaker stockbook sync failed: ${message}`);
    send({ type: "error", message });
    res.end();
    return;
  }

  const { records, maxFmTimestamp } = fmRecords;

  if (!records.length) {
    // FM returned nothing — either truly empty or the delta filtered everything.
    // Report as "up to date" so the user knows the sync ran.
    send({ type: "done", synced: 0, message: since ? "Everything is up to date." : "No records returned from FileMaker StockBook." });
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

  // JS-side delta filter: only upsert records actually newer than the cutoff.
  // Records with fmModifiedMs === 0 (missing/unparseable field) are always
  // included so we never silently drop them.
  const toUpsert = sinceMs > 0
    ? deduped.filter((r) => r.fmModifiedMs === 0 || r.fmModifiedMs > sinceMs)
    : deduped;

  if (toUpsert.length === 0) {
    // FM sent records but JS filtering found nothing newer — all up to date.
    logger.info({ fetched: records.length, sinceMs }, "Stockbook sync: all records already up to date");
    send({ type: "done", synced: 0, message: "Everything is up to date." });
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

  // Persist the highest Replit_ModifiedDate seen so the next sync can use it
  // as the `since` cutoff.  When Replit_ModifiedDate is 24h format this also
  // enables FM-side delta filtering (fewer records fetched from FM).
  if (maxFmTimestamp) {
    try {
      await setSetting("stockbook_fm_since", maxFmTimestamp);
      logger.info({ maxFmTimestamp }, "Stored stockbook_fm_since for next delta sync");
    } catch (e) {
      logger.warn({ e }, "Could not persist stockbook_fm_since");
    }
  }

  logger.info({ fetched: records.length, updated: toUpsert.length }, "Stockbook sync complete");
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

router.post("/sync", requireAuth, async (req, res): Promise<void> => {
  await syncStockbook(req, res, 50);
});

router.post("/sync/full", requireAuth, async (req, res): Promise<void> => {
  // Read the FM timestamp stored after the last sync and pass it as `since`.
  // getAllStockbook uses it as a FM-side criterion only when it's in a 24h
  // format (reliable text sort). Either way, the route also applies a JS-side
  // filter so nothing is ever silently missed.
  const since = await getSetting("stockbook_fm_since").catch(() => undefined);
  if (since) {
    logger.info({ since }, "Stockbook sync: using stored FM timestamp as delta cutoff");
  } else {
    logger.info("Stockbook sync: no prior FM timestamp — fetching all tracked records");
  }
  await syncStockbook(req, res, 1, since || undefined);
});

export default router;
