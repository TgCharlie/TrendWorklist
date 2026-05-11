import { Router } from "express";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import {
  db,
  worklistsTable,
  worklistItemsTable,
  worklistSequenceTable,
  folderSequencesTable,
  worklistFoldersTable,
} from "@workspace/db";
import { eq, desc, sql, count, asc } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { getSetting } from "../lib/settings";

const router = Router();

function folderRef(machineType: string, folderNumber: number): string {
  return `${machineType}${String(folderNumber).padStart(4, "0")}`;
}

router.get("/", requireAuth, async (req, res): Promise<void> => {
  const worklists = await db
    .select()
    .from(worklistsTable)
    .orderBy(desc(worklistsTable.createdAt));

  const itemCounts = await db
    .select({
      worklistId: worklistItemsTable.worklistId,
      count: count(),
    })
    .from(worklistItemsTable)
    .groupBy(worklistItemsTable.worklistId);

  const countMap = new Map(itemCounts.map((r) => [r.worklistId, Number(r.count)]));

  const result = worklists.map((w) => ({
    ...w,
    folderRef: folderRef(w.machineType, w.folderNumber),
    itemCount: countMap.get(w.id) ?? 0,
  }));

  res.json(result);
});

router.get("/stats", requireAuth, async (req, res): Promise<void> => {
  const worklists = await db.select().from(worklistsTable);
  const total = worklists.length;
  const byStatus = worklists.reduce<Record<string, number>>((acc, w) => {
    acc[w.status] = (acc[w.status] ?? 0) + 1;
    return acc;
  }, {});

  const seqRows = await db.select().from(worklistSequenceTable).limit(1);
  let nextNumber = 1;
  if (seqRows.length > 0) {
    nextNumber = seqRows[0].lastNumber + 1;
  } else {
    const startStr = await getSetting("worklist_start_number");
    nextNumber = Math.max(1, parseInt(startStr, 10) || 1);
  }

  res.json({
    total,
    byStatus,
    nextWorklistNumber: `W${String(nextNumber).padStart(6, "0")}`,
  });
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

  res.json({
    ...worklist,
    folderRef: folderRef(worklist.machineType, worklist.folderNumber),
    itemCount: items.length,
    items,
  });
});

router.post("/", requireAuth, async (req, res): Promise<void> => {
  const { projectId, projectNumber, projectAddress, cutlistRefs, machineType } = req.body as {
    projectId?: string;
    projectNumber?: string;
    projectAddress?: string;
    cutlistRefs?: string[];
    machineType?: "B" | "C";
  };

  if (!machineType || !["B", "C"].includes(machineType)) {
    res.status(400).json({ error: "machineType must be B or C" });
    return;
  }

  const createdBy = req.session.userId ?? null;

  const [worklist] = await db.transaction(async (tx) => {
    const [seqRow] = await tx
      .update(worklistSequenceTable)
      .set({ lastNumber: sql`${worklistSequenceTable.lastNumber} + 1` })
      .returning({ lastNumber: worklistSequenceTable.lastNumber });

    if (!seqRow) {
      throw new Error("Worklist sequence row missing — database not seeded correctly");
    }
    const worklistNumber = `W${String(seqRow.lastNumber).padStart(6, "0")}`;

    const [folderRow] = await tx
      .update(folderSequencesTable)
      .set({ lastNumber: sql`${folderSequencesTable.lastNumber} + 1` })
      .where(eq(folderSequencesTable.machineType, machineType))
      .returning({ lastNumber: folderSequencesTable.lastNumber });

    if (!folderRow) {
      throw new Error(`Folder sequence row missing for machine ${machineType}`);
    }
    const folderNumber = folderRow.lastNumber;

    return tx
      .insert(worklistsTable)
      .values({
        worklistNumber,
        projectId: projectId || null,
        projectNumber: projectNumber || null,
        projectAddress: projectAddress || null,
        cutlistRefs: cutlistRefs ?? [],
        machineType,
        folderNumber,
        status: "draft",
        createdBy,
      })
      .returning();
  });

  res.status(201).json({
    ...worklist,
    folderRef: folderRef(worklist.machineType, worklist.folderNumber),
    itemCount: 0,
  });
});

