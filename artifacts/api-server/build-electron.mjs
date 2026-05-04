/**
 * Builds the Express API server as a self-contained CJS bundle for the
 * Electron desktop app.  @workspace/db is aliased to lib/db-sqlite so
 * the bundle uses SQLite (better-sqlite3) instead of PostgreSQL.
 * better-sqlite3 is kept external — electron-builder rebuilds it for
 * the correct Electron ABI on the target platform.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm, mkdir } from "node:fs/promises";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(artifactDir, "../..");
const outDir = path.resolve(workspaceRoot, "cnc-worklist-electron/api");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await esbuild({
  entryPoints: [path.resolve(artifactDir, "src/electron-index.ts")],
  platform: "node",
  bundle: true,
  format: "cjs",
  outdir: outDir,
  outExtension: { ".js": ".js" },
  entryNames: "[name]",
  logLevel: "info",
  alias: {
    "@workspace/db": path.resolve(workspaceRoot, "lib/db-sqlite/src/index.ts"),
  },
  external: [
    "*.node",
    "better-sqlite3",
    "bcrypt",
    "fsevents",
    "re2",
    "bufferutil",
    "utf-8-validate",
    "electron",
    "undici",
    "node:http",
    "node:https",
    "node:net",
    "node:tls",
    "node:stream",
    "node:crypto",
    "node:zlib",
    "node:url",
    "node:util",
    "node:events",
    "node:buffer",
    "node:path",
    "node:fs",
    "node:os",
  ],
  sourcemap: false,
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
});

console.log("✓ Electron API bundle written to", outDir);
