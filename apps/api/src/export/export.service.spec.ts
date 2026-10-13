import {
  applicationListQuerySchema,
  changeStatusSchema,
  createApplicationSchema,
  createTaskSchema,
} from '@lifeos/contracts';
import ExcelJS from 'exceljs';
import { ApplicationsService } from '../applications/applications.service';
import { TasksService } from '../tasks/tasks.service';
import { type TestContext, createTestContext, resetDatabase } from '../test-utils/test-app';
import { ExportService } from './export.service';
import { THEME, statusTone } from './colors';
import { berlinCellDate } from './workbook';

async function read(data: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  // exceljs types expect an ArrayBuffer-like input.
  await workbook.xlsx.load(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
  );
  return workbook;
}

const headers = (sheet: ExcelJS.Worksheet) =>
  (sheet.getRow(1).values as unknown[]).slice(1).map(String);

describe('ExportService', () => {
  let ctx: TestContext;
  let service: ExportService;

  beforeAll(async () => {
    ctx = await createTestContext();
    service = ctx.module.get(ExportService);
    await resetDatabase(ctx.prisma);
    ctx.clock.set('2026-10-13T10:00:00.000Z');

    const apps = ctx.module.get(ApplicationsService);
    const { application: acme } = await apps.create(
      createApplicationSchema.parse({
        companyName: 'Acme GmbH',
        title: 'Frontend Engineer',
        url: 'https://jobs.acme.example/1',
        status: 'APPLIED',
        appliedAt: '2026-10-01',
      }),
    );
    await apps.changeStatus(acme.id, changeStatusSchema.parse({ status: 'INTERVIEW' }));
    await apps.create(
      createApplicationSchema.parse({
        companyName: 'Globex',
        title: 'Data Engineer',
        status: 'SAVED',
      }),
    );
    await ctx.module.get(TasksService).create(
      createTaskSchema.parse({
        title: 'Prepare interview',
        dueDate: '2026-10-15',
        applicationId: acme.id,
      }),
    );
  });
  afterAll(() => ctx.module.close());

  it('exports applications and their timeline as formatted, color-coded sheets', async () => {
    const file = await service.applicationsFile();
    expect(file.filename).toBe('lifeos-applications-2026-10-13.xlsx');
    expect(file.contentType).toContain('spreadsheetml');

    const workbook = await read(file.data);
    expect(workbook.worksheets.map((s) => s.name)).toEqual(['Summary', 'Applications', 'Timeline']);

    const apps = workbook.getWorksheet('Applications')!;
    expect(headers(apps).slice(0, 6)).toEqual([
      'Company',
      'Position',
      'Status',
      'Location',
      'Employment type',
      'Applied',
    ]);
    expect(apps.rowCount).toBe(3); // header + 2 applications
    expect(apps.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(apps.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });

    const acme = apps.getRow(2).getCell(1).value === 'Acme GmbH' ? apps.getRow(2) : apps.getRow(3);
    expect(acme.getCell(3).value).toBe('Interview');
    // Status cells are color-coded like the app: violet tint with darker violet text.
    expect(acme.getCell(3).fill).toMatchObject({ fgColor: { argb: statusTone('INTERVIEW').fill } });
    expect(acme.getCell(3).font).toMatchObject({
      bold: true,
      color: { argb: statusTone('INTERVIEW').font },
    });
    expect(apps.getRow(1).getCell(1).fill).toMatchObject({ fgColor: { argb: THEME.header } });
    // Applied on 1 Oct (a Berlin calendar day) is a real Excel date, shown as that day.
    expect(acme.getCell(6).value).toEqual(new Date(Date.UTC(2026, 9, 1)));
    expect(acme.getCell(6).numFmt).toBe('dd mmm yyyy');
    expect(acme.getCell(12).value).toMatchObject({ hyperlink: 'https://jobs.acme.example/1' });

    const timeline = workbook.getWorksheet('Timeline')!;
    const types = timeline.getColumn(4).values.slice(2);
    expect(types).toEqual(
      expect.arrayContaining(['Created', 'Application submitted', 'Status changed']),
    );
  });

  it('starts with a summary of counts per status', async () => {
    const sheet = (await read((await service.applicationsFile()).data)).getWorksheet('Summary')!;
    expect(sheet.getCell('B1').value).toBe('Job applications');
    const rows: Record<string, unknown> = {};
    sheet.eachRow((row, i) => {
      if (i > 4) rows[String(row.getCell(2).value)] = row.getCell(3).value;
    });
    expect(rows).toMatchObject({ Saved: 1, Interview: 1, Applied: 0, Total: 2 });
  });

  it('applies the same filters as the list', async () => {
    const file = await service.applicationsFile(
      applicationListQuerySchema.parse({ status: ['SAVED'] }),
    );
    const sheet = (await read(file.data)).getWorksheet('Applications')!;
    expect(sheet.rowCount).toBe(2);
    expect(sheet.getRow(2).getCell(1).value).toBe('Globex');
  });

  it('exports tasks', async () => {
    const file = await service.tasksFile();
    expect(file.filename).toBe('lifeos-tasks-2026-10-13.xlsx');
    const workbook = await read(file.data);
    expect(workbook.worksheets.map((s) => s.name)).toEqual(['Summary', 'Tasks']);
    const sheet = workbook.getWorksheet('Tasks')!;
    expect(headers(sheet)[0]).toBe('Task');
    const row = sheet.getRow(2);
    expect(row.getCell(1).value).toBe('Prepare interview');
    expect(row.getCell(4).value).toEqual(new Date(Date.UTC(2026, 9, 15)));
    expect(row.getCell(6).value).toBe('Acme GmbH · Frontend Engineer');
  });

  it('writes Berlin wall-clock times', () => {
    // 22:30 UTC on 4 Oct is 00:30 on 5 Oct in Berlin (CEST).
    expect(berlinCellDate('2026-10-04T22:30:00Z', true)).toEqual(
      new Date(Date.UTC(2026, 9, 5, 0, 30)),
    );
    expect(berlinCellDate('2026-10-04T22:30:00Z', false)).toEqual(new Date(Date.UTC(2026, 9, 5)));
  });
});