router.put("/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { projectId, projectNumber, projectAddress, cutlistRefs, status } = req.body as {
    projectId?: string;
    projectNumber?: string;
    projectAddress?: string;
    cutlistRefs?: string[];
    status?: "draft" | "active" | "complete";
  };

  const updates: Partial<typeof worklistsTable.$inferInsert> = {};
  if (projectId !== undefined) updates.projectId = projectId;
  if (projectNumber !== undefined) updates.projectNumber = projectNumber;
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

  const items = await db
    .select()
    .from(worklistItemsTable)
    .where(eq(worklistItemsTable.worklistId, id));

  res.json({
    ...worklist,
    folderRef: folderRef(worklist.machineType, worklist.folderNumber),
    itemCount: items.length,
  });
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
  res.status(204).end();
});

router.post("/:id/items", requireAuth, async (req, res): Promise<void> => {
  const worklistId = Number(req.params.id);
  const { materialId, pcode, displayName, quantity, length, width, thickness, notes } = req.body as {
    materialId?: number | null;
    pcode?: string;
    displayName?: string;
    quantity?: number;
    length?: number | string | null;
    width?: number | string | null;
    thickness?: number | string | null;
    notes?: string;
  };

  const toNum = (v: number | string | null | undefined) =>
    v !== undefined && v !== "" && v !== null ? String(v) : null;

  const [item] = await db
    .insert(worklistItemsTable)
    .values({
      worklistId,
      materialId: materialId ?? null,
      pcode: pcode || null,
      displayName: displayName || null,
      quantity: quantity ?? 1,
      length: toNum(length),
      width: toNum(width),
      thickness: toNum(thickness),
      notes: notes || null,
    })
    .returning();
  res.status(201).json(item);
});

router.put("/:id/items/:itemId", requireAuth, async (req, res): Promise<void> => {
  const itemId = Number(req.params.itemId);
  const { materialId, pcode, displayName, quantity, length, width, thickness, notes } = req.body as {
    materialId?: number | null;
    pcode?: string;
    displayName?: string;
    quantity?: number;
    length?: number | string | null;
    width?: number | string | null;
    thickness?: number | string | null;
    notes?: string | null;
  };

  const toNum = (v: number | string | null | undefined) =>
    v !== "" && v !== null ? String(v) : null;

  const updates: Partial<typeof worklistItemsTable.$inferInsert> = {};
  if (materialId !== undefined) updates.materialId = materialId;
  if (pcode !== undefined) updates.pcode = pcode || null;
  if (displayName !== undefined) updates.displayName = displayName || null;
  if (quantity !== undefined) updates.quantity = quantity;
  if (length !== undefined) updates.length = toNum(length);
  if (width !== undefined) updates.width = toNum(width);
  if (thickness !== undefined) updates.thickness = toNum(thickness);
  if (notes !== undefined) updates.notes = notes || null;

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
  res.status(204).end();
});

router.get("/:id/folders", requireAuth, async (req, res): Promise<void> => {
  const worklistId = Number(req.params.id);
  const [worklist] = await db
    .select({ id: worklistsTable.id })
    .from(worklistsTable)
    .where(eq(worklistsTable.id, worklistId))
    .limit(1);
  if (!worklist) {
    res.status(404).json({ error: "Worklist not found" });
    return;
  }
  const folders = await db
    .select()
    .from(worklistFoldersTable)
    .where(eq(worklistFoldersTable.worklistId, worklistId))
    .orderBy(asc(worklistFoldersTable.createdAt));
  res.json(folders);
});

