import { Router } from "express";
import {
  db,
  worklistsTable,
  worklistItemsTable,
  worklistSequenceTable,
  folderSequencesTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth-middleware";
import { getSetting } from "../lib/settings";

const router = Router();

async function getNextWorklistNumber(): Promise<{ number: number; formatted: string }> {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(worklistSequenceTable).limit(1);
    if (rows.length === 0) {
      const startStr = await getSetting("worklist_start_number");
      const start = Math.max(1, parseInt(startStr, 10) || 1);
      await tx.insert(worklistSequenceTable).values({ lastNumber: start });
      return { number: start, formatted: `W${String(start).padStart(6, "0")}` };
    }
    const current = rows[0];
    const next = current.lastNumber + 1;
    await tx
      .update(worklistSequenceTable)
      .set({ lastNumber: next })
      .where(eq(worklistSequenceTable.id, current.id));
    return { number: next, formatted: `W${String(next).padStart(6, "0")}` };
  });
}

async function getNextFolderNumber(machineType: "B" | "C"): Promise<{ number: number; formatted: string }> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(folderSequencesTable)
      .where(eq(folderSequencesTable.machineType, machineType))
      .limit(1);

    if (rows.length === 0) {
      await tx.insert(folderSequencesTable).values({ machineType, lastNumber: 1 });
      return { number: 1, formatted: `${machineType}0001` };
    }
    const current = rows[0];
    const next = current.lastNumber + 1;
    await tx
      .update(folderSequencesTable)
      .set({ lastNumber: next })
      .where(eq(folderSequencesTable.id, current.id));
    return { number: next, formatted: `${machineType}${String(next).padStart(4, "0")}` };
  });
}

router.get("/", requireAuth, async (req, res): Promise<void> => {
  const worklists = await db
    .select()
    .from(worklistsTable)
    .orderBy(desc(worklistsTable.createdAt));
  res.json(worklists);
});

router.get("/stats", requireAuth, async (req, res): Promise<void> => {
  const worklists = await db.select().from(worklistsTable);
  const total = worklists.length;
  const byStatus = worklists.reduce<Record<string, number>>((acc, w) => {
    acc[w.status] = (acc[w.status] ?? 0) + 1;
    return acc;
  }, {});
  res.json({ total, byStatus });
});

router.get("/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [worklist] = await db
    .select()
    .from(worklistsTable)
    .where(eq(worklistsTable.id, id))
    .limit(1);
  if (!worklist) {
    res.status(404).json({ error: "Worklist not found" });
    return;
  }
  const items = await db
    .select()
    .from(worklistItemsTable)
    .where(eq(worklistItemsTable.worklistId, id));
  res.json({ ...worklist, items });
});

router.post("/", requireAuth, async (req, res): Promise<void> => {
  const { projectId, projectAddress, cutlistRefs, machineType } = req.body as {
    projectId?: string;
    projectAddress?: string;
    cutlistRefs?: string[];
    machineType?: "B" | "C";
  };

  if (!machineType || !["B", "C"].includes(machineType)) {
    res.status(400).json({ error: "machineType must be B or C" });
    return;
  }

  const { formatted: worklistNumber } = await getNextWorklistNumber();
  const { number: folderNumber } = await getNextFolderNumber(machineType);

  const [worklist] = await db
    .insert(worklistsTable)
    .values({
      worklistNumber,
      projectId: projectId ?? null,
      projectAddress: projectAddress ?? null,
      cutlistRefs: cutlistRefs ?? [],
      machineType,
      folderNumber,
      status: "draft",
      createdBy: req.session.userId ?? null,
    })
    .returning();

  res.status(201).json(worklist);
});

