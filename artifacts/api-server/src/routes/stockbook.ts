import { Router } from "express";
import { db, stockbookTable } from "@workspace/db";
import { like, or, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { getAllStockbook } from "../lib/filemaker";
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

router.post("/sync", requireAuth, async (req, res): Promise<void> => {
  (req.socket as { setNoDelay?: (v: boolean) => void } | null)?.setNoDelay?.(true);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(": connected\n\n");

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let fmRecords: Awaited<ReturnType<typeof getAllStockbook>>;
  try {
    fmRecords = (await getAllStockbook((fetched, total) => {
      send({ type: "progress", phase: "fetch", fetched, total: Math.min(total, 10) });
    })).slice(0, 10);
  } catch (err) {
    const message = err instanceof Error ? err.message : "FileMaker sync failed";
    logger.error({ err }, `FileMaker stockbook sync failed: ${message}`);
    send({ type: "error", message });
    res.end();
    return;
  }

  if (!fmRecords.length) {
    send({ type: "done", synced: 0, message: "No records returned from FileMaker StockBook layout." });
    res.end();
    return;
  }

  const now = new Date();
  const batchSize = 500;
  let saved = 0;
  const total = fmRecords.length;

  try {
    for (let i = 0; i < fmRecords.length; i += batchSize) {
      const batch = fmRecords.slice(i, i + batchSize);
      await db
        .insert(stockbookTable)
        .values(
          batch.map((r) => ({
            pcode: r.pcode,
            description: r.description,
            qtyOnHand: r.qtyOnHand,
            unit: r.unit,
            location: r.location,
            lastSyncedAt: now,
            updatedAt: now,
          })),
        )
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
      saved += batch.length;
      send({ type: "progress", phase: "save", saved, total });
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
});

export default router;
