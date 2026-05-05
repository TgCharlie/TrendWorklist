import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

// Stub for TypeScript compatibility with electron-seed.ts.
// In the Electron build, esbuild aliases @workspace/db → lib/db-sqlite
// which exports the real BetterSqlite3 client with a working .exec() method.
// This stub is never called at runtime in the normal (PostgreSQL) server.
export const client: { exec: (sql: string) => void } = {
  exec: (_sql: string) => {
    throw new Error("client.exec() is only available in the Electron (SQLite) build");
  },
};

export * from "./schema";
