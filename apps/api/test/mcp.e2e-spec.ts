import type {
  ApplicationDto,
  ApplicationEventDto,
  CreateApplicationResultDto,
  DashboardDto,
} from '@lifeos/contracts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from '../src/mcp/mcp-server';
import { type TestContext, createTestContext, resetDatabase } from '../src/test-utils/test-app';

describe('LifeOS MCP server (e2e)', () => {
  let ctx: TestContext;
  let client: Client;

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
    const first = result.content[0];
    const text = first && first.type === 'text' ? first.text : '';
    return { isError: result.isError === true, data: JSON.parse(text) as unknown };
  };

  beforeAll(async () => {
    ctx = await createTestContext();
    await resetDatabase(ctx.prisma);
    ctx.clock.set('2026-10-04T10:00:00.000Z');

    const server = createMcpServer(ctx.module);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });
  afterAll(async () => {
    await client.close();
    await ctx.module.close();
  });

  it('lists the tools with JSON schemas derived from the shared contracts', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'add_application',
        'add_event',
        'change_status',
        'get_application',
        'get_dashboard',
        'list_applications',
        'list_companies',
        'update_application',
        'void_event',
      ].sort(),
    );
    const add = tools.find((t) => t.name === 'add_application')!;
    expect(add.inputSchema.properties).toHaveProperty('companyName');
    expect(add.inputSchema.properties).toHaveProperty('url');
    expect(add.inputSchema.required).toEqual(expect.arrayContaining(['companyName', 'title']));
  });

  let applicationId: string;

  it('add_application creates the application, company and events', async () => {
    const { isError, data } = await call('add_application', {
      companyName: 'Acme GmbH',
      title: 'Senior Backend Engineer',
      url: 'https://jobs.acme.example/123?utm_source=linkedin',
      location: 'Berlin',
      status: 'APPLIED',
      appliedAt: '2026-10-02',
    });
    const result = data as CreateApplicationResultDto;

    expect(isError).toBe(false);
    expect(result.duplicate).toBe(false);
    expect(result.application).toMatchObject({
      title: 'Senior Backend Engineer',
      status: 'APPLIED',
      url: 'https://jobs.acme.example/123',
      appliedAt: '2026-10-01T22:00:00.000Z',
      company: { name: 'Acme GmbH' },
    });
    applicationId = result.application.id;
  });

  it('add_application with a known URL returns duplicate=true and creates nothing', async () => {
    const before = await ctx.prisma.client.applicationEvent.count();
    const { data } = await call('add_application', {
      companyName: 'Acme GmbH',
      title: 'Whatever',
      url: 'https://JOBS.acme.example/123/',
    });
    expect((data as CreateApplicationResultDto).duplicate).toBe(true);
    expect(await ctx.prisma.client.application.count()).toBe(1);
    expect(await ctx.prisma.client.applicationEvent.count()).toBe(before);
  });

  it('change_status, add_event and get_application work together', async () => {
    const changed = await call('change_status', {
      id: applicationId,
      status: 'INTERVIEW',
      note: 'Invited',
    });
    expect((changed.data as ApplicationDto).status).toBe('INTERVIEW');

    const event = await call('add_event', {
      applicationId,
      type: 'INTERVIEW_SCHEDULED',
      scheduledFor: '2026-10-08T09:00:00.000Z',
      description: 'Call with the team lead',
    });
    expect(event.isError).toBe(false);

    const { data } = await call('get_application', { id: applicationId });
    const detail = data as { application: ApplicationDto; timeline: ApplicationEventDto[] };
    expect(detail.timeline.map((e) => e.type)).toEqual(
      expect.arrayContaining([
        'CREATED',
        'APPLICATION_SUBMITTED',
        'STATUS_CHANGED',
        'INTERVIEW_SCHEDULED',
      ]),
    );

    const dashboard = (await call('get_dashboard')).data as DashboardDto;
    expect(dashboard.stats.interviews).toBe(1);
    expect(dashboard.upcomingInterviews).toHaveLength(1);
  });

  it('returns business-rule failures as readable tool errors', async () => {
    const missing = await call('get_application', { id: 'nope' });
    expect(missing.isError).toBe(true);
    expect(missing.data).toMatchObject({ error: { code: 'NOT_FOUND' } });

    const noDate = await call('add_event', { applicationId, type: 'INTERVIEW_SCHEDULED' });
    expect(noDate.isError).toBe(true);
    expect(noDate.data).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('rejects invalid input via the shared schemas', async () => {
    const result = (await client.callTool({
      name: 'add_application',
      arguments: { companyName: '', title: 'x', url: 'not-a-url' },
    })) as CallToolResult;
    expect(result.isError).toBe(true);
  });

  it('list_applications filters by status', async () => {
    const { data } = await call('list_applications', { status: ['INTERVIEW'] });
    expect((data as ApplicationDto[]).map((a) => a.id)).toEqual([applicationId]);
    const none = await call('list_applications', { status: ['OFFER'] });
    expect(none.data).toEqual([]);
  });
});
