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
  };

  let fmRecords: Awaited<ReturnType<typeof getAllStockbook>>;
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

  if (!fmRecords.length) {
    send({ type: "done", synced: 0, message: "No records returned from FileMaker StockBook layout." });
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

router.post("/sync", requireAuth, async (req, res): Promise<void> => {
  await syncStockbook(req, res, 50);
});

router.post("/sync/full", requireAuth, async (req, res): Promise<void> => {
  await syncStockbook(req, res, 1);
});

export default router;
