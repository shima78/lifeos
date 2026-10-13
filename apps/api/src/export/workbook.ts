import { toBerlinDateString, toBerlinTimeString } from '@lifeos/contracts';
import ExcelJS from 'exceljs';

export type CellKind = 'text' | 'date' | 'datetime' | 'url' | 'longtext';

export interface Column<Row> {
  header: string;
  width: number;
  kind?: CellKind;
  value: (row: Row) => string | null | undefined;
}

const DATE_FORMAT = 'dd mmm yyyy';
const DATETIME_FORMAT = 'dd mmm yyyy hh:mm';

/**
 * Excel dates have no time zone: they are wall-clock values. Convert a UTC instant to the
 * Berlin calendar date / time the app shows, expressed as a UTC Date (what exceljs writes as-is).
 */
export function berlinCellDate(iso: string, withTime: boolean): Date {
  const [y, m, d] = toBerlinDateString(iso).split('-').map(Number);
  const [hh, mm] = withTime ? toBerlinTimeString(iso).split(':').map(Number) : [0, 0];
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0));
}

function cellValue(kind: CellKind, raw: string): ExcelJS.CellValue {
  switch (kind) {
    case 'date':
      return berlinCellDate(raw, false);
    case 'datetime':
      return berlinCellDate(raw, true);
    case 'url':
      return { text: raw, hyperlink: raw };
    default:
      return raw;
  }
}

/** Adds a formatted sheet: bold frozen header, filters, column widths, typed cells. */
export function addSheet<Row>(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: Column<Row>[],
  rows: Row[],
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map((c) => ({
    header: c.header,
    width: c.width,
    style:
      c.kind === 'date'
        ? { numFmt: DATE_FORMAT }
        : c.kind === 'datetime'
          ? { numFmt: DATETIME_FORMAT }
          : {},
  }));

  for (const row of rows) {
    sheet.addRow(
      columns.map((c) => {
        const raw = c.value(row);
        return raw === null || raw === undefined || raw === ''
          ? null
          : cellValue(c.kind ?? 'text', raw);
      }),
    );
  }

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEEEB' } };
  header.alignment = { vertical: 'middle' };
  columns.forEach((c, i) => {
    const col = sheet.getColumn(i + 1);
    if (c.kind === 'url') col.font = { color: { argb: 'FF2A78D6' }, underline: true };
    if (c.kind === 'longtext') col.alignment = { wrapText: true, vertical: 'top' };
  });
  if (rows.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }
  return sheet;
}

export function newWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LifeOS';
  workbook.created = new Date();
  return workbook;
}

export async function toBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
