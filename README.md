# LifeOS

A personal dashboard that Claude helps keep up to date. Modules: job search (applications, companies,
timelines) and tasks.

Chat with Claude right inside the dashboard ("I just applied to the frontend role at Acme, here's
the link"). Claude reads and changes your data through LifeOS's tools, and the dashboard updates live.
Every status change and note is kept in an append-only timeline per application.

**No API key, anywhere.** The in-app chat runs your locally installed, logged-in Claude Code
(`claude -p`) on your Claude subscription. Claude Desktop or a Claude Code terminal can use the same
tools over MCP.

## Documentation

- [docs/mcp.md](docs/mcp.md): MCP server setup (Claude Code, Claude Desktop) and tool reference
- [docs/api.md](docs/api.md): REST API reference, including the assistant chat stream
- [docs/architecture.md](docs/architecture.md): how it fits together
- [docs/decisions.md](docs/decisions.md): design decisions and why

## Requirements

- Node.js 20 or newer
- pnpm 9 (`npm i -g pnpm@9` or `corepack enable`)
- For the in-app assistant: [Claude Code](https://code.claude.com) installed and logged in (run `claude` once)
- No Docker needed (it's optional, see below)

## Run it

First time:

```bash
pnpm install          # creates .env from .env.example and builds the shared contracts
pnpm db:start         # starts Postgres (first run creates ~/.lifeos/postgres); leave it running
pnpm db:migrate       # in a second terminal: create the tables
pnpm db:seed          # optional: load your job tracker (prisma/data/job-tracker.json, git-ignored; WIPES data)
pnpm db:stop
pnpm build            # the assistant uses the built MCP server (apps/api/dist/mcp.js)
```

Every day:

```bash
pnpm dev              # Postgres + API (:3001) + web (:3000, or PORT from .env)
```

Open the assistant with **Ask Claude** in the top bar or **Ctrl+J**. Collapse the menu to icons, or expand it again, with the button at the top of the menu or **Ctrl+B** (it remembers your choice).

## Your data

- The database lives in **`~/.lifeos/postgres`** (on Windows `C:\Users\<you>\.lifeos\postgres`), outside
  the repository. It survives restarts, reinstalls and moving or re-cloning the project. Set
  `LIFEOS_HOME` in `.env` to keep it elsewhere.
- `pnpm dev` starts Postgres with the app. `pnpm db:start` / `pnpm db:stop` run it on its own (for
  example so Claude Desktop can use the MCP tools without the web app). If Postgres is already running
  on the port (Docker or an earlier run), it is reused.
- **Back up regularly:** `pnpm db:backup` writes `~/.lifeos/backups/lifeos-<timestamp>.json`
  (all companies, applications and events). `pnpm db:restore <file>` replaces all data with a backup,
  in one transaction. The format works across Postgres versions and between local and Docker setups.
- `pnpm db:seed` and `pnpm db:reset` **wipe the database**; back up first.
- Prefer Docker? `docker compose up -d` runs the same databases on the same port. Don't run both.

## The assistant

- The chat panel posts to `POST /assistant/chat`. The API runs `claude -p` with **only** the LifeOS
  MCP tools: built-in file and shell tools are disabled (`--tools ""`, `--strict-mcp-config`).
  Replies stream back as Server-Sent Events, and conversations continue via `--resume`.
- It uses your own Claude Code login and counts toward your subscription usage, like using Claude
  Code directly. It is meant for personal, local use. Don't host it for other people: Anthropic does
  not allow offering claude.ai login in third-party products.
- `GET /assistant/status` reports whether Claude Code was found. Set `CLAUDE_BIN` if `claude` isn't
  on your `PATH`.

## Connect Claude Desktop or a Claude Code terminal (MCP)

Build once (`pnpm build`); the database must be running. The MCP server is `apps/api/dist/mcp.js`.
This repo's `.mcp.json` already registers it for Claude Code sessions opened in this folder.

**Claude Desktop:** add this to `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), then restart Claude Desktop:

```json
{
  "mcpServers": {
    "lifeos": {
      "command": "node",
      "args": ["D:/path/to/lifeos/apps/api/dist/mcp.js"]
    }
  }
}
```

The server reads the repo-root `.env`, wherever it is started from.

| Tool                                                      | Does                                                              |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| `add_application`                                         | Track a job (company matched or created, duplicate URLs detected) |
| `list_applications` / `get_application`                   | Search and filter; one application with its timeline              |
| `update_application`                                      | Edit fields (not status)                                          |
| `change_status`                                           | Move status; records the matching timeline events                 |
| `add_event` / `void_event`                                | Log recruiter contact, interviews, notes; void mistakes           |
| `list_companies` / `get_dashboard`                        | Companies; counts, needs attention, upcoming interviews           |
| `add_task` / `list_tasks` / `update_task` / `delete_task` | To-dos: add, list by due date, complete, delete                   |

## Scripts

| Command                            | What it does                                                               |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `pnpm dev`                         | API and web in watch mode                                                  |
| `pnpm build`                       | Build every package                                                        |
| `pnpm typecheck` / `pnpm lint`     | Strict TypeScript / ESLint (includes architecture guards)                  |
| `pnpm test`                        | Contracts, API service and assistant unit tests (against the test DB)      |
| `pnpm test:e2e`                    | HTTP (Supertest) and MCP end-to-end tests (against the test DB)            |
| `pnpm --filter api mcp`            | Run the MCP server on stdio (after `pnpm build`)                           |
| `pnpm db:start` / `pnpm db:stop`   | Start / cleanly stop the local Postgres (data in `~/.lifeos/postgres`)     |
| `pnpm db:backup`                   | Export all data to `~/.lifeos/backups/*.json`                              |
| `pnpm db:restore <file>`           | Replace all data with a backup                                             |
| `pnpm db:migrate`                  | Apply migrations (`prisma migrate deploy`)                                 |
| `pnpm db:seed`                     | **Wipe** the database and load the job tracker data                        |
| `pnpm db:reset`                    | **Wipe**: drop and re-create the schema, then seed                         |
| `pnpm --filter api db:migrate:dev` | Create a new migration after editing `schema.prisma`                       |
| `pnpm --filter api smoke`          | Boot the services without HTTP and list applications (MCP readiness check) |

Tests use `TEST_DATABASE_URL` and never touch the dev database. Assistant tests use a fake runner and
never call Claude.

## Layout

```
apps/api            NestJS API (controllers → services → repositories → Prisma), MCP server, assistant
apps/web            Next.js App Router UI (TanStack Query, Tailwind, shadcn-style components)
packages/contracts  Zod schemas, enums, DTO types and date helpers shared by api and web
docs/               API and MCP reference, architecture, decisions
```

## Pages

- `/` Dashboard: key numbers, daily goal (3 applications a day, set `APPLICATION_GOAL_PER_DAY` in `.env`), pipeline (donut + bars), upcoming interviews, activity
- `/applications` List: search, filters and sorting, all kept in the URL
- `/applications/new`, `/applications/[id]/edit` Create and edit, with duplicate detection
- `/applications/[id]` Detail with status menu and timeline (add and void events)
- `/companies`, `/companies/[id]` Companies and their applications
- `/tasks` Tasks grouped by Overdue, Today, Upcoming, No date and Completed, with quick add; also shown on the dashboard and on each application
- Assistant panel on every page (docked on wide screens, slide-over below)

New modules (such as tasks) add a section to `apps/web/src/lib/navigation.ts` and their own pages.

Dates are stored in UTC and shown in Europe/Berlin as `DD Mon YYYY`.