router.post("/:id/folders", requireAuth, async (req, res): Promise<void> => {
  const worklistId = Number(req.params.id);

  const [worklist] = await db
    .select()
    .from(worklistsTable)
    .where(eq(worklistsTable.id, worklistId))
    .limit(1);

  if (!worklist) {
    res.status(404).json({ error: "Worklist not found" });
    return;
  }

  const folderBasePath = await getSetting("folder_base_path");
  if (!folderBasePath || !folderBasePath.trim()) {
    res.status(400).json({
      error: "Folder base path is not configured. Please set it in Admin Portal > Settings.",
    });
    return;
  }

  try {
    const [folder] = await db.transaction(async (tx) => {
      const [folderRow] = await tx
        .update(folderSequencesTable)
        .set({ lastNumber: sql`${folderSequencesTable.lastNumber} + 1` })
        .where(eq(folderSequencesTable.machineType, worklist.machineType))
        .returning({ lastNumber: folderSequencesTable.lastNumber });

      if (!folderRow) {
        throw new Error(`Folder sequence not initialised for machine ${worklist.machineType} — contact an administrator.`);
      }

      const reference = `${worklist.machineType}${String(folderRow.lastNumber).padStart(4, "0")}`;
      const folderPath = path.join(folderBasePath.trim(), reference);

      if (fs.existsSync(folderPath)) {
        throw new Error(
          `Folder "${reference}" already exists at "${folderPath}". This may indicate a sequence reset — contact an administrator.`,
        );
      }

      const [inserted] = await tx
        .insert(worklistFoldersTable)
        .values({
          worklistId,
          folderReference: reference,
          createdBy: req.session.userId ?? null,
        })
        .returning();

      return [inserted, folderPath] as const;
    });

    const [inserted, folderPath] = folder;
    let diskWarning: string | undefined;
    try {
      fs.mkdirSync(folderBasePath.trim(), { recursive: true });
      fs.mkdirSync(folderPath as string);
    } catch (fsErr) {
      diskWarning = fsErr instanceof Error ? fsErr.message : String(fsErr);
    }

    res.status(201).json({ ...inserted, diskWarning });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create folder";
    res.status(500).json({ error: message });
  }
});

router.post("/:id/folders/:folderId/open", requireAuth, async (req, res): Promise<void> => {
  const worklistId = Number(req.params.id);
  const folderId = Number(req.params.folderId);

  const [folder] = await db
    .select()
    .from(worklistFoldersTable)
    .where(eq(worklistFoldersTable.id, folderId))
    .limit(1);

  if (!folder || folder.worklistId !== worklistId) {
    res.status(404).json({ error: "Folder not found" });
    return;
  }

  const folderBasePath = await getSetting("folder_base_path");
  if (!folderBasePath || !folderBasePath.trim()) {
    res.status(400).json({ error: "Folder base path is not configured." });
    return;
  }

  const folderPath = path.join(folderBasePath.trim(), folder.folderReference);

  if (!fs.existsSync(folderPath)) {
    res.status(404).json({ error: `Folder path does not exist on disk: ${folderPath}` });
    return;
  }

  const platform = process.platform;

  if (platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    res.json({ opened: false, path: folderPath });
    return;
  }

  const cmd =
    platform === "win32"
      ? `explorer "${folderPath}"`
      : platform === "darwin"
        ? `open "${folderPath}"`
        : `xdg-open "${folderPath}"`;

  exec(cmd, (err) => {
    if (err) {
      res.json({ opened: false, path: folderPath });
    } else {
      res.json({ opened: true, path: folderPath });
    }
  });
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

  const ref = folderRef(worklist.machineType, worklist.folderNumber);

  const csvLines: string[] = [
    `Worklist Number,${worklist.worklistNumber}`,
    `Folder Reference,${ref}`,
    `Machine Type,${worklist.machineType}`,
    `Project ID,${worklist.projectId ?? ""}`,
    `Project Number,${worklist.projectNumber ?? ""}`,
    `Project Address,${worklist.projectAddress ?? ""}`,
    `Status,${worklist.status}`,
    `Created At,${worklist.createdAt.toISOString()}`,
    "",
    "PCODE,Description,Quantity,Length,Width,Thickness,Notes",
    ...items.map((item) =>
      [
        item.pcode ?? "",
        item.displayName ?? "",
        item.quantity,
        item.length ?? "",
        item.width ?? "",
        item.thickness ?? "",
        item.notes ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    ),
  ];

  const csvContent = csvLines.join("\r\n");
  const filename = `${worklist.worklistNumber}-${ref}.csv`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csvContent);
});

export default router;