router.put("/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { projectId, projectAddress, cutlistRefs, status } = req.body as {
    projectId?: string;
    projectAddress?: string;
    cutlistRefs?: string[];
    status?: "draft" | "submitted" | "completed";
  };

  const updates: Partial<typeof worklistsTable.$inferInsert> = {};
  if (projectId !== undefined) updates.projectId = projectId;
  if (projectAddress !== undefined) updates.projectAddress = projectAddress;
  if (cutlistRefs !== undefined) updates.cutlistRefs = cutlistRefs;
  if (status !== undefined) updates.status = status;

  const [worklist] = await db
    .update(worklistsTable)
    .set(updates)
    .where(eq(worklistsTable.id, id))
    .returning();
  if (!worklist) {
    res.status(404).json({ error: "Worklist not found" });
    return;
  }
  res.json(worklist);
});

router.delete("/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [deleted] = await db
    .delete(worklistsTable)
    .where(eq(worklistsTable.id, id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Worklist not found" });
    return;
  }
  res.json({ ok: true });
});

router.post("/:id/items", requireAuth, async (req, res): Promise<void> => {
  const worklistId = Number(req.params.id);
  const { materialId, pcode, displayName, quantity, length, width, notes } = req.body as {
    materialId?: number;
    pcode?: string;
    displayName?: string;
    quantity?: number;
    length?: string;
    width?: string;
    notes?: string;
  };

  const [item] = await db
    .insert(worklistItemsTable)
    .values({
      worklistId,
      materialId: materialId ?? null,
      pcode: pcode || null,
      displayName: displayName || null,
      quantity: quantity ?? 1,
      length: length || null,
      width: width || null,
      notes: notes || null,
    })
    .returning();
  res.status(201).json(item);
});

router.put("/:id/items/:itemId", requireAuth, async (req, res): Promise<void> => {
  const itemId = Number(req.params.itemId);
  const { materialId, pcode, displayName, quantity, length, width, notes } = req.body as {
    materialId?: number | null;
    pcode?: string;
    displayName?: string;
    quantity?: number;
    length?: string | null;
    width?: string | null;
    notes?: string;
  };

  const updates: Partial<typeof worklistItemsTable.$inferInsert> = {};
  if (materialId !== undefined) updates.materialId = materialId;
  if (pcode !== undefined) updates.pcode = pcode;
  if (displayName !== undefined) updates.displayName = displayName;
  if (quantity !== undefined) updates.quantity = quantity;
  if (length !== undefined) updates.length = length || null;
  if (width !== undefined) updates.width = width || null;
  if (notes !== undefined) updates.notes = notes;

  const [item] = await db
    .update(worklistItemsTable)
    .set(updates)
    .where(eq(worklistItemsTable.id, itemId))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.json(item);
});

router.delete("/:id/items/:itemId", requireAuth, async (req, res): Promise<void> => {
  const itemId = Number(req.params.itemId);
  const [deleted] = await db
    .delete(worklistItemsTable)
    .where(eq(worklistItemsTable.id, itemId))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  res.json({ ok: true });
});

router.get("/:id/csv", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [worklist] = await db
    .select()
    .from(worklistsTable)
    .where(eq(worklistsTable.id, id))
    .limit(1);
  if (!worklist) {
    res.status(404).json({ error: "Worklist not found" });
    return;
  }
  const items = await db
    .select()
    .from(worklistItemsTable)
    .where(eq(worklistItemsTable.worklistId, id));

  const folderRef = `${worklist.machineType}${String(worklist.folderNumber).padStart(4, "0")}`;

  const csvLines: string[] = [
    `Worklist Number,${worklist.worklistNumber}`,
    `Folder Reference,${folderRef}`,
    `Machine Type,${worklist.machineType}`,
    `Project ID,${worklist.projectId ?? ""}`,
    `Project Address,${worklist.projectAddress ?? ""}`,
    `Status,${worklist.status}`,
    `Created At,${worklist.createdAt.toISOString()}`,
    "",
    "PCODE,Description,Quantity,Length,Width,Notes",
    ...items.map((item) =>
      [
        item.pcode ?? "",
        item.displayName ?? "",
        item.quantity,
        item.length ?? "",
        item.width ?? "",
        item.notes ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    ),
  ];

  const csvContent = csvLines.join("\r\n");
  const filename = `${worklist.worklistNumber}-${folderRef}.csv`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csvContent);
});

export default router;
