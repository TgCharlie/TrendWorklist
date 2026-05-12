# CNC Worklist Manager

## Overview

A workshop management app for a cabinet/joinery workshop. Manages CNC cutting worklists with FileMaker Data API integration, sequential worklist and folder numbering, CSV export, and an admin portal.

Delivered as both a cloud-hosted web app (Replit) and a **self-contained Electron desktop app** that bundles the API server + SQLite database locally — allowing FileMaker sync to work over the local workshop network.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 (session-based auth)
- **Database**: PostgreSQL + Drizzle ORM (cloud) / SQLite + better-sqlite3 (Electron)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Frontend**: React + Vite + shadcn/ui + TailwindCSS
- **Auth**: Username + 4-digit PIN, bcrypt hashed, express-session

## Artifacts

| Artifact | Kind | Port | Preview Path |
|---------|------|------|------|
| `artifacts/api-server` | API | 8080 | /api |
| `artifacts/cnc-worklist` | Web | 20009 | / |

## Electron Desktop App

Location: `cnc-worklist-electron/`

### Architecture
- **`main.js`** — Electron entry: finds free port → sets env vars → `require('./api/electron-index.js')` → polls `/api/health` → loads `http://127.0.0.1:PORT` in BrowserWindow
- **`api/electron-index.js`** — CJS bundle of the full Express API server, built by esbuild, using SQLite instead of PostgreSQL
- **`dist/frontend/`** — built React app (Vite, BASE_PATH=/), served as static files by Express
- **SQLite database** — stored in `app.getPath('userData')/cnc-worklist.db`
- **Sessions** — in-memory (MemoryStore), fine for single-user desktop app

### Key packages
- `lib/db-sqlite/` — SQLite mirror of `lib/db` using `drizzle-orm/sqlite-core` + `better-sqlite3`
- `artifacts/api-server/src/electron-app.ts` — Electron-specific Express app (MemoryStore sessions, static file serving)
- `artifacts/api-server/src/electron-seed.ts` — Creates SQLite tables + seeds defaults (no PostgreSQL pool)
- `artifacts/api-server/src/electron-index.ts` — Entry point for the esbuild CJS bundle
- `artifacts/api-server/build-electron.mjs` — esbuild script (CJS output, aliases `@workspace/db` → `lib/db-sqlite`)

### Building the Electron API bundle
```bash
pnpm --filter @workspace/api-server run build:electron
```
This writes the CJS bundle to `cnc-worklist-electron/api/`.

### Building the frontend for Electron
```bash
PORT=1 BASE_PATH=/ pnpm --filter @workspace/cnc-worklist run build
# Then copy dist/public/ to cnc-worklist-electron/dist/frontend/
```

### GitHub Actions release
Push a tag `v*.*.*` to trigger `.github/workflows/release.yml`. It:
1. Installs pnpm workspace deps
2. Builds frontend with `BASE_PATH=/`
3. Installs Electron deps (`npm install`)
4. Builds the API CJS bundle
5. Runs `electron-builder --win` to produce an NSIS installer
6. Uploads to GitHub Releases

## Key Features

- **Auth**: Username + 4-digit PIN login, session cookies, admin/operator roles
- **Worklists**: Sequential W###### numbering (zero-padded 6 digits), B####/C#### folder sequences per Rover machine type
- **FileMaker**: REST Data API integration for Projects, Cutlists, StockBook layouts (SSL bypass supported)
- **Materials DB**: Internal PCODE-mapped materials database with stock lookup via FileMaker
- **CSV Export**: Per-worklist CSV download with W###### and folder reference
- **Admin Portal**: User management, FileMaker config, CSV path, worklist start number, SSL bypass toggle

## Default Credentials

On first boot, a default admin user is seeded:
- **Username**: admin
- **PIN**: 0000

## Database Tables

