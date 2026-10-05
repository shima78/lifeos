# Architecture

## Overview

```
 Browser ──HTTP──▶ apps/web (Next.js) ──fetch──▶ apps/api (NestJS) ──Prisma──▶ PostgreSQL
                         │                              │
                         └──── packages/contracts ──────┘   (Zod schemas, enums, DTO types)
```

The web app never talks to the database. All its data goes through `src/lib/api-client.ts`, a typed
client built on the shared contracts, wrapped in TanStack Query hooks (`src/lib/queries.ts`).

## API layers

| Layer      | Responsibility                                                                                                          | May use                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Controller | Parse input with a shared Zod schema (`ZodValidationPipe`), call one service method, return the result                  | Services, HTTP decorators                                  |
| Service    | All business rules. Transport-independent: never imports Express, never throws `HttpException`, never reads the request | Repositories, `TransactionRunner`, `Clock`, other services |
| Repository | All database access                                                                                                     | `PrismaService`                                            |

ESLint enforces this: importing `@prisma/client` or `PrismaService` outside repositories, the Prisma module,
mappers (type-only) and test utilities is an error, and services may not import `express` or Nest HTTP exceptions.

**Errors.** Services throw `NotFoundError`, `ValidationError` or `ConflictError` (`src/common/errors.ts`).
`DomainExceptionFilter` maps them, and any other error, to `{ error: { code, message, details? } }`
with status 404, 400, 409 or 500.

**Transactions.** `TransactionRunner.run(fn)` opens a Prisma transaction and stores it in an
`AsyncLocalStorage`. Repositories read `prisma.db`, which is the active transaction when there is one.
So a service can make several repository calls atomic without seeing Prisma. Nested `run` calls join the
outer transaction. Creating an application, changing status, adding an event and voiding an event each
run in one transaction.

**Time.** Services get "now" from an injectable `Clock`, so tests can fix the time.

## Data model

`Company 1─* Application 1─* ApplicationEvent`

- `Company.nameKey` (lowercased, trimmed name) is unique, which makes company names case-insensitive.
- `Application.url` is stored normalized and is unique; Postgres allows any number of NULLs.
- `Application.lastActivityAt` is the denormalized `max(occurredAt)` of non-voided events. It is
  recomputed by `EventsRepository.refreshLastActivity` whenever events are added or voided. It drives
  sorting and the "no response" rule.
- `ApplicationEvent` is append-only. The code has no update or delete path except `markVoided`, and a
  database trigger (in the init migration) rejects any `DELETE` and any `UPDATE` other than voiding a
  non-voided event once. `sequence` (autoincrement) breaks ties between events with the same `occurredAt`.

## Business rules

| Rule                                                                                               | Where                              |
| -------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Find-or-create company, `CREATED` / `APPLICATION_SUBMITTED` events, `appliedAt` default            | `ApplicationsService.create`       |
| Duplicate URL returns the existing application; company + title + location match returns a warning | `ApplicationsService.create`       |
| Status change with `STATUS_CHANGED` and semantic events; same status is a no-op                    | `ApplicationsService.changeStatus` |
| Manual events, `INTERVIEW_SCHEDULED` needs `scheduledFor`, voiding                                 | `EventsService`                    |
| Needs-attention rules and thresholds (pure functions)                                              | `dashboard/attention.rules.ts`     |
| URL normalization                                                                                  | `common/url.ts`                    |

## MCP server (how Claude adds applications)

`apps/api/src/mcp.ts` is a second entry point into the same module graph as `main.ts`:

```
Claude Desktop / Claude Code ──stdio (MCP)──▶ dist/mcp.js
                                                └─ createApplicationContext(AppModule)   (no HTTP)
                                                     └─ ApplicationsService / EventsService / … ──▶ PostgreSQL
Browser ──▶ web ──REST──▶ main.ts ──▶ the same services
```

- `src/mcp/mcp-server.ts` registers 9 tools: `add_application`, `list_applications`, `get_application`,
  `update_application`, `change_status`, `add_event`, `void_event`, `list_companies`, `get_dashboard`.
  Each tool's input schema is the shared contract schema from `@lifeos/contracts` (the SDK derives the JSON
  Schema Claude sees from it), and each handler calls one service method. Like controllers, tools hold no
  business logic, so duplicate detection, events and transactions behave exactly as in the web app.
- `DomainError`s become MCP tool errors (`isError: true` with `{ error: { code, message, details } }`) that
  the model can read and recover from. Unexpected errors propagate as protocol errors.
- stdout is the protocol channel: Nest logging is off and diagnostics go to stderr.
- `.env` is found by walking up from the compiled file to the repo root, because MCP clients start the
  server from an arbitrary working directory.
- No model runs inside LifeOS itself. The LLM is the MCP client (Claude on the user's subscription), so no API key
  exists anywhere.

Tests: `test/mcp.e2e-spec.ts` connects a real MCP `Client` over an in-memory transport and exercises the
tools. `pnpm --filter api smoke` boots the same context without HTTP and lists applications.

## In-app assistant (chat panel)

```
Chat panel (web) ──POST /assistant/chat (SSE)──▶ AssistantController
                                                   └─ AssistantService ──spawn──▶ claude -p   (user's Claude Code login)
                                                                                    └─ MCP stdio ──▶ dist/mcp.js ──▶ services
```

- `src/assistant/` is an API module. `AssistantService.chat()` yields transport-independent
  `AssistantEvent`s (`session`, `text`, `tool_start`, `tool_end`, `error`, `done`, typed in
  `@lifeos/contracts`). The controller only writes them as Server-Sent Events, and stops Claude when the
  browser disconnects.
- Claude Code runs as
  `claude -p --output-format stream-json --verbose --include-partial-messages --tools "" --mcp-config <lifeos only> --strict-mcp-config --allowedTools mcp__lifeos --system-prompt <LifeOS prompt> [--resume <session>]`.
  The message goes in on stdin. Built-in tools are off, so Claude can only use LifeOS tools.
  `--bare` is deliberately not used: it would require an API key.
- `StreamJsonParser` maps Claude Code's stream-json lines to events: text deltas stream live, tool calls
  come from complete assistant messages, and the final `result` ends the turn.
- Sessions run in a fixed working directory (`.lifeos/assistant/`, gitignored), so `--resume` finds them.
  The browser keeps the session id and the transcript in `localStorage`.
- When a mutating tool succeeds, the web app invalidates its queries, so the dashboard updates while
  Claude is still replying.
- The panel sends a short page context ("the user is viewing application X"), so "mark this as
  rejected" works on a detail page.
- Usage counts toward the user's Claude subscription, like using Claude Code directly. This is intended
  for personal, local use only (see README).
