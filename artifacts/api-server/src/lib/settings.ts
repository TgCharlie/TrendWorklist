import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const DEFAULTS: Record<string, string> = {
  filemaker_server_url: "",
  filemaker_database: "",
  filemaker_username: "",
  filemaker_password: "",
  csv_server_path: "",
  worklist_start_number: "1",
};

export async function getSetting(key: string): Promise<string> {
  const row = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, key))
    .limit(1);
  return row[0]?.value ?? DEFAULTS[key] ?? "";
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(appSettingsTable);
  const result: Record<string, string> = { ...DEFAULTS };
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target: appSettingsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function setSettings(updates: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(updates)) {
    await setSetting(key, value);
  }
}