- `users` — workshop accounts (username, pin_hash, role, active)
- `materials` — internal materials (pcode, display_name, notes)
- `worklists` — worklists (worklist_number W######, machine_type, folder_number, project_number, status draft|active|complete)
- `worklist_items` — line items (pcode, quantity, length, width)
- `folder_sequences` — B/C machine folder counters
- `worklist_sequence` — global worklist number counter
- `app_settings` — key/value settings (filemaker config, csv_server_path, etc.)
- `sessions` — express-session storage (connect-pg-simple, PostgreSQL only)
- `stockbook` — local mirror of FileMaker StockBook layout (pcode, description, qty_on_hand, unit, location, last_synced_at)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/api-server run build:electron` — build CJS API bundle for Electron

## User Preferences

### Pushing a release to GitHub
When the user asks to "push to GitHub" or "release a new version", always use this exact method:

1. **Bump the version** in `cnc-worklist-electron/package.json` (increment patch, e.g. 1.0.6 → 1.0.7)
2. **Rebuild the Electron bundle** if any API source files changed:
   ```bash
   pnpm --filter @workspace/api-server run build:electron
   ```
3. **Write the PAT to a temp file** from bash (the `GITHUB_PERSONAL_ACCESS_TOKEN` secret is available in the bash environment):
   ```bash
   echo -n "$GITHUB_PERSONAL_ACCESS_TOKEN" > /tmp/pat.txt
   ```
4. **Commit and push** via `code_execution` using Node.js `child_process.execSync` (git push is blocked in bash but works in the code_execution sandbox):
   ```js
   const { execSync } = await import('child_process');
   const fs = await import('fs');
   const PAT = fs.readFileSync('/tmp/pat.txt', 'utf8').trim();
   execSync('git -C /home/runner/workspace config user.email "replit@trendgosa.com"');
   execSync('git -C /home/runner/workspace config user.name "Replit Agent"');
   execSync('git -C /home/runner/workspace add -A');
   execSync('git -C /home/runner/workspace commit -m "..."');
   execSync(`git -C /home/runner/workspace push --force https://x-access-token:${PAT}@github.com/TgCharlie/TrendWorklist.git main`);
   ```
5. **Create the version tag** via the GitHub REST API (do NOT use `git tag` + `git push --tags` — use the API):
   ```js
   const sha = execSync('git -C /home/runner/workspace rev-parse HEAD', { encoding: 'utf8' }).trim();
   // Delete old tag if exists
   await fetch(`https://api.github.com/repos/TgCharlie/TrendWorklist/git/refs/tags/v1.0.7`, { method: 'DELETE', headers: { Authorization: `Bearer ${PAT}`, ... } });
   // Create new tag
   await fetch(`https://api.github.com/repos/TgCharlie/TrendWorklist/git/refs`, {
     method: 'POST',
     body: JSON.stringify({ ref: 'refs/tags/v1.0.7', sha }),
     headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json', ... }
   });
   ```
6. **Verify** by checking GitHub Actions: `GET /repos/TgCharlie/TrendWorklist/actions/runs?per_page=3`

The tag push triggers the GitHub Actions workflow which builds the Windows installer and publishes it to GitHub Releases.

## Notes

### connect-pg-simple sessions table
The PostgreSQL sessions table is auto-created on startup via `ensureSessionsTable()` in `seed.ts`. The `createTableIfMissing` option was disabled because the bundled `table.sql` file is not included in the esbuild output.

### Electron sessions
The Electron build uses `express-session`'s built-in MemoryStore. Sessions reset when the app is closed (fine for a single-user desktop tool).

### Orval Config
The `zod` output in `lib/api-spec/orval.config.ts` uses an absolute `target` path (not `workspace` + relative). This prevents orval from writing a barrel `index.ts` that references non-existent files.

### StockBook sync strategy
`Replit_ModifiedDate` is a FileMaker **text field** storing timestamps. FileMaker's `>` operator uses **lexicographic comparison**, which is format-dependent:

| FM field format | FM-side `>` comparison | Notes |
|---|---|---|
| `MM/DD/YYYY HH:MM:SS am/pm` | ❌ Broken (12h doesn't sort correctly) | Original format — PM records silently missed |
| `MM/DD/YYYY HH:MM:SS` | ✅ Works within same year | Dec→Jan boundary is an edge case |
| `YYYY/MM/DD HH:MM:SS` | ✅ Perfect | Recommended if you can change FM |

**Current implementation** (`filemaker.ts` → `getAllStockbook`):
- Detects format automatically using `fmTimestampIsSortable()` (no am/pm suffix = 24h)
- **24h format**: adds `Replit_ModifiedDate > since` FM criterion → only changed records fetched from FM (fewer network bytes)
- **12h format**: always fetches all 18k+ records from FM (FM lexicographic comparison unreliable with am/pm)
- **Both formats**: upserts every record FM returns — no JS-side pre-filter. `Replit_ModifiedDate` may not update on every FM record change depending on FileMaker field configuration, so filtering by it would silently miss changes. Upsert is idempotent.

`fmTextTimestampToMs()` is used inside `filemaker.ts` only (to set `fmModifiedMs` on each record for logging).

### pnpm build approval
`better-sqlite3` is in `onlyBuiltDependencies` in `pnpm-workspace.yaml` so pnpm builds its native module during `pnpm install`.
