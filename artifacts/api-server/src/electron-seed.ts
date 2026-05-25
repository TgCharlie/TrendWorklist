import bcrypt from "bcryptjs";
import { db, client, usersTable, folderSequencesTable, worklistSequenceTable } from "@workspace/db";
import { count } from "drizzle-orm";
import { logger } from "./lib/logger";

function createTables(): void {
  client.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      pin_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operator',
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pcode TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      length INTEGER,
      width INTEGER,
      thickness INTEGER,
      notes TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS worklists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worklist_number TEXT NOT NULL UNIQUE,
      project_id TEXT,
      project_number TEXT,
      project_address TEXT,
      cutlist_refs TEXT DEFAULT '[]',
      machine_type TEXT NOT NULL,
      folder_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_by INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS worklist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worklist_id INTEGER NOT NULL REFERENCES worklists(id) ON DELETE CASCADE,
      material_id INTEGER REFERENCES materials(id) ON DELETE SET NULL,
      pcode TEXT,
      display_name TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      length TEXT,
      width TEXT,
      thickness TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS worklist_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worklist_id INTEGER NOT NULL REFERENCES worklists(id) ON DELETE CASCADE,
      folder_reference TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      created_by INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_worklist_folders_worklist_id
      ON worklist_folders (worklist_id);

    CREATE TABLE IF NOT EXISTS folder_sequences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_type TEXT NOT NULL UNIQUE,
      last_number INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS worklist_sequence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      last_number INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS user_favourites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(user_id, material_id)
    );

    CREATE TABLE IF NOT EXISTS stockbook (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pcode TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      qty_on_hand REAL NOT NULL DEFAULT 0,
      cost REAL,
      cost_sub REAL,
      unit TEXT,
      location TEXT,
      otype TEXT,
      project TEXT,
      pid TEXT,
      image TEXT,
      tag_stock_tracked INTEGER NOT NULL DEFAULT 1,
      last_synced_at INTEGER,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  // Safe migration helper — only ALTER TABLE if the column is missing.
  function addColumnIfMissing(table: string, column: string, def: string) {
    const info = client.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    const exists = info.some((c) => c.name === column);
    if (!exists) {
      try {
        client.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
        logger.info(`Migration: added column ${table}.${column}`);
      } catch (err) {
        logger.error({ err }, `Migration failed: could not add ${table}.${column}`);
      }
    }
  }

  addColumnIfMissing("stockbook", "cost", "REAL");
  addColumnIfMissing("stockbook", "cost_sub", "REAL");
  addColumnIfMissing("stockbook", "otype", "TEXT");
  addColumnIfMissing("stockbook", "project", "TEXT");
  addColumnIfMissing("stockbook", "pid", "TEXT");
  addColumnIfMissing("stockbook", "image", "TEXT");
  addColumnIfMissing("stockbook", "tag_stock_tracked", "INTEGER NOT NULL DEFAULT 1");
}

export async function seedDatabase(): Promise<void> {
  createTables();

  const [{ count: userCount }] = await db
    .select({ count: count() })
    .from(usersTable);

  if (Number(userCount) === 0) {
    const pinHash = await bcrypt.hash("0000", 10);
    await db.insert(usersTable).values({
      username: "admin",
      pinHash,
      role: "admin",
      active: true,
    });
    logger.info("Seeded default admin user (username: admin, pin: 0000)");
  }

  const [{ count: folderCount }] = await db
    .select({ count: count() })
    .from(folderSequencesTable);

  if (Number(folderCount) === 0) {
    await db.insert(folderSequencesTable).values([
      { machineType: "B", lastNumber: 0 },
      { machineType: "C", lastNumber: 0 },
    ]);
    logger.info("Seeded folder sequences for machines B and C");
  }

  const [{ count: seqCount }] = await db
    .select({ count: count() })
    .from(worklistSequenceTable);

  if (Number(seqCount) === 0) {
    await db.insert(worklistSequenceTable).values({ lastNumber: 0 });
    logger.info("Seeded worklist sequence (starting at 1)");
  }
}
