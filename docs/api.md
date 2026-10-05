# LifeOS REST API

The HTTP API behind the LifeOS web app. It is also the place to start if you want to script
LifeOS or build another client. Claude uses the same operations through the MCP server
(see [mcp.md](mcp.md)).

- **Base URL:** `http://localhost:3001` (`API_PORT` in `.env`)
- **Format:** JSON in, JSON out (`Content-Type: application/json`)
- **Auth:** none. LifeOS is a single-user app that runs on your machine. Don't expose the port to a
  network.
- **CORS:** only `WEB_ORIGIN` from `.env` (the web app) may call it from a browser.
- **Source of truth:** every request body and query is validated with the Zod schemas in
  [`packages/contracts/src/schemas.ts`](../packages/contracts/src/schemas.ts); response types are in
  [`dto.ts`](../packages/contracts/src/dto.ts). TypeScript clients can import both from
  `@lifeos/contracts`.

## Contents

- [Conventions](#conventions): dates, empty values, errors
- [Health](#health)
- [Applications](#applications)
- [Timeline events](#timeline-events)
- [Companies](#companies)
- [Dashboard](#dashboard)
- [Assistant](#assistant): the chat endpoint (streams Server-Sent Events)
- [Reference](#reference): enums and object shapes

---

## Conventions

### Dates

All dates in responses are **ISO-8601 strings in UTC**, for example `"2026-10-08T07:30:00.000Z"`.
LifeOS displays them in **Europe/Berlin**.

Date fields in requests accept either:

| Form          | Example                  | Meaning                                        |
| ------------- | ------------------------ | ---------------------------------------------- |
| Calendar date | `"2026-10-08"`           | That day in Berlin (stored as Berlin midnight) |
| ISO datetime  | `"2026-10-08T14:00:00Z"` | That exact instant                             |

Use a calendar date for "applied on" style fields and a datetime when the time matters (an interview
at 14:00). Day-based rules (overdue, "in 3 days", date filters) use Berlin calendar days.

### Empty values

- When **creating**, an empty string `""` for an optional field means "not set".
- When **updating** (`PATCH`), an empty string `""` or `null` **clears** the field. Omitting a field
  leaves it unchanged.
- Text is trimmed.

### Errors

Every error has the same shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": [
      { "path": "title", "message": "Title is required" },
      { "path": "url", "message": "Must be a valid URL" }
    ]
  }
}
```

| HTTP | `code`             | When                                                                                  |
| ---- | ------------------ | ------------------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR` | Invalid body or query (`details` lists each field), malformed JSON                    |
| 404  | `NOT_FOUND`        | Unknown id or route (`details`: `{ entity, id }` for unknown ids)                     |
| 409  | `CONFLICT`         | Duplicate company name, URL already used by another application, event already voided |
| 500  | `INTERNAL_ERROR`   | Unexpected failure (logged by the API)                                                |

Writes are **atomic**: if any part of a request fails, nothing is saved.

---

## Health

### `GET /health`

```json
{ "status": "ok", "database": "up" }
```

`status` is `"degraded"` and `database` is `"down"` when Postgres can't be reached. The response is
still HTTP 200, so you can always read it.

---

## Applications

An application is one job you're tracking. See the [Application object](#application).

### `GET /applications`

List applications, filtered and sorted.

| Query         | Type                                                                                    | Notes                                                                      |
| ------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `search`      | string                                                                                  | Matches company name or title (case-insensitive, partial)                  |
| `status`      | status, repeatable                                                                      | `status=APPLIED&status=INTERVIEW` or `status[]=APPLIED&status[]=INTERVIEW` |
| `companyId`   | string                                                                                  | Only this company's applications                                           |
| `location`    | string                                                                                  | Partial, case-insensitive                                                  |
| `appliedFrom` | date                                                                                    | `appliedAt` on or after                                                    |
| `appliedTo`   | date                                                                                    | `appliedAt` up to and including that Berlin day                            |
| `sort`        | `company` \| `title` \| `status` \| `appliedAt` \| `lastActivityAt` \| `nextActionDate` | Default `lastActivityAt`                                                   |
| `order`       | `asc` \| `desc`                                                                         | Default `desc`. Empty values sort last in both directions                  |

```bash
curl "http://localhost:3001/applications?status=APPLIED&status=SCREENING&sort=appliedAt&order=asc"
```

Returns `200` with an array of [Application](#application) objects.

### `POST /applications`

Track a new application.

| Field            | Type              | Required | Notes                                                         |
| ---------------- | ----------------- | -------- | ------------------------------------------------------------- |
| `companyName`    | string            | yes      | Matched to an existing company case-insensitively, or created |
| `title`          | string            | yes      | Max 300                                                       |
| `url`            | string            |          | `http(s)://` posting URL; stored normalized (see below)       |
| `location`       | string            |          |                                                               |
| `employmentType` | string            |          | e.g. "Full-time"                                              |
| `description`    | string            |          | Job description, max 20,000                                   |
| `status`         | [status](#status) |          | Default `SAVED`                                               |
| `appliedAt`      | date              |          | Defaults to now if `status` is APPLIED or later               |
| `nextAction`     | string            |          | e.g. "Follow up with recruiter"                               |
| `nextActionDate` | date              |          |                                                               |
| `recruiterName`  | string            |          |                                                               |
| `recruiterEmail` | string            |          | Valid email                                                   |
| `notes`          | string            |          |                                                               |

```bash
curl -X POST http://localhost:3001/applications \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "Acme GmbH",
    "title": "Frontend Engineer",
    "url": "https://jobs.acme.example/123?utm_source=linkedin",
    "location": "Berlin",
    "status": "APPLIED",
    "appliedAt": "2026-10-04"
  }'
```

Response:

```json
{
  "application": {
    "id": "cm…",
    "title": "Frontend Engineer",
    "url": "https://jobs.acme.example/123",
    "status": "APPLIED",
    "…": "…"
  },
  "duplicate": false,
  "warnings": []
}
```

What happens:

- A `CREATED` event is recorded. If the status is APPLIED, SCREENING, INTERVIEW, OFFER or
  REJECTED, `appliedAt` is set (default: now) and an `APPLICATION_SUBMITTED` event is recorded.
- **URL normalization:** lowercase host, no tracking parameters (`utm_*`, `gclid`, `fbclid`, `trk`,
  `ref`, …), no fragment, no trailing slash, remaining parameters sorted. The same posting always gets
  the same URL.
- **Duplicate URL:** if that normalized URL is already tracked, **nothing is created**. The response is
  `200` (instead of `201`) with `"duplicate": true` and the existing application.
- **Possible duplicate without a URL:** if the same company, title and location (case-insensitive)
  already exist, the application **is** created and `warnings` contains
  `{ "code": "POSSIBLE_DUPLICATE", "message": "…", "applicationId": "<the existing one>" }`.

| Status | Meaning                              |
| ------ | ------------------------------------ |
| 201    | Created                              |
| 200    | Duplicate URL, existing one returned |
| 400    | Invalid input                        |

### `GET /applications/:id`

Returns one [Application](#application), or `404`.

### `PATCH /applications/:id`

Update any field **except `status`** (sending `status` is a `400`; use the status endpoint). Same
fields as `POST`, all optional. `""` or `null` clears a field. Changing `companyName` moves the
application to that company (created if needed).

Returns the updated [Application](#application). `409` if the new `url` already belongs to another
application (`details.applicationId` names it).

### `POST /applications/:id/status`

Change the status. Any status can move to any other.

| Field        | Type              | Required | Notes                             |
| ------------ | ----------------- | -------- | --------------------------------- |
| `status`     | [status](#status) | yes      |                                   |
| `occurredAt` | date              |          | When it happened. Default: now    |
| `note`       | string            |          | Stored as the event's description |

```bash
curl -X POST http://localhost:3001/applications/cm…/status \
  -H "Content-Type: application/json" \
  -d '{ "status": "INTERVIEW", "note": "First round with the team lead" }'
```

Records, in one transaction:

- `STATUS_CHANGED` with `metadata: { "from": "APPLIED", "to": "INTERVIEW" }`
- plus the matching event when it's implied:

| Transition          | Extra event                                              |
| ------------------- | -------------------------------------------------------- |
| → `REJECTED`        | `REJECTION`                                              |
| → `OFFER`           | `OFFER`                                                  |
| → `WITHDRAWN`       | `WITHDRAWN`                                              |
| `SAVED` → `APPLIED` | `APPLICATION_SUBMITTED`, and `appliedAt` is set if empty |

Setting the status it already has does nothing (no events). Returns `200` with the updated
[Application](#application).

---

## Timeline events

Each application has an **append-only** timeline. Events are never edited or deleted; a mistake is
**voided** (kept, shown struck through, ignored for "last activity"). The database enforces this.

### `GET /applications/:id/timeline`

All events of the application, **newest first** (by `occurredAt`, then insertion order), voided ones
included. Returns an array of [Event](#event) objects.

### `POST /applications/:id/events`

Add an event by hand.

| Field          | Type                              | Required                  | Notes                                               |
| -------------- | --------------------------------- | ------------------------- | --------------------------------------------------- |
| `type`         | [manual event type](#event-types) | yes                       |                                                     |
| `title`        | string                            |                           | Default: the type's label, e.g. "Recruiter contact" |
| `description`  | string                            |                           |                                                     |
| `occurredAt`   | date                              |                           | Default: now                                        |
| `scheduledFor` | date                              | for `INTERVIEW_SCHEDULED` | When the interview is                               |

```bash
curl -X POST http://localhost:3001/applications/cm…/events \
  -H "Content-Type: application/json" \
  -d '{ "type": "INTERVIEW_SCHEDULED", "scheduledFor": "2026-10-12T09:00:00Z", "description": "Video call" }'
```

Returns `201` with the [Event](#event). Adding an event never changes the status (a `REJECTION`
event doesn't reject the application; use the status endpoint).

### `POST /applications/:id/events/:eventId/void`

```json
{ "reason": "Logged on the wrong application" }
```

Sets `voidedAt` and `voidReason`. Returns `200` with the voided [Event](#event). `409` if it's already
voided, `404` if the event doesn't belong to that application.

---

## Companies

Companies are created automatically when an application names a new one. Names are unique,
ignoring case and surrounding spaces.

### `GET /companies`

| Query    | Notes                                |
| -------- | ------------------------------------ |
| `search` | Partial, case-insensitive name match |

Returns [Company](#company) objects, sorted by name, each with `applicationCount`.

### `POST /companies`

| Field      | Type                  | Required |
| ---------- | --------------------- | -------- |
| `name`     | string                | yes      |
| `website`  | string (`http(s)://`) |          |
| `location` | string                |          |
| `notes`    | string                |          |

`201` with the [Company](#company); `409` if the name exists.

### `GET /companies/:id`

The [Company](#company) plus `applications`: its applications, most recent activity first.

### `PATCH /companies/:id`

Same fields as `POST`, all optional; `""`/`null` clears. `409` when renaming to an existing name.

---

## Dashboard

### `GET /dashboard`

Everything the dashboard page shows, computed on request.

```json
{
  "stats": {
    "total": 37,
    "active": 26,
    "interviews": 1,
    "offers": 0,
    "rejections": 11,
    "appliedThisWeek": 0,
    "responseRate": 0.32
  },
  "byStatus": [{ "status": "SAVED", "count": 0 }, { "status": "APPLIED", "count": 25 }, "…"],
  "weeklyApplications": [
    { "weekStart": "2026-08-10", "count": 0 },
    "…",
    { "weekStart": "2026-09-28", "count": 0 }
  ],
  "dailyApplications": [
    { "date": "2026-09-06", "count": 6 },
    "…",
    { "date": "2026-10-05", "count": 1 }
  ],
  "goal": { "perDay": 3, "today": 1, "perWeek": 21, "thisWeek": 1 },
  "needsAttention": [
    {
      "application": {
        "id": "cm…",
        "title": "Frontend Engineer",
        "status": "APPLIED",
        "company": { "id": "cm…", "name": "Acme GmbH" }
      },
      "reasons": [
        { "kind": "NEXT_ACTION_DUE", "message": "Next action overdue by 2 days", "days": -2 },
        { "kind": "NO_RESPONSE", "message": "No response for 18 days", "days": 18 }
      ]
    }
  ],
  "upcomingInterviews": [{ "event": { "…": "Event" }, "application": { "…": "summary" } }],
  "recentActivity": [{ "event": { "…": "Event" }, "application": { "…": "summary" } }]
}
```

| Field                          | Meaning                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `stats.active`                 | Not SAVED and not OFFER / REJECTED / WITHDRAWN                                                                 |
| `stats.appliedThisWeek`        | `appliedAt` in the current Berlin week (Monday start)                                                          |
| `stats.responseRate`           | Share (0–1) of submitted applications now in SCREENING, INTERVIEW, OFFER or REJECTED; `null` if none submitted |
| `weeklyApplications`           | Last 8 Berlin weeks by `appliedAt`, oldest first, current week last                                            |
| `dailyApplications`            | Last 30 Berlin calendar days by `appliedAt`, oldest first, today last                                          |
| `goal.perDay`                  | The daily application goal: `APPLICATION_GOAL_PER_DAY` in `.env` (default 3). Every day counts, weekends too   |
| `goal.today` / `goal.thisWeek` | Applications today / this Berlin week (Monday start); `goal.perWeek` is `perDay × 7`                           |
| `needsAttention`               | Applications with at least one reason, most urgent first (rules below)                                         |
| `upcomingInterviews`           | Up to 10 non-voided `INTERVIEW_SCHEDULED` events with `scheduledFor` in the future, soonest first              |
| `recentActivity`               | Latest 10 non-voided events across all applications                                                            |

**Needs-attention rules** (thresholds are constants in
[`attention.rules.ts`](../apps/api/src/dashboard/attention.rules.ts)):

| `kind`               | Rule                                                                      | `days`                          |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------- |
| `UPCOMING_INTERVIEW` | A non-voided `INTERVIEW_SCHEDULED` with `scheduledFor` in the next 7 days | days until it                   |
| `NEXT_ACTION_DUE`    | `nextActionDate` is overdue, today, or within 3 days                      | days until (negative = overdue) |
| `NO_RESPONSE`        | Status APPLIED or SCREENING and no non-voided event in the last 14 days   | days since last activity        |

Applications in OFFER, REJECTED or WITHDRAWN only appear for an upcoming interview.

---

## Assistant

The chat panel's backend. It runs the locally installed Claude Code (`claude -p`) with your own login.
No API key is used. Claude can only use the LifeOS tools (the same ones as the [MCP server](mcp.md));
its built-in file, shell and web tools are disabled.

### `GET /assistant/status`

```json
{ "available": true, "claudeVersion": "2.1.289 (Claude Code)", "reason": null }
```

`available` is `false` with a human-readable `reason` when Claude Code isn't installed (or not on
`PATH`; set `CLAUDE_BIN`) or the API hasn't been built (`pnpm build`).

### `POST /assistant/chat`

| Field       | Type   | Required | Notes                                                                                                     |
| ----------- | ------ | -------- | --------------------------------------------------------------------------------------------------------- |
| `message`   | string | yes      | What the user typed, max 20,000                                                                           |
| `sessionId` | string |          | Continue a conversation (from an earlier `session` / `done` event)                                        |
| `context`   | string |          | What the user is looking at, e.g. `The user is viewing application id cm…`, so "this one" can be resolved |

The response is a **Server-Sent Events** stream (`text/event-stream`): one JSON object per `data:` line,
in this order:

| `type`       | Fields                               | Meaning                                                                 |
| ------------ | ------------------------------------ | ----------------------------------------------------------------------- |
| `session`    | `sessionId`                          | Conversation id. Send it back as `sessionId` next time                  |
| `text`       | `delta`                              | Next piece of Claude's reply (markdown). Append them                    |
| `tool_start` | `id`, `name`, `input`                | Claude called a LifeOS tool (`name` without the `mcp__lifeos__` prefix) |
| `tool_end`   | `id`, `isError`                      | That tool call finished                                                 |
| `error`      | `message`                            | Something went wrong (shown to the user)                                |
| `done`       | `sessionId`, `isError`, `durationMs` | The turn is over; always the last event                                 |

Text and tool events can interleave (Claude may say something, call a tool, then continue).

```bash
curl -N -X POST http://localhost:3001/assistant/chat \
  -H "Content-Type: application/json" \
  -d '{ "message": "How many applications are waiting for a response?" }'
```

```
data: {"type":"session","sessionId":"556b8bb2-…"}

data: {"type":"tool_start","id":"toolu_01…","name":"get_dashboard","input":{}}

data: {"type":"tool_end","id":"toolu_01…","isError":false}

data: {"type":"text","delta":"You have **22** applications"}

data: {"type":"text","delta":" waiting for a response."}

data: {"type":"done","sessionId":"556b8bb2-…","isError":false,"durationMs":2675}
```

Notes:

- `EventSource` only supports `GET`, so read the stream with `fetch` and a `ReadableStream` reader (see
  `readEvents` in [`apps/web/src/lib/assistant.tsx`](../apps/web/src/lib/assistant.tsx)).
- **Closing the request stops Claude.**
- After a `tool_end` for `add_application`, `update_application`, `change_status`, `add_event` or
  `void_event` without an error, data changed; refetch what you display (`MUTATING_ASSISTANT_TOOLS`
  in `@lifeos/contracts`).
- If a `sessionId` no longer exists in Claude Code, a new conversation starts automatically and the
  new id arrives in `session`.
- Validation errors (e.g. an empty `message`) return the standard JSON error with `400` instead of a stream.
- Each message uses your Claude subscription, like using Claude Code directly.

---

## Reference

### Status

`SAVED` → `APPLIED` → `SCREENING` → `INTERVIEW` → `OFFER`, plus `REJECTED` and `WITHDRAWN`.
OFFER, REJECTED and WITHDRAWN are terminal (they end a process) but can still be changed.

### Event types

| Type                    | Added by         | Notes                          |
| ----------------------- | ---------------- | ------------------------------ |
| `CREATED`               | system           | When the application was added |
| `STATUS_CHANGED`        | system           | `metadata: { from, to }`       |
| `APPLICATION_SUBMITTED` | system or manual |                                |
| `RECRUITER_CONTACT`     | manual           |                                |
| `INTERVIEW_SCHEDULED`   | manual           | Requires `scheduledFor`        |
| `INTERVIEW_COMPLETED`   | manual           |                                |
| `ASSIGNMENT_RECEIVED`   | manual           |                                |
| `FOLLOW_UP`             | manual           |                                |
| `REJECTION`             | system or manual |                                |
| `OFFER`                 | system or manual |                                |
| `WITHDRAWN`             | system or manual |                                |
| `NOTE`                  | manual           |                                |

"Manual" types can be sent to `POST /applications/:id/events`; `CREATED` and `STATUS_CHANGED` are only
recorded by the system.

### Application

```json
{
  "id": "cmuu7m97i0021w1kcodtjj4q1",
  "company": { "id": "cmuu7m96d0008w1kci70lf5sa", "name": "Acme GmbH" },
  "title": "Frontend Engineer",
  "url": "https://jobs.acme.example/123",
  "location": "Berlin",
  "employmentType": "Full-time",
  "description": null,
  "status": "INTERVIEW",
  "appliedAt": "2026-09-07T22:00:00.000Z",
  "nextAction": "Prepare system design examples",
  "nextActionDate": "2026-10-09T22:00:00.000Z",
  "recruiterName": "Jane Doe",
  "recruiterEmail": "jane@acme.example",
  "notes": null,
  "lastActivityAt": "2026-10-04T20:05:36.233Z",
  "createdAt": "2026-09-07T22:00:00.000Z",
  "updatedAt": "2026-10-04T20:05:36.247Z"
}
```

`lastActivityAt` is the `occurredAt` of the latest non-voided event (maintained automatically).

### Event

```json
{
  "id": "cmuu93azz0001w1l0na268rly",
  "applicationId": "cmuu7m97i0021w1kcodtjj4q1",
  "type": "INTERVIEW_SCHEDULED",
  "title": "Interview scheduled",
  "description": "Video call",
  "occurredAt": "2026-10-04T20:05:36.233Z",
  "scheduledFor": "2026-10-12T09:00:00.000Z",
  "metadata": null,
  "voidedAt": null,
  "voidReason": null,
  "createdAt": "2026-10-04T20:05:36.239Z"
}
```

### Company

```json
{
  "id": "cmuu7m96g000ew1kc6i1tctaz",
  "name": "Acme GmbH",
  "website": "https://acme.example",
  "location": "Berlin",
  "notes": null,
  "applicationCount": 3,
  "createdAt": "2026-10-04T19:24:21.113Z",
  "updatedAt": "2026-10-04T19:24:21.113Z"
}
```

`GET /companies/:id` adds `"applications": Application[]`.
