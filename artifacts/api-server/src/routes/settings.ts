import { Router } from "express";
import fs from "fs";
import { requireAdmin } from "../lib/auth-middleware";
import { getAllSettings, setSettings } from "../lib/settings";
import { db, worklistSequenceTable, worklistsTable, folderSequencesTable } from "@workspace/db";
import { count, eq } from "drizzle-orm";

const router = Router();

const ALLOWED_KEYS = [
  "filemaker_server_url",
  "filemaker_database",
  "filemaker_username",
  "filemaker_password",
  "filemaker_allow_self_signed",
  "csv_server_path",
  "folder_base_path",
  "worklist_start_number",
  "folder_start_number_B",
  "folder_start_number_C",
];

function sanitizeSettings(settings: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of ALLOWED_KEYS) {
    result[key] = settings[key] ?? "";
  }
  if (result.filemaker_password) {
    result.filemaker_password = "***";
  }
  return result;
}

router.get("/", requireAdmin, async (req, res): Promise<void> => {
  const settings = await getAllSettings();
  res.json(sanitizeSettings(settings));
});

router.get("/validate-folder-path", requireAdmin, async (req, res): Promise<void> => {
  const p = typeof req.query.path === "string" ? req.query.path.trim() : "";
  if (!p) {
    res.json({ valid: false, reason: "No path provided" });
    return;
  }
  try {
    const exists = fs.existsSync(p);
    if (!exists) {
      res.json({ valid: false, reason: "Path does not exist on the server" });
      return;
    }
    const stat = fs.statSync(p);
    if (!stat.isDirectory()) {
      res.json({ valid: false, reason: "Path exists but is not a directory" });
      return;
    }
    res.json({ valid: true });
  } catch (err) {
    res.json({ valid: false, reason: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.get("/next-folder-numbers", requireAdmin, async (req, res): Promise<void> => {
  const settings = await getAllSettings();
  const result: Record<string, { nextNumber: number; formatted: string; foldersExist: boolean }> = {};
  for (const machineType of ["B", "C"] as const) {
    const [seqRow] = await db
      .select()
      .from(folderSequencesTable)
      .where(eq(folderSequencesTable.machineType, machineType))
      .limit(1);
    const startNumber = parseInt(settings[`folder_start_number_${machineType}`] || "1", 10) || 1;
    const lastNumber = seqRow?.lastNumber ?? 0;
    const nextNumber = lastNumber > 0 ? lastNumber + 1 : startNumber;
    result[machineType] = {
      nextNumber,
      formatted: `${machineType}${String(nextNumber).padStart(4, "0")}`,
      foldersExist: lastNumber > 0,
    };
  }
  res.json(result);
});

router.get("/next-worklist-number", requireAdmin, async (req, res): Promise<void> => {
  const seqRows = await db.select().from(worklistSequenceTable).limit(1);
  const settings = await getAllSettings();
  const lastNumber = seqRows.length > 0 ? seqRows[0].lastNumber : 0;
  const startNumber = parseInt(settings.worklist_start_number || "1", 10) || 1;
  const nextNumber = lastNumber > 0 ? lastNumber + 1 : startNumber;
  const [{ count: worklistCount }] = await db.select({ count: count() }).from(worklistsTable);
  res.json({
    nextNumber,
    formatted: `W${String(nextNumber).padStart(6, "0")}`,
    worklistsExist: Number(worklistCount) > 0,
  });
});

router.put("/", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body as Record<string, string | number | boolean>;
  const forceOverride = body.force_override === true;
  const forceOverrideFolders = body.force_override_folders === true || forceOverride;
  const updates: Record<string, string> = {};

  for (const key of ALLOWED_KEYS) {
    if (body[key] !== undefined) {
      updates[key] = String(body[key]);
    }
  }

  if (updates.worklist_start_number !== undefined) {
    const startNumber = Math.max(1, parseInt(updates.worklist_start_number, 10) || 1);

    const [{ count: worklistCount }] = await db.select({ count: count() }).from(worklistsTable);
    const worklistsExist = Number(worklistCount) > 0;

    if (!worklistsExist || forceOverride) {
      // Apply the override: reset sequence so the next worklist gets startNumber
      const seqRows = await db.select().from(worklistSequenceTable).limit(1);
      if (seqRows.length === 0) {
        // Sequence not created yet — just save the setting, it will be used on first creation
      } else {
        await db
          .update(worklistSequenceTable)
          .set({ lastNumber: startNumber - 1 })
          .where(eq(worklistSequenceTable.id, seqRows[0].id));
      }
      updates.worklist_start_number = String(startNumber);
    } else {
      // Worklists exist and no force_override — ignore the start number change
      delete updates.worklist_start_number;
    }
  }

  // Handle per-machine folder start numbers — mirrors worklist_start_number semantics:
  // applied (and sequence reset) when no folders have been issued for that machine OR
  // force_override is set; ignored (not saved) when folders already exist without force_override.
  for (const machineType of ["B", "C"] as const) {
    const key = `folder_start_number_${machineType}` as const;
    if (updates[key] !== undefined) {
      const startNumber = Math.max(1, parseInt(updates[key], 10) || 1);

      // Use folder_sequences.lastNumber as the canonical indicator of whether folders
      // have been issued for this machine (lastNumber > 0 means at least one folder created).
      const [seqRow] = await db
        .select()
        .from(folderSequencesTable)
        .where(eq(folderSequencesTable.machineType, machineType))
        .limit(1);

      const foldersExist = seqRow ? seqRow.lastNumber > 0 : false;

      if (!foldersExist || forceOverrideFolders) {
        if (seqRow) {
          await db
            .update(folderSequencesTable)
            .set({ lastNumber: startNumber - 1 })
            .where(eq(folderSequencesTable.machineType, machineType));
        }
        updates[key] = String(startNumber);
      } else {
        // Folders have been issued and no force_override — ignore the start number change
        delete updates[key];
      }
    }
  }

  await setSettings(updates);
  const settings = await getAllSettings();
  res.json(sanitizeSettings(settings));
});

export default router;
