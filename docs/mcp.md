# LifeOS MCP server

LifeOS includes a [Model Context Protocol](https://modelcontextprotocol.io) server, so Claude can read
and update your job search directly. Tell Claude "I applied to the frontend role at Acme, here's the
link" and it calls `add_application`. The web dashboard shows the change.

- **No API key.** The server runs no AI itself. Claude runs in the client you already use (Claude
  Desktop, Claude Code, or the LifeOS chat panel) on your Claude subscription, and calls these tools.
- **Same rules as the web app.** Each tool calls the same service as the matching
  [REST endpoint](api.md), with the same validation. Duplicate detection, timeline events and
  transactions behave identically.
- **Transport:** stdio. Entry point: `apps/api/dist/mcp.js`. Server name: `lifeos`.

## Contents

- [Setup](#setup)
- [How Claude should use it](#how-claude-should-use-it)
- [Tools](#tools)
- [Errors](#errors)
- [Troubleshooting](#troubleshooting)
- [Adding a tool](#adding-a-tool)

---

## Setup

Requirements:

1. **Build once:** `pnpm build` (creates `apps/api/dist/mcp.js`; rebuild after changing API code).
2. **Database running:** `pnpm dev` or `pnpm db:start`. The server reads the repo-root `.env` wherever
   it's started from, and waits up to ~30 s for the database.

### LifeOS chat panel

Nothing to set up. The API starts the server for each chat message (see
[api.md → Assistant](api.md#assistant)).

### Claude Code

The repo's `.mcp.json` already registers the server for sessions opened in the project folder:

```json
{
  "mcpServers": {
    "lifeos": { "type": "stdio", "command": "node", "args": ["apps/api/dist/mcp.js"] }
  }
}
```

Run `claude` in the `lifeos` folder and approve the `lifeos` server when asked. To use LifeOS from
**any** folder, register it for your user instead:

```bash
claude mcp add --scope user lifeos -- node D:/path/to/lifeos/apps/api/dist/mcp.js
```

Check with `claude mcp list` or `/mcp` inside a session.

### Claude Desktop

Edit `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or
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

Use an absolute path, with forward slashes or escaped backslashes.

### Try it without Claude

```bash
npx @modelcontextprotocol/inspector node apps/api/dist/mcp.js
```

This opens the MCP Inspector, where you can list the tools and call them by hand.

---

## How Claude should use it

The server sends these instructions to the client at startup (clients usually show them to the model):

> LifeOS is the user's personal job-application tracker. Use `add_application` when the user applies
> to, or wants to save, a job (pass the posting URL when known: duplicates are detected automatically).
> Use `change_status` when they hear back, and `add_event` to log recruiter contact, interviews,
> follow-ups and notes. Dates are "YYYY-MM-DD" (a calendar day in Europe/Berlin) or a full ISO-8601
> datetime.

Typical flows:

| You say                                                       | Claude does                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| "I applied to Frontend Engineer at Acme in Berlin: https://…" | `add_application` with `status: "APPLIED"`                                |
| "Acme rejected me"                                            | `list_applications` (search "Acme") → `change_status` → `REJECTED`        |
| "Interview with Acme next Tuesday at 10"                      | `list_applications` → `add_event` (`INTERVIEW_SCHEDULED`, `scheduledFor`) |
| "What should I follow up on?"                                 | `get_dashboard` → reads `needsAttention`                                  |
| "That interview note was on the wrong job"                    | `get_application` → `void_event` with a reason                            |

**Dates:** every date argument accepts `"YYYY-MM-DD"` (that day in Berlin) or a full ISO datetime such
as `"2026-10-13T10:00:00+02:00"`. Results always contain UTC ISO strings.

**Ids:** applications and events have opaque ids (`cm…`). Claude finds them with `list_applications`
or `get_application`; you never need to type one.

---

## Tools

Results are returned as JSON text (`content[0].text`). Object shapes are documented in
[api.md → Reference](api.md#reference).

| Tool                                        | Kind                     | REST equivalent                               |
| ------------------------------------------- | ------------------------ | --------------------------------------------- |
| [`add_application`](#add_application)       | write                    | `POST /applications`                          |
| [`list_applications`](#list_applications)   | read-only                | `GET /applications`                           |
| [`get_application`](#get_application)       | read-only                | `GET /applications/:id` + `/timeline`         |
| [`update_application`](#update_application) | write                    | `PATCH /applications/:id`                     |
| [`change_status`](#change_status)           | write                    | `POST /applications/:id/status`               |
| [`add_event`](#add_event)                   | write                    | `POST /applications/:id/events`               |
| [`void_event`](#void_event)                 | write (destructive hint) | `POST /applications/:id/events/:eventId/void` |
| [`list_companies`](#list_companies)         | read-only                | `GET /companies`                              |
| [`get_dashboard`](#get_dashboard)           | read-only                | `GET /dashboard`                              |

Read-only tools carry the MCP `readOnlyHint` annotation; `void_event` carries `destructiveHint`. Clients
may use these to decide what needs your confirmation. There are **no delete tools**: nothing Claude
does can delete data.

### `add_application`

Track a new job application.

| Argument         | Type   | Required | Notes                                                    |
| ---------------- | ------ | -------- | -------------------------------------------------------- |
| `companyName`    | string | yes      | Matched case-insensitively, or created                   |
| `title`          | string | yes      |                                                          |
| `url`            | string |          | Posting URL; stored normalized (tracking params removed) |
| `location`       | string |          |                                                          |
| `employmentType` | string |          |                                                          |
| `description`    | string |          |                                                          |
| `status`         | status |          | Default `SAVED`                                          |
| `appliedAt`      | date   |          | Default now when status is APPLIED or later              |
| `nextAction`     | string |          |                                                          |
| `nextActionDate` | date   |          |                                                          |
| `recruiterName`  | string |          |                                                          |
| `recruiterEmail` | string |          |                                                          |
| `notes`          | string |          |                                                          |

Returns `{ application, duplicate, warnings }`:

- `duplicate: true` means the URL was **already tracked**; nothing was created and `application` is the
  existing one. Claude should tell you instead of claiming it added something.
- `warnings` may contain `POSSIBLE_DUPLICATE` (same company, title and location, no URL). The new
  application **was** created; `applicationId` points at the similar one.

```json
{
  "companyName": "Acme GmbH",
  "title": "Frontend Engineer",
  "url": "https://jobs.acme.example/123?utm_source=linkedin",
  "location": "Berlin",
  "status": "APPLIED"
}
```

### `list_applications`

| Argument      | Type                                                                                    | Notes                                       |
| ------------- | --------------------------------------------------------------------------------------- | ------------------------------------------- |
| `search`      | string                                                                                  | Company or title, partial, case-insensitive |
| `status`      | status[]                                                                                | e.g. `["APPLIED", "SCREENING"]`             |
| `companyId`   | string                                                                                  |                                             |
| `location`    | string                                                                                  |                                             |
| `appliedFrom` | date                                                                                    |                                             |
| `appliedTo`   | date                                                                                    | Inclusive of that Berlin day                |
| `sort`        | `company` \| `title` \| `status` \| `appliedAt` \| `lastActivityAt` \| `nextActionDate` | Default `lastActivityAt`                    |
| `order`       | `asc` \| `desc`                                                                         | Default `desc`                              |

All optional. Returns an array of applications (without timelines).

### `get_application`

| Argument | Type   | Required |
| -------- | ------ | -------- |
| `id`     | string | yes      |

Returns `{ application, timeline }`. The timeline is newest first and includes voided events (check
`voidedAt`).

### `update_application`

| Argument                                    | Type   | Required | Notes                                       |
| ------------------------------------------- | ------ | -------- | ------------------------------------------- |
| `id`                                        | string | yes      |                                             |
| any `add_application` field except `status` |        |          | Omitted = unchanged; `""` = clear the field |

Status can't be changed here; use `change_status`. Returns the updated application. Errors with
`CONFLICT` if the new URL belongs to another application.

### `change_status`

| Argument     | Type   | Required | Notes                          |
| ------------ | ------ | -------- | ------------------------------ |
| `id`         | string | yes      |                                |
| `status`     | status | yes      | Any transition is allowed      |
| `occurredAt` | date   |          | When it happened. Default: now |
| `note`       | string |          | Saved on the timeline event    |

Records `STATUS_CHANGED` plus the implied event (→ REJECTED adds `REJECTION`, → OFFER adds `OFFER`,
→ WITHDRAWN adds `WITHDRAWN`, SAVED → APPLIED adds `APPLICATION_SUBMITTED` and sets `appliedAt`).
Setting the current status again does nothing. Returns the updated application.

### `add_event`

| Argument        | Type       | Required                  | Notes                                                                                                                                                                     |
| --------------- | ---------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applicationId` | string     | yes                       |                                                                                                                                                                           |
| `type`          | event type | yes                       | `APPLICATION_SUBMITTED`, `RECRUITER_CONTACT`, `INTERVIEW_SCHEDULED`, `INTERVIEW_COMPLETED`, `ASSIGNMENT_RECEIVED`, `FOLLOW_UP`, `REJECTION`, `OFFER`, `WITHDRAWN`, `NOTE` |
| `title`         | string     |                           | Default: the type's label                                                                                                                                                 |
| `description`   | string     |                           |                                                                                                                                                                           |
| `occurredAt`    | date       |                           | Default: now                                                                                                                                                              |
| `scheduledFor`  | date       | for `INTERVIEW_SCHEDULED` | Interview date and time                                                                                                                                                   |

Doesn't change the status. Returns the event.

```json
{
  "applicationId": "cmuu7m97i0021w1kcodtjj4q1",
  "type": "INTERVIEW_SCHEDULED",
  "scheduledFor": "2026-10-13T10:00:00+02:00",
  "description": "Technical interview, 60 min"
}
```

### `void_event`

| Argument        | Type   | Required |
| --------------- | ------ | -------- |
| `applicationId` | string | yes      |
| `eventId`       | string | yes      |
| `reason`        | string | yes      |

Marks the event as voided. It stays on the timeline, struck through, and no longer counts as activity.
Events can't be edited or deleted. Errors with `CONFLICT` if it's already voided.

### `list_companies`

| Argument | Type   | Notes                                |
| -------- | ------ | ------------------------------------ |
| `search` | string | Partial, case-insensitive name match |

Returns companies with `applicationCount`.

### `get_dashboard`

No arguments. Returns the same object as `GET /dashboard`: `stats` (including `responseRate`),
`byStatus`, `weeklyApplications`, `dailyApplications` and `goal` (the daily application goal and today's
and this week's progress, so Claude can answer "how am I doing on my goal?"), `needsAttention` (no response for 14+ days, next actions due within
3 days or overdue, interviews in the next 7 days), `upcomingInterviews` and `recentActivity`. See
[api.md → Dashboard](api.md#dashboard).

---

## Errors

Tool failures come back as a normal result with `isError: true`, so Claude can read the problem and
recover (ask you, retry with a fix). There are two kinds.

**Invalid arguments** are rejected by the MCP SDK before the tool runs:

```
MCP error -32602: Input validation error: Invalid arguments for tool add_application:
Company is required at companyName
Must be a valid URL at url
```

**Business-rule errors** come from LifeOS, as JSON in the same shape as the REST API:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Application nope not found",
    "details": { "entity": "Application", "id": "nope" }
  }
}
```

| `code`             | Typical cause                                                                 |
| ------------------ | ----------------------------------------------------------------------------- |
| `NOT_FOUND`        | Wrong or stale id: list again                                                 |
| `VALIDATION_ERROR` | e.g. `INTERVIEW_SCHEDULED` without `scheduledFor`                             |
| `CONFLICT`         | URL used by another application, duplicate company name, event already voided |

Unexpected failures (such as the database being down) also come back with `isError: true`, with the
raw error message as text.

---

## Troubleshooting

| Symptom                                       | Fix                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Server "failed" / not connected in the client | Run `pnpm build`; check the path to `apps/api/dist/mcp.js`                                       |
| Tools time out or report database errors      | Start the database: `pnpm dev` or `pnpm db:start`                                                |
| Claude Code doesn't list `lifeos`             | Start `claude` in the `lifeos` folder and approve the server, or register it with `--scope user` |
| Changes don't show in the web app             | The web app refetches on focus; or reload the page                                               |
| Behaviour doesn't match recent code changes   | Rebuild (`pnpm build`) and restart the client                                                    |

The server logs only to **stderr** (stdout carries the protocol). In Claude Desktop, see its MCP logs.
In Claude Code, run `claude --debug`.

---

## Adding a tool

Tools live in [`apps/api/src/mcp/mcp-server.ts`](../apps/api/src/mcp/mcp-server.ts). Keep them as thin as
controllers:

1. Put the logic in a service, and the input schema in `packages/contracts` (so REST and MCP share
   it).
2. Register it with the local `tool()` helper: name, title, a description written for the model
   (what it does, when to use it, side effects), the contract schema as `inputSchema`, and
   `annotations: { readOnlyHint: true }` for reads.
3. The handler calls one service method and returns its result. `DomainError`s become tool errors
   automatically.
4. If it changes data, add its name to `MUTATING_ASSISTANT_TOOLS` in `@lifeos/contracts` so the
   chat panel refreshes the dashboard after it runs.
5. Add a case to [`apps/api/test/mcp.e2e-spec.ts`](../apps/api/test/mcp.e2e-spec.ts), which drives a real
   MCP client against the server, and run `pnpm test:e2e`.

Use the `tool()` helper rather than calling `server.registerTool` directly: the SDK's type inference
over complex Zod schemas exhausts the TypeScript checker.
