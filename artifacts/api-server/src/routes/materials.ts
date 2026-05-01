import { Router } from "express";
import { db, materialsTable } from "@workspace/db";
import { eq, or, ilike } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth-middleware";
import { getStockLevel } from "../lib/filemaker";

const router = Router();

router.get("/", requireAuth, async (req, res): Promise<void> => {
  const search = req.query.search as string | undefined;
  let rows;
  if (search) {
    rows = await db
      .select()
      .from(materialsTable)
      .where(
        or(
          ilike(materialsTable.displayName, `%${search}%`),
          ilike(materialsTable.pcode, `%${search}%`),
        ),
      );
  } else {
    rows = await db.select().from(materialsTable);
  }
  res.json(rows);
});

router.get("/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [material] = await db
    .select()
    .from(materialsTable)
    .where(eq(materialsTable.id, id))
    .limit(1);
  if (!material) {
    res.status(404).json({ error: "Material not found" });
    return;
  }
  res.json(material);
});

router.get("/:id/stock", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [material] = await db
    .select()
    .from(materialsTable)
    .where(eq(materialsTable.id, id))
    .limit(1);
  if (!material) {
    res.status(404).json({ error: "Material not found" });
    return;
  }
  try {
    const stock = await getStockLevel(material.pcode);
    res.json(stock ?? { pcode: material.pcode, qtyOnHand: null, unit: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: message });
  }
});

router.post("/", requireAdmin, async (req, res): Promise<void> => {
  const { pcode, displayName, notes } = req.body as {
    pcode?: string;
    displayName?: string;
    notes?: string;
  };
  if (!pcode || !displayName) {
    res.status(400).json({ error: "pcode and displayName are required" });
    return;
  }
  const [material] = await db
    .insert(materialsTable)
    .values({ pcode: pcode.toUpperCase(), displayName, notes })
    .returning();
  res.status(201).json(material);
});

router.put("/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { pcode, displayName, notes } = req.body as {
    pcode?: string;
    displayName?: string;
    notes?: string;
  };
  const updates: Partial<typeof materialsTable.$inferInsert> = {};
  if (pcode !== undefined) updates.pcode = pcode.toUpperCase();
  if (displayName !== undefined) updates.displayName = displayName;
  if (notes !== undefined) updates.notes = notes;

  const [material] = await db
    .update(materialsTable)
    .set(updates)
    .where(eq(materialsTable.id, id))
    .returning();
  if (!material) {
    res.status(404).json({ error: "Material not found" });
    return;
  }
  res.json(material);
});

router.delete("/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [deleted] = await db
    .delete(materialsTable)
    .where(eq(materialsTable.id, id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Material not found" });
    return;
  }
  res.status(204).end();
});

export default router;
