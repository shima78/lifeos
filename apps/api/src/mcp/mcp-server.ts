import {
  applicationListQuerySchema,
  changeStatusSchema,
  companyListQuerySchema,
  createApplicationSchema,
  createEventFieldsSchema,
  updateApplicationSchema,
  voidEventSchema,
} from '@lifeos/contracts';
import type { INestApplicationContext } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ApplicationsService } from '../applications/applications.service';
import { DomainError } from '../common/errors';
import { CompaniesService } from '../companies/companies.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { EventsService } from '../events/events.service';

const DATE_HINT =
  'Dates are "YYYY-MM-DD" (a calendar day in Europe/Berlin) or a full ISO-8601 datetime.';

const id = z.string().min(1).describe('Application id');

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/** Domain errors become tool errors the model can read and react to; anything else is rethrown. */
async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    if (err instanceof DomainError) {
      const body = { error: { code: err.code, message: err.message, details: err.details } };
      return { isError: true, content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }
    throw err;
  }
}

interface ToolConfig<S extends z.ZodTypeAny> {
  title: string;
  description: string;
  inputSchema?: S;
  annotations?: ToolAnnotations;
}

type LooseRegisterTool = (
  name: string,
  config: object,
  cb: (input: unknown) => Promise<CallToolResult>,
) => unknown;

/**
 * Registers a tool whose input is parsed by a shared contract schema. Wraps the SDK's
 * registerTool, whose generic inference over complex Zod schemas exhausts the TypeScript checker.
 */
function tool<S extends z.ZodTypeAny>(
  server: McpServer,
  name: string,
  config: ToolConfig<S>,
  handler: (input: z.output<S>) => Promise<unknown>,
): void {
  (server.registerTool.bind(server) as unknown as LooseRegisterTool)(name, config, (input) =>
    run(() => handler(input as z.output<S>)),
  );
}

/**
 * MCP tools over the same services the REST API uses. Inputs are validated with the shared
 * contract schemas, so Claude goes through exactly the same rules (duplicate detection, events,
 * transactions) as the web app. No LLM runs here: the model is in the MCP client (e.g. Claude
 * Desktop on the user's subscription), so no API key is ever needed.
 */
export function createMcpServer(app: INestApplicationContext): McpServer {
  const applications = app.get(ApplicationsService);
  const events = app.get(EventsService);
  const companies = app.get(CompaniesService);
  const dashboard = app.get(DashboardService);

  const server = new McpServer(
    { name: 'lifeos', version: '0.1.0' },
    {
      instructions:
        "LifeOS is the user's personal job-application tracker. Use add_application when the user " +
        'applies to, or wants to save, a job (pass the posting URL when known: duplicates are ' +
        'detected automatically). Use change_status when they hear back, and add_event to log ' +
        'recruiter contact, interviews, follow-ups and notes. ' +
        DATE_HINT,
    },
  );

  tool(
    server,
    'add_application',
    {
      title: 'Add application',
      description:
        'Track a new job application. The company is matched by name (case-insensitive) or ' +
        'created. If the URL is already tracked, nothing is created and the existing application ' +
        'is returned with duplicate=true. Without a URL, a matching company+title+location ' +
        'returns a POSSIBLE_DUPLICATE warning (the application is still created). Status ' +
        'defaults to SAVED; APPLIED or later sets appliedAt (default: now). ' +
        DATE_HINT,
      inputSchema: createApplicationSchema,
    },
    (input) => applications.create(input),
  );

  tool(
    server,
    'list_applications',
    {
      title: 'List applications',
      description:
        'List tracked applications with optional search (company or title), status filter, ' +
        'company, location and applied date range. Sorted by last activity, newest first, by default.',
      inputSchema: applicationListQuerySchema,
      annotations: { readOnlyHint: true },
    },
    (query) => applications.list(query),
  );

  tool(
    server,
    'get_application',
    {
      title: 'Get application',
      description: 'One application with its full timeline (newest first, voided events included).',
      inputSchema: z.object({ id }),
      annotations: { readOnlyHint: true },
    },
    async ({ id: appId }) => ({
      application: await applications.get(appId),
      timeline: await events.timeline(appId),
    }),
  );

  tool(
    server,
    'update_application',
    {
      title: 'Update application',
      description:
        'Update fields of an application (not its status: use change_status). Send an empty ' +
        'string to clear a field. ' +
        DATE_HINT,
      inputSchema: updateApplicationSchema.extend({ id }),
    },
    ({ id: appId, ...data }) => applications.update(appId, data),
  );

  tool(
    server,
    'change_status',
    {
      title: 'Change status',
      description:
        'Move an application to a new status (any transition is allowed). Records a ' +
        'STATUS_CHANGED event plus REJECTION / OFFER / WITHDRAWN / APPLICATION_SUBMITTED where ' +
        'implied. Setting the current status again does nothing. ' +
        DATE_HINT,
      inputSchema: changeStatusSchema.extend({ id }),
    },
    ({ id: appId, ...data }) => applications.changeStatus(appId, data),
  );

  tool(
    server,
    'add_event',
    {
      title: 'Add timeline event',
      description:
        'Log something that happened: recruiter contact, interview scheduled (requires ' +
        'scheduledFor) or completed, assignment, follow-up, note, etc. Does not change status. ' +
        DATE_HINT,
      inputSchema: createEventFieldsSchema.extend({ applicationId: id }),
    },
    ({ applicationId, ...data }) => events.add(applicationId, data),
  );

  tool(
    server,
    'void_event',
    {
      title: 'Void timeline event',
      description:
        'Mark a mistaken event as voided (events are never edited or deleted). Requires a reason.',
      inputSchema: voidEventSchema.extend({ applicationId: id, eventId: z.string().min(1) }),
      annotations: { destructiveHint: true },
    },
    ({ applicationId, eventId, ...data }) => events.void(applicationId, eventId, data),
  );

  tool(
    server,
    'list_companies',
    {
      title: 'List companies',
      description: 'Companies with their application counts.',
      inputSchema: companyListQuerySchema,
      annotations: { readOnlyHint: true },
    },
    (query) => companies.list(query),
  );

  tool(
    server,
    'get_dashboard',
    {
      title: 'Dashboard',
      description:
        'Overview: counts, applications by status, what needs attention (no response for 14+ ' +
        'days, next actions due, interviews in the next 7 days), upcoming interviews and recent activity.',
      annotations: { readOnlyHint: true },
    },
    () => dashboard.get(),
  );

  return server;
}
