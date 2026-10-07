# Decisions

Choices made where the spec was ambiguous, with the simplest sensible option picked.

## Stack and tooling

- **Jest** (with ts-jest) for all tests. Nest relies on `emitDecoratorMetadata`, which esbuild-based
  Vitest does not emit without extra plugins.
- **Custom `ZodValidationPipe`** instead of `nestjs-zod`: it's about 20 lines and has no extra dependency.
- **Pinned majors:** Prisma 6, Next.js 15, Zod 3, Tailwind 4, ESLint 9.
- **shadcn/ui components are vendored by hand** in `apps/web/src/components/ui` (the same Radix + CVA
  pattern the CLI generates), so setup needs no interactive CLI.
- **Contracts are compiled to CommonJS** (`dist/`) and built on `pnpm install`, so `db:seed` and `smoke`
  work right after install. Turbo rebuilds them before `build`/`dev`/`test`.
- **One `.env` at the repo root**, copied from `.env.example` on install. Prisma commands load it with `dotenv-cli`.
- **`pnpm db:migrate` runs `prisma migrate deploy`**: it's non-interactive and works from a fresh clone.
  New migrations are created with `pnpm --filter api db:migrate:dev`.
- **Test database** is a second Postgres service in `docker-compose.yml` (port 5433, tmpfs). Tests set
  `DATABASE_URL` from `TEST_DATABASE_URL`, apply migrations once, and truncate between test files.

## Data model

- **Case-insensitive company names** use a `nameKey` column (lowercased, trimmed) with a unique index,
  not the `citext` extension.
- **`lastActivityAt` is denormalized** on `Application` so the list can sort by last activity in SQL. It
  is recomputed inside the same transaction as every event write or void.
- **`ApplicationEvent.sequence`** (autoincrement) was added as a tiebreaker for events that share
  `occurredAt` (for example `CREATED` and `APPLICATION_SUBMITTED` on creation).
- **Append-only is enforced twice**: by the code (no update/delete methods) and by a Postgres trigger.
  `TRUNCATE` (used by the seed and tests) is unaffected by row triggers.
- Relations use `onDelete: Restrict`. There is no delete endpoint for applications or companies in the MVP.

## Business rules

- **"APPLIED or later"** means APPLIED, SCREENING, INTERVIEW, OFFER and REJECTED (you can't be rejected
  without applying). WITHDRAWN does not set `appliedAt` on creation.
- **`appliedAt` default** is the creation instant ("today"). On `SAVED → APPLIED` it is set to the
  status change's `occurredAt`, only if empty.
- **Semantic events** are added only for the transitions in the spec (→ REJECTED, → OFFER, → WITHDRAWN,
  SAVED → APPLIED). Other transitions only get `STATUS_CHANGED`.
- **Manual events** can be any type except `CREATED` and `STATUS_CHANGED`. Those are system-generated,
  and a manual status change would contradict the application's real status. Adding a manual
  `REJECTION` does not change the status.
- **Duplicate URL on create** returns HTTP 200 with `duplicate: true` (201 when created). Changing an
  application's URL to one another application already uses returns 409.
- **Possible-duplicate warning** (no URL): same company, same title and same location, case-insensitive.
  Two empty locations count as a match.
- **Calendar dates** (`YYYY-MM-DD`, from date inputs) mean that day in Europe/Berlin and are stored as
  Berlin midnight in UTC. Full ISO datetimes are accepted as-is. `appliedTo` covers that whole day.
- **Needs attention:** "no response" uses `lastActivityAt <= now − 14 days`. Day counts in messages are
  Berlin calendar days. One row per application lists all its reasons, ordered: upcoming interviews,
  then due actions (soonest first), then silences (longest first).
- **Upcoming interviews** on the dashboard show all future non-voided `INTERVIEW_SCHEDULED` events (up to 10),
  not only the 7-day attention window.
- **The `CREATED` event counts as activity** (the spec says "no non-voided event"), so a backfilled
  application starts its 14-day clock when it is added.

## API

- **Query arrays:** Express's "extended" query parser is enabled, so both `status[]=A&status[]=B`
  and `status=A` work.
- **CORS** allows only `WEB_ORIGIN` (default `http://localhost:3000`). Other origins get no CORS header.
- **`GET /health`** also pings the database.

## Seed

- The seed writes through Prisma directly (not through the services) so it can backdate events
  precisely. It follows the same rules the services enforce. `seedDatabase(prisma, now)` is exported
  and reused by the dashboard tests.

## MCP server (added after the MVP)

- **Built after the user clarified** that Claude, not the user, is meant to enter applications. It reuses
  the services unchanged; only `createEventFieldsSchema` (the event schema without its refinement) was
  exported so it can be extended with `applicationId`.
- **stdio transport**, run as `node apps/api/dist/mcp.js` (not via `pnpm`, whose banner would corrupt stdout).
- **Tool registration goes through a small typed wrapper**, because the SDK's generic inference over our
  Zod schemas exhausts the TypeScript checker (it ran out of memory).
- **No delete tools.** Claude can void events (with a reason), but there is no way to delete data.

## Seed data: your own job tracker (replaces the mock data)

- `pnpm db:seed` loads `apps/api/prisma/data/job-tracker.json`, an export of your own job-tracker
  spreadsheet. It is personal data, so it is **git-ignored**; `job-tracker.example.json` shows the format
  with fictional rows (and is what the tests use). The fictional demo set moved to
  `apps/api/test/fixtures/demo-data.ts` and is only used by the dashboard tests.
