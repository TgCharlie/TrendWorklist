import { Router } from "express";
import { db, stockbookTable } from "@workspace/db";
import { ilike, or } from "drizzle-orm";
import { sql } from "drizzle-orm";
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
            ilike(stockbookTable.pcode, `%${search}%`),
            ilike(stockbookTable.description, `%${search}%`),
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
  let fmRecords: Awaited<ReturnType<typeof getAllStockbook>>;
  try {
    fmRecords = await getAllStockbook();
  } catch (err) {
    const message = err instanceof Error ? err.message : "FileMaker sync failed";
    logger.error({ err }, `FileMaker stockbook sync failed: ${message}`);
    res.status(502).json({ error: message });
    return;
  }

  if (!fmRecords.length) {
    res.json({ synced: 0, message: "No records returned from FileMaker StockBook layout." });
    return;
  }

  const now = new Date();

  await db
    .insert(stockbookTable)
    .values(
      fmRecords.map((r) => ({
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

  res.json({ synced: fmRecords.length, syncedAt: now });
});

export default router;
