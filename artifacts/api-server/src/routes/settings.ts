import { Router } from "express";
import { requireAdmin } from "../lib/auth-middleware";
import { getAllSettings, setSettings } from "../lib/settings";
import { db, worklistSequenceTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const ALLOWED_KEYS = [
  "filemaker_server_url",
  "filemaker_database",
  "filemaker_username",
  "filemaker_password",
  "csv_server_path",
  "worklist_start_number",
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

router.put("/", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body as Record<string, string | number>;
  const updates: Record<string, string> = {};

  for (const key of ALLOWED_KEYS) {
    if (body[key] !== undefined) {
      updates[key] = String(body[key]);
    }
  }

  if (updates.worklist_start_number !== undefined) {
    const startNumber = Math.max(1, parseInt(updates.worklist_start_number, 10) || 1);
    const seqRows = await db.select().from(worklistSequenceTable).limit(1);
    if (seqRows.length === 0) {
      // No sequence row yet — setting will be used on first worklist creation
    } else {
      // Override the sequence counter to the new start value (minus 1 so next will be startNumber)
      await db
        .update(worklistSequenceTable)
        .set({ lastNumber: startNumber - 1 })
        .where(eq(worklistSequenceTable.id, seqRows[0].id));
    }
    updates.worklist_start_number = String(startNumber);
  }

  await setSettings(updates);
  const settings = await getAllSettings();
  res.json(sanitizeSettings(settings));
});

export default router;
