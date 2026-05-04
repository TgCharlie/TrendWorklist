/**
 * Convenience wrapper — delegates to the pnpm workspace script in
 * artifacts/api-server which has access to esbuild.
 *
 * Usage (from workspace root):
 *   pnpm --filter @workspace/api-server run build:electron
 *
 * Or directly from the workspace root:
 *   node build-api.mjs   ← runs the pnpm command for you
 */
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

execSync("pnpm --filter @workspace/api-server run build:electron", {
  cwd: root,
  stdio: "inherit",
});
