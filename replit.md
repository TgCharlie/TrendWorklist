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
Push a tag `v*.*.*` to trigger `.github/workflows/release.yml` in the `cnc-worklist-electron/` directory. It:
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
- **24h format**: adds `Replit_ModifiedDate > since` FM criterion → only changed records fetched from FM
- **12h format**: always fetches all 18k+ records from FM (FM text comparison unreliable)
- **Both formats**: applies a JS-side filter using `fmTextTimestampToMs()` (correct 12h→24h conversion) before upserting — catches any FM text comparison edge cases and avoids writing unchanged records to SQLite

`fmTextTimestampToMs()` handles all three formats above and is exported for use in routes.

### pnpm build approval
`better-sqlite3` is in `onlyBuiltDependencies` in `pnpm-workspace.yaml` so pnpm builds its native module during `pnpm install`.
