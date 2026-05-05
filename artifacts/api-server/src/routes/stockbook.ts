import { Router } from "express";
import { db, stockbookTable } from "@workspace/db";
import { like, max, or, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { getAllStockbook, debugStockbookFind } from "../lib/filemaker";
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
  since?: Date,
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

  let fmRecords: Awaited<ReturnType<typeof getAllStockbook>>;
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

  if (!fmRecords.length) {
    const message = since
      ? "No records have been modified in FileMaker since the last sync."
      : "No records returned from FileMaker StockBook layout.";
    send({ type: "done", synced: 0, message });
    res.end();
    return;
  }

  // Deduplicate by pcode — FileMaker can return duplicate PCODEs; keep last occurrence.
  const deduped = Array.from(
    fmRecords.reduce((map, r) => {
      map.set(r.pcode, r);
      return map;
    }, new Map<string, (typeof fmRecords)[0]>()).values(),
  );

  const now = new Date();
  let saved = 0;
  const total = deduped.length;

  try {
    for (const r of deduped) {
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

  send({ type: "done", synced: fmRecords.length, syncedAt: now.toISOString() });
  res.end();
}

// Debug endpoint: probe FileMaker with several ModifiedDate criterion formats
// so we can identify which field name / date format the server accepts.
// GET /api/stockbook/debug-delta
router.get("/debug-delta", requireAuth, async (req, res): Promise<void> => {
  const [row] = await db
    .select({ lastSync: max(stockbookTable.lastSyncedAt) })
    .from(stockbookTable);
  const since = row?.lastSync ?? new Date();

  // Build both formats from `since`
  const mm = String(since.getMonth() + 1).padStart(2, "0");
  const dd = String(since.getDate()).padStart(2, "0");
  const yyyy = since.getFullYear();
  const hh = String(since.getHours()).padStart(2, "0");
  const min = String(since.getMinutes()).padStart(2, "0");
  const ss = String(since.getSeconds()).padStart(2, "0");
  const tsLocal  = `${mm}/${dd}/${yyyy} ${hh}:${min}:${ss}`;
  const dateOnly = `${mm}/${dd}/${yyyy}`;

  // Also build a "tomorrow" date to catch the timezone skew case
  const tomorrow = new Date(since);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tmMm = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const tmDd = String(tomorrow.getDate()).padStart(2, "0");
  const tmYyyy = tomorrow.getFullYear();
  const tomorrowDate = `${tmMm}/${tmDd}/${tmYyyy}`;

  const tests = await Promise.allSettled([
    // A: field name + full timestamp
    debugStockbookFind({ Tag_StockTracked: "1", ModifiedDate: `>${tsLocal}` }),
    // B: field name + date only
    debugStockbookFind({ Tag_StockTracked: "1", ModifiedDate: `>${dateOnly}` }),
    // C: tomorrow date (should always be 0 if field works)
    debugStockbookFind({ Tag_StockTracked: "1", ModifiedDate: `>${tomorrowDate}` }),
    // D: bare wildcard (sanity-check total)
    debugStockbookFind({ Tag_StockTracked: "1" }),
  ]);

  res.json({
    since: since.toISOString(),
    tsLocal,
    dateOnly,
    tomorrowDate,
    results: {
      A_fullTimestamp: tests[0].status === "fulfilled" ? tests[0].value : { error: String((tests[0] as PromiseRejectedResult).reason) },
      B_dateOnly:      tests[1].status === "fulfilled" ? tests[1].value : { error: String((tests[1] as PromiseRejectedResult).reason) },
      C_tomorrow:      tests[2].status === "fulfilled" ? tests[2].value : { error: String((tests[2] as PromiseRejectedResult).reason) },
      D_allTracked:    tests[3].status === "fulfilled" ? tests[3].value : { error: String((tests[3] as PromiseRejectedResult).reason) },
    },
  });
});

router.post("/sync", requireAuth, async (req, res): Promise<void> => {
  await syncStockbook(req, res, 50);
});

router.post("/sync/full", requireAuth, async (req, res): Promise<void> => {
  // Use the latest lastSyncedAt across all rows as the delta cutoff.
  // On the very first sync this will be null and all tracked records are fetched.
  const [row] = await db
    .select({ lastSync: max(stockbookTable.lastSyncedAt) })
    .from(stockbookTable);
  const since = row?.lastSync ?? undefined;
  if (since) {
    logger.info({ since }, "Full sync: delta mode — fetching FM records modified after last sync");
  } else {
    logger.info("Full sync: no prior sync found — fetching all tracked records");
  }
  await syncStockbook(req, res, 1, since);
});

export default router;
