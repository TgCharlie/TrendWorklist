import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

const dbPath = process.env.SQLITE_DB_PATH ?? path.join(process.cwd(), "cnc-worklist.db");

export const client = new BetterSqlite3(dbPath);

client.pragma("journal_mode = WAL");
client.pragma("foreign_keys = ON");

export const db = drizzle(client, { schema });

export const pool = {
  query: async (_text: string, _values?: unknown[]) => ({ rows: [] as unknown[] }),
  end: async () => {},
};

export * from "./schema";
