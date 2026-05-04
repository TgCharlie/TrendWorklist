import { Router } from "express";
import { db, materialsTable, userFavouritesTable } from "@workspace/db";
import { eq, or, like, and, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth-middleware";
import { getStockLevel } from "../lib/filemaker";

const router = Router();

async function withFavourites(
  materials: (typeof materialsTable.$inferSelect)[],
  userId: number,
) {
  if (materials.length === 0) return materials.map((m) => ({ ...m, isFavourite: false }));
  const materialIds = materials.map((m) => m.id);
  const favRows = await db
    .select({ materialId: userFavouritesTable.materialId })
    .from(userFavouritesTable)
    .where(
      and(
        eq(userFavouritesTable.userId, userId),
        inArray(userFavouritesTable.materialId, materialIds),
      ),
    );
  const favSet = new Set(favRows.map((r) => r.materialId));
  return materials.map((m) => ({ ...m, isFavourite: favSet.has(m.id) }));
}

router.get("/", requireAuth, async (req, res): Promise<void> => {
  const search = req.query.search as string | undefined;
  const favouritesOnly = req.query.favouritesOnly === "true";
  const userId = req.session.userId as number;

  let rows: (typeof materialsTable.$inferSelect)[];

  if (favouritesOnly) {
    const favRows = await db
      .select({ materialId: userFavouritesTable.materialId })
      .from(userFavouritesTable)
      .where(eq(userFavouritesTable.userId, userId));
    const favIds = favRows.map((r) => r.materialId);
    if (favIds.length === 0) {
      res.json([]);
      return;
    }
    if (search) {
      rows = await db
        .select()
        .from(materialsTable)
        .where(
          and(
            inArray(materialsTable.id, favIds),
            or(
              like(materialsTable.displayName, `%${search}%`),
              like(materialsTable.pcode, `%${search}%`),
            ),
          ),
        );
    } else {
      rows = await db
        .select()
        .from(materialsTable)
        .where(inArray(materialsTable.id, favIds));
    }
  } else if (search) {
    rows = await db
      .select()
      .from(materialsTable)
      .where(
        or(
          like(materialsTable.displayName, `%${search}%`),
          like(materialsTable.pcode, `%${search}%`),
        ),
      );
  } else {
    rows = await db.select().from(materialsTable);
  }

  const result = await withFavourites(rows, userId);
  res.json(result);
});

router.get("/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = req.session.userId as number;
  const [material] = await db
    .select()
    .from(materialsTable)
    .where(eq(materialsTable.id, id))
    .limit(1);
  if (!material) {
    res.status(404).json({ error: "Material not found" });
    return;
  }
  const [result] = await withFavourites([material], userId);
  res.json(result);
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

router.post("/:id/favourite", requireAuth, async (req, res): Promise<void> => {
  const materialId = Number(req.params.id);
  const userId = req.session.userId as number;

  const [existing] = await db
    .select()
    .from(userFavouritesTable)
    .where(
      and(
        eq(userFavouritesTable.userId, userId),
        eq(userFavouritesTable.materialId, materialId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .delete(userFavouritesTable)
      .where(eq(userFavouritesTable.id, existing.id));
    res.json({ isFavourite: false, materialId });
  } else {
    await db.insert(userFavouritesTable).values({ userId, materialId });
    res.json({ isFavourite: true, materialId });
  }
});

router.post("/", requireAdmin, async (req, res): Promise<void> => {
  const { pcode, displayName, length, width, thickness, notes } = req.body as {
    pcode?: string;
    displayName?: string;
    length?: number | string;
    width?: number | string;
    thickness?: number | string;
    notes?: string;
  };
  if (!pcode || !displayName) {
    res.status(400).json({ error: "pcode and displayName are required" });
    return;
  }
  const [material] = await db
    .insert(materialsTable)
    .values({
      pcode: pcode.toUpperCase(),
      displayName,
      length: length !== undefined && length !== "" ? Number(length) : null,
      width: width !== undefined && width !== "" ? Number(width) : null,
      thickness: thickness !== undefined && thickness !== "" ? Number(thickness) : null,
      notes,
    })
    .returning();
  res.status(201).json({ ...material, isFavourite: false });
});

router.put("/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = req.session.userId as number;
  const { pcode, displayName, length, width, thickness, notes } = req.body as {
    pcode?: string;
    displayName?: string;
    length?: number | string | null;
    width?: number | string | null;
    thickness?: number | string | null;
    notes?: string;
  };
  const updates: Partial<typeof materialsTable.$inferInsert> = {};
  if (pcode !== undefined) updates.pcode = pcode.toUpperCase();
  if (displayName !== undefined) updates.displayName = displayName;
  if (length !== undefined) updates.length = length !== null && length !== "" ? Number(length) : null;
  if (width !== undefined) updates.width = width !== null && width !== "" ? Number(width) : null;
  if (thickness !== undefined) updates.thickness = thickness !== null && thickness !== "" ? Number(thickness) : null;
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
  const [result] = await withFavourites([material], userId);
  res.json(result);
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
