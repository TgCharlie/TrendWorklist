# CNC Worklist Manager

## Overview

A workshop management app for a cabinet/joinery workshop. Manages CNC cutting worklists with FileMaker Data API integration, sequential worklist and folder numbering, CSV export, and an admin portal.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 (session-based auth)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Frontend**: React + Vite + shadcn/ui + TailwindCSS
- **Auth**: Username + 4-digit PIN, bcrypt hashed, express-session with connect-pg-simple

## Artifacts

| Artifact | Kind | Port | Preview Path |
|---------|------|------|------|
| `artifacts/api-server` | API | 8080 | /api |
| `artifacts/cnc-worklist` | Web | 20009 | / |

## Key Features

- **Auth**: Username + 4-digit PIN login, session cookies, admin/operator roles
- **Worklists**: Sequential W###### numbering (zero-padded 6 digits), B####/C#### folder sequences per Rover machine type
- **FileMaker**: REST Data API integration for Projects, Cutlists, StockBook layouts
- **Materials DB**: Internal PCODE-mapped materials database with stock lookup via FileMaker
- **CSV Export**: Per-worklist CSV download with W###### and folder reference
- **Admin Portal**: User management, FileMaker config, CSV path, worklist start number

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
- `sessions` — express-session storage (connect-pg-simple)
- `stockbook` — local mirror of FileMaker StockBook layout (pcode, description, qty_on_hand, unit, location, last_synced_at)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Session Note

connect-pg-simple requires a `sessions` table. This is auto-created on startup via the `ensureSessionsTable()` function in `artifacts/api-server/src/lib/seed.ts`. The `createTableIfMissing` option was disabled because the bundled `table.sql` file is not included in the esbuild output.

## Orval Config Note

The `zod` output in `lib/api-spec/orval.config.ts` uses an absolute `target` path (not `workspace` + relative target). This prevents orval from writing a barrel `index.ts` that references non-existent files. The `lib/api-zod/src/index.ts` is a manually maintained file that exports from `./generated/api`.
