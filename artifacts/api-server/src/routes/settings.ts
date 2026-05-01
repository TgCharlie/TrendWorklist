import { Router } from "express";
import { requireAdmin } from "../lib/auth-middleware";
import { getAllSettings, setSettings } from "../lib/settings";
import { db, worklistSequenceTable } from "@workspace/db";
import { count } from "drizzle-orm";

const router = Router();

const ALLOWED_KEYS = [
  "filemaker_server_url",
  "filemaker_database",
  "filemaker_username",
  "filemaker_password",
  "csv_server_path",
  "worklist_start_number",
];

router.get("/", requireAdmin, async (req, res): Promise<void> => {
  const settings = await getAllSettings();
  const filtered: Record<string, string> = {};
  for (const key of ALLOWED_KEYS) {
    filtered[key] = settings[key] ?? "";
  }
  if (filtered.filemaker_password) {
    filtered.filemaker_password = "***";
  }
  res.json(filtered);
});

router.put("/", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body as Record<string, string>;
  const updates: Record<string, string> = {};

  for (const key of ALLOWED_KEYS) {
    if (body[key] !== undefined) {
      updates[key] = String(body[key]);
    }
  }

  if (updates.worklist_start_number !== undefined) {
    const [{ count: seqCount }] = await db
      .select({ count: count() })
      .from(worklistSequenceTable);
    if (Number(seqCount) > 0) {
      delete updates.worklist_start_number;
    }
  }

  await setSettings(updates);
  const settings = await getAllSettings();
  const result: Record<string, string> = {};
  for (const key of ALLOWED_KEYS) {
    result[key] = settings[key] ?? "";
  }
  if (result.filemaker_password) {
    result.filemaker_password = "***";
  }
  res.json(result);
});

export default router;
