import bcrypt from "bcryptjs";
import { db, usersTable, folderSequencesTable, worklistSequenceTable, pool } from "@workspace/db";
import { count } from "drizzle-orm";
import { logger } from "./logger";

async function ensureSessionsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid varchar NOT NULL COLLATE "default",
      sess json NOT NULL,
      expire timestamp(6) NOT NULL,
      CONSTRAINT sessions_pkey PRIMARY KEY (sid)
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions (expire);
  `);
}

async function ensureStockbookColumns(): Promise<void> {
  await pool.query(`
    ALTER TABLE stockbook
      ADD COLUMN IF NOT EXISTS cost REAL,
      ADD COLUMN IF NOT EXISTS cost_sub REAL,
      ADD COLUMN IF NOT EXISTS image TEXT;
  `);
}

export async function seedDatabase(): Promise<void> {
  await ensureSessionsTable();
  await ensureStockbookColumns();

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

  // Ensure folder sequence rows exist for B and C machines
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

  // Ensure worklist sequence row exists (pre-create so UPDATE ... RETURNING is safe)
  const [{ count: seqCount }] = await db
    .select({ count: count() })
    .from(worklistSequenceTable);

  if (Number(seqCount) === 0) {
    await db.insert(worklistSequenceTable).values({ lastNumber: 0 });
    logger.info("Seeded worklist sequence (starting at 1)");
  }
}