- Mapping and its judgment calls are documented at the top of `prisma/seed.ts`. In short: Track, Priority,
  "Next Action" text and non-URL "Job URL" values go into notes; a Follow-up Date becomes next action
  "Follow up"; missing roles become "Role not recorded"; the template text "SAMPLE — replace this row…"
  is dropped.
- The sheet has no dates for rejections or the interview, so those events are dated to the day the sheet
  was last saved (24 Sep 2026) and their description says the exact date was not recorded.
- Company spellings are kept as typed. Case variants merge (e.g. "Acme" and "ACME").

## LifeOS: assistant chat and dashboard redesign

- **Renamed to LifeOS** everywhere: the app name, MCP server name `lifeos`, the repo folder, the
  `@lifeos/contracts` package and the database name and user (`lifeos`).
- **The in-app chat runs the local Claude Code CLI** (`claude -p`) instead of the Claude API, so it needs
  no API key and runs on the user's subscription. Chosen by the user knowing it is for personal, local
  use only: Anthropic does not allow offering claude.ai login in third-party products. The API never
  stores credentials; Claude Code uses its own login.
- **Claude Code over the Agent SDK package**: the CLI is already installed and logged in, and its
  documented headless mode gives streaming, sessions and MCP with no new dependency.
- **Claude only gets LifeOS tools in the chat**: `--tools ""` turns off file/shell/web tools and
  `--strict-mcp-config` ignores other MCP servers. Tool calls are allowed without prompting
  (`--allowedTools mcp__lifeos`), because the user asked for the change in the chat.
- **Streaming via SSE over POST** (fetch + ReadableStream on the client), not WebSockets.
- **Chat history lives in the browser** (`localStorage`); Claude Code keeps the conversation itself.
- **Dashboard:** added `weeklyApplications` (8 Berlin weeks, Monday start), `appliedThisWeek` and
  `responseRate` (submitted applications now in Screening/Interview/Offer/Rejected).
- **Status colors** were chosen with the data-viz palette validator (all hard checks pass in light and
  dark): Saved orange, Applied blue, Screening yellow, Interview violet, Offer green, Rejected red,
  Withdrawn aqua. Color is never the only cue: bars and badges always carry the status name.
- **Charts are hand-written SVG** (no chart library): capped bar widths, hairline grid, selective
  labels (current week and peak), hover tooltips and a screen-reader table.
- **Navigation is module-based** (`apps/web/src/lib/navigation.ts`), so tasks can be added as a module.

## Persistent local database (no Docker)

- **Embedded Postgres** (`tools/postgres`, the `embedded-postgres` binaries) instead of requiring Docker or
  an admin install: this machine has neither, and it needs no elevated rights. `pnpm dev` starts it
  alongside the API and web app; if the port is already served (Docker, a native install, an earlier
  run), it is reused.
- **Data lives in `~/.lifeos/postgres`** (override with `LIFEOS_HOME`), outside the repo, so `git clean`,
  reinstalls and moving the project can't delete it.
- **Backups are JSON exports** (`pnpm db:backup` / `db:restore`) rather than `pg_dump`: the embedded
  binaries don't ship `pg_dump`, and JSON moves between Postgres versions (embedded 18, Docker 16).
- The **test database lives on the same server** (`lifeos_test`); Docker Compose now runs one service with
  both databases via `docker/init-test-db.sql`, so `.env` is identical for both setups.
- The API retries the database connection for ~30s at startup, because Postgres starts in parallel.
- **The web port is configurable** (`PORT` in `.env`); this machine uses 3100 because another app uses 3000.
- The assistant **recovers from a lost Claude Code session** (cleared history, moved folder) by starting
  a new conversation instead of failing every message.

## Status donut

- The Pipeline card shows a **donut** of applications by status above the labelled bars, which serve as
  its legend (status name, count and share as text, so identity never relies on color).
- Following the data-viz rules: only non-zero statuses become slices; more than 6 fold into "Other";
  with 2 slices or fewer the donut is hidden (the numbers say more); slices are separated by a 2px
  surface-colored gap. Hovering a slice or a legend row highlights both and shows that status's
  count and share in the center.

## Daily application goal

- The dashboard's activity chart is **goal-based**: applications per day for the last 30 days against a
  daily goal (default **3**, `APPLICATION_GOAL_PER_DAY` in `.env`). The goal comes from the API so the
  web app and Claude (`get_dashboard`) see the same number.
- **Every calendar day counts**, weekends included ("3 a day" taken literally); the weekly target is
  `perDay × 7`. Days are Berlin calendar days by `appliedAt`.
- Chart: one series; days that met the goal are solid, days below are a lighter step of the same hue;
  the goal is a labelled dashed reference line (distinct from the solid gridlines). Above it: today and
  this week as meters, days on goal, and the current streak (today only counts once met).

## Tasks

- **Tasks are a second module** (`/tasks`, `TasksModule`, `Task` table) with an optional link to an
  application (`onDelete: SetNull`). Unlike timeline events they are ordinary mutable records and can
  be deleted; the MCP `delete_task` tool carries a destructive hint and Claude is told to delete only
  on request.
- **Buckets are computed, not stored**: `overdue` / `today` / `upcoming` by Berlin calendar day,
  `someday` without a due date, `done` by status. `completedAt` is set when a task moves to DONE and
  cleared when it is reopened.
- **Backups**: format `lifeos-backup/2` adds tasks; restore still accepts v1 files.
- The migration was generated with `prisma migrate diff` and applied with `migrate deploy` (purely
  additive), so the existing data was never at risk of a reset.
