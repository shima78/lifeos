import { toBerlinDateString, toBerlinTimeString } from '@lifeos/contracts';
import ExcelJS from 'exceljs';
import { THEME, type Tone } from './colors';

export type CellKind = 'text' | 'date' | 'datetime' | 'url' | 'longtext' | 'number';

export interface Column<Row> {
  header: string;
  width: number;
  kind?: CellKind;
  value: (row: Row) => string | number | null | undefined;
  /** Colored cell (tinted background, dark text), e.g. the status column. */
  tone?: (row: Row) => Tone | undefined;
  /** Extra font settings for this cell, e.g. red for an overdue date. */
  font?: (row: Row) => Partial<ExcelJS.Font> | undefined;
}

export interface SheetOptions<Row> {
  /** Rows to grey out and strike through (voided events, finished tasks). */
  muted?: (row: Row) => boolean;
  tabColor?: string;
}

const DATE_FORMAT = 'dd mmm yyyy';
const DATETIME_FORMAT = 'dd mmm yyyy hh:mm';
const thin = { style: 'thin' as const, color: { argb: THEME.border } };

/**
 * Excel dates have no time zone: they are wall-clock values. Convert a UTC instant to the
 * Berlin calendar date / time the app shows, expressed as a UTC Date (what exceljs writes as-is).
 */
export function berlinCellDate(iso: string, withTime: boolean): Date {
  const [y, m, d] = toBerlinDateString(iso).split('-').map(Number);
  const [hh, mm] = withTime ? toBerlinTimeString(iso).split(':').map(Number) : [0, 0];
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0));
}

function cellValue(kind: CellKind, raw: string | number): ExcelJS.CellValue {
  if (typeof raw === 'number') return raw;
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

const solid = (argb: string): ExcelJS.Fill => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb },
});

function styleHeader(row: ExcelJS.Row): void {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: THEME.headerFont } };
    cell.fill = solid(THEME.header);
    cell.alignment = { vertical: 'middle', indent: 1 };
    cell.border = { bottom: thin };
  });
}

/**
 * Adds a formatted sheet: dark frozen header with filters, banded rows, light borders, typed
 * cells (real dates, clickable links) and color-coded columns.
 */
export function addSheet<Row>(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: Column<Row>[],
  rows: Row[],
  options: SheetOptions<Row> = {},
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    properties: options.tabColor ? { tabColor: { argb: options.tabColor } } : undefined,
  });
  // Room for the header text plus the filter arrow; date-times need ~19 characters.
  sheet.columns = columns.map((c) => ({
    header: c.header,
    width: Math.max(c.width, c.header.length + 6, c.kind === 'datetime' ? 19 : 0),
  }));
  styleHeader(sheet.getRow(1));

  rows.forEach((row, index) => {
    const excelRow = sheet.addRow(
      columns.map((c) => {
        const raw = c.value(row);
        return raw === null || raw === undefined || raw === ''
          ? null
          : cellValue(c.kind ?? 'text', raw);
      }),
    );
    excelRow.height = 20;
    const muted = options.muted?.(row) ?? false;
    const banded = index % 2 === 1;

    columns.forEach((c, i) => {
      const cell = excelRow.getCell(i + 1);
      const tone = muted ? undefined : c.tone?.(row);
      cell.border = { bottom: thin };
      cell.alignment = {
        vertical: 'middle',
        // Long text stays on one line so rows keep an even height; the full text is in the cell.
        wrapText: false,
        indent: 1,
      };
      if (c.kind === 'date') cell.numFmt = DATE_FORMAT;
      if (c.kind === 'datetime') cell.numFmt = DATETIME_FORMAT;

      if (tone && cell.value !== null) {
        cell.fill = solid(tone.fill);
        cell.font = { bold: true, color: { argb: tone.font } };
      } else if (banded) {
        cell.fill = solid(THEME.band);
      }
      if (c.kind === 'url' && cell.value !== null) {
        cell.font = { color: { argb: THEME.link }, underline: true };
      }
      const extra = muted ? undefined : c.font?.(row);
      if (extra) cell.font = { ...cell.font, ...extra };
      if (muted)
        cell.font = { ...cell.font, color: { argb: THEME.muted }, strike: true, italic: true };
    });
  });

  if (rows.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }
  return sheet;
}

export interface SummaryLine {
  label: string;
  count: number;
  /** Solid swatch color for the label cell. */
  color?: string;
  tone?: Tone;
}

/** A first sheet with a title, a subtitle and colored counts with their share of the total. */
export function addSummarySheet(
  workbook: ExcelJS.Workbook,
  title: string,
  subtitle: string,
  heading: [string, string],
  lines: SummaryLine[],
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet('Summary', {
    views: [{ showGridLines: false }],
    properties: { tabColor: { argb: THEME.header } },
  });
  sheet.columns = [{ width: 3 }, { width: 26 }, { width: 14 }, { width: 12 }];
  const total = lines.reduce((n, l) => n + l.count, 0);

  sheet.getCell('B1').value = title;
  sheet.getCell('B1').font = { bold: true, size: 18 };
  sheet.getRow(1).height = 30;
  sheet.getCell('B2').value = subtitle;
  sheet.getCell('B2').font = { color: { argb: THEME.muted } };

  const head = sheet.getRow(4);
  head.values = ['', heading[0], heading[1], 'Share'];
  styleHeader(head);
  head.getCell(1).fill = { type: 'pattern', pattern: 'none' };
  head.getCell(1).border = {};

  lines.forEach((line, i) => {
    const row = sheet.getRow(5 + i);
    row.values = ['', line.label, line.count, total ? line.count / total : 0];
    row.height = 20;
    if (line.color) row.getCell(1).fill = solid(line.color);
    [2, 3, 4].forEach((col) => {
      const cell = row.getCell(col);
      cell.border = { bottom: thin };
      cell.alignment = { vertical: 'middle', indent: 1 };
      if (line.tone) cell.fill = solid(line.tone.fill);
      if (line.tone) cell.font = { color: { argb: line.tone.font }, bold: col === 2 };
    });
    row.getCell(4).numFmt = '0%';
  });

  const totalRow = sheet.getRow(5 + lines.length);
  totalRow.values = ['', 'Total', total, total ? 1 : 0];
  totalRow.getCell(4).numFmt = '0%';
  [2, 3, 4].forEach((col) => {
    const cell = totalRow.getCell(col);
    cell.font = { bold: true };
    cell.border = { top: { style: 'medium', color: { argb: THEME.header } } };
    cell.alignment = { vertical: 'middle', indent: 1 };
  });
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
