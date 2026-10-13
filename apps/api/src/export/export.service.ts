import {
  APPLICATION_STATUSES,
  type ApplicationDto,
  type ApplicationEventDto,
  type ApplicationListQuery,
  EVENT_TYPE_LABELS,
  STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type TaskBucket,
  type TaskDto,
  type TaskListQuery,
  calendarDaysBetween,
  formatDate,
  isTerminalStatus,
  toBerlinDateString,
} from '@lifeos/contracts';
import { Injectable } from '@nestjs/common';
import { ApplicationsService } from '../applications/applications.service';
import { Clock } from '../common/clock';
import { EventsService } from '../events/events.service';
import { TasksService } from '../tasks/tasks.service';
import {
  THEME,
  argb,
  eventTone,
  priorityTone,
  statusSolid,
  statusTone,
  taskStatusTone,
  tint,
  shade,
} from './colors';
import { type Column, addSheet, addSummarySheet, newWorkbook, toBuffer } from './workbook';

export interface ExportFile {
  filename: string;
  contentType: string;
  data: Buffer;
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const overdueFont = { color: { argb: THEME.danger }, bold: true };

const applicationColumns = (now: Date): Column<ApplicationDto>[] => [
  { header: 'Company', width: 22, value: (a) => a.company.name, font: () => ({ bold: true }) },
  { header: 'Position', width: 36, value: (a) => a.title },
  {
    header: 'Status',
    width: 13,
    value: (a) => STATUS_LABELS[a.status],
    tone: (a) => statusTone(a.status),
  },
  { header: 'Location', width: 16, value: (a) => a.location },
  { header: 'Employment type', width: 16, value: (a) => a.employmentType },
  { header: 'Applied', width: 13, kind: 'date', value: (a) => a.appliedAt },
  { header: 'Last activity', width: 13, kind: 'date', value: (a) => a.lastActivityAt },
  { header: 'Next action', width: 28, value: (a) => a.nextAction },
  {
    header: 'Next action date',
    width: 16,
    kind: 'date',
    value: (a) => a.nextActionDate,
    font: (a) =>
      a.nextActionDate &&
      !isTerminalStatus(a.status) &&
      calendarDaysBetween(now, a.nextActionDate) < 0
        ? overdueFont
        : undefined,
  },
  { header: 'Recruiter', width: 18, value: (a) => a.recruiterName },
  { header: 'Recruiter email', width: 26, value: (a) => a.recruiterEmail },
  { header: 'Posting URL', width: 40, kind: 'url', value: (a) => a.url },
  { header: 'Notes', width: 40, kind: 'longtext', value: (a) => a.notes },
  { header: 'Job description', width: 50, kind: 'longtext', value: (a) => a.description },
  { header: 'Added', width: 13, kind: 'date', value: (a) => a.createdAt },
];

type TimelineRow = ApplicationEventDto & { application: ApplicationDto };

const TIMELINE_COLUMNS: Column<TimelineRow>[] = [
  { header: 'Company', width: 22, value: (e) => e.application.company.name },
  { header: 'Position', width: 32, value: (e) => e.application.title },
  { header: 'Date', width: 17, kind: 'datetime', value: (e) => e.occurredAt },
  {
    header: 'Type',
    width: 22,
    value: (e) => EVENT_TYPE_LABELS[e.type],
    tone: (e) => eventTone(e.type),
  },
  { header: 'Title', width: 34, value: (e) => e.title },
  { header: 'Description', width: 50, kind: 'longtext', value: (e) => e.description },
  { header: 'Scheduled for', width: 17, kind: 'datetime', value: (e) => e.scheduledFor },
  { header: 'Voided', width: 8, value: (e) => (e.voidedAt ? 'Yes' : '') },
  { header: 'Void reason', width: 30, value: (e) => e.voidReason },
];

const TASK_COLUMNS: Column<TaskDto>[] = [
  { header: 'Task', width: 40, value: (t) => t.title, font: () => ({ bold: true }) },
  {
    header: 'Status',
    width: 13,
    value: (t) => TASK_STATUS_LABELS[t.status],
    tone: (t) => taskStatusTone(t.status),
  },
  {
    header: 'Priority',
    width: 11,
    value: (t) => TASK_PRIORITY_LABELS[t.priority],
    tone: (t) => priorityTone(t.priority),
  },
  {
    header: 'Due',
    width: 13,
    kind: 'date',
    value: (t) => t.dueDate,
    font: (t) => (t.bucket === 'overdue' ? overdueFont : undefined),
  },
  { header: 'Completed', width: 17, kind: 'datetime', value: (t) => t.completedAt },
  {
    header: 'Application',
    width: 40,
    value: (t) => (t.application ? `${t.application.company.name} · ${t.application.title}` : ''),
  },
  { header: 'Notes', width: 50, kind: 'longtext', value: (t) => t.notes },
  { header: 'Added', width: 13, kind: 'date', value: (t) => t.createdAt },
];

const TASK_SUMMARY: { bucket: TaskBucket; label: string; hex: string }[] = [
  { bucket: 'overdue', label: 'Overdue', hex: 'e34948' },
  { bucket: 'today', label: 'Today', hex: 'eb6834' },
  { bucket: 'upcoming', label: 'Upcoming', hex: '2a78d6' },
  { bucket: 'someday', label: 'No date', hex: '898781' },
  { bucket: 'done', label: 'Completed', hex: '008300' },
];

/**
 * Builds Excel (.xlsx) exports. Transport-independent: returns the file as a Buffer with a
 * suggested name; the controller decides how to send it.
 */
@Injectable()
export class ExportService {
  constructor(
    private readonly applications: ApplicationsService,
    private readonly events: EventsService,
    private readonly tasks: TasksService,
    private readonly clock: Clock,
  ) {}

  /** The applications matching `query` (same filters and order as the list), plus their timeline. */
  async applicationsFile(query: Partial<ApplicationListQuery> = {}): Promise<ExportFile> {
    const apps = await this.applications.list(query);
    const byId = new Map(apps.map((a) => [a.id, a]));
    const events = await this.events.timelines(apps.map((a) => a.id));
    // Group the timeline by application in list order, oldest event first within each.
    const order = new Map(apps.map((a, i) => [a.id, i]));
    const timeline: TimelineRow[] = events
      .map((e) => ({ ...e, application: byId.get(e.applicationId)! }))
      .sort((a, b) => (order.get(a.applicationId) ?? 0) - (order.get(b.applicationId) ?? 0));

    const now = this.clock.now();
    const workbook = newWorkbook();
    addSummarySheet(
      workbook,
      'Job applications',
      `Exported from LifeOS on ${formatDate(now)} · ${apps.length} applications`,
      ['Status', 'Applications'],
      APPLICATION_STATUSES.map((s) => ({
        label: STATUS_LABELS[s],
        count: apps.filter((a) => a.status === s).length,
        color: statusSolid(s),
        tone: statusTone(s),
      })),
    );
    addSheet(workbook, 'Applications', applicationColumns(now), apps, {
      tabColor: argb('2a78d6'),
    });
    addSheet(workbook, 'Timeline', TIMELINE_COLUMNS, timeline, {
      muted: (e) => e.voidedAt !== null,
      tabColor: argb('4a3aa7'),
    });
    return this.file('applications', await toBuffer(workbook));
  }

  /** The tasks matching `query`, most urgent first. */
  async tasksFile(query: Partial<TaskListQuery> = {}): Promise<ExportFile> {
    const tasks = await this.tasks.list(query);
    const workbook = newWorkbook();
    addSummarySheet(
      workbook,
      'Tasks',
      `Exported from LifeOS on ${formatDate(this.clock.now())} · ${tasks.length} tasks`,
      ['When', 'Tasks'],
      TASK_SUMMARY.map(({ bucket, label, hex }) => ({
        label,
        count: tasks.filter((t) => t.bucket === bucket).length,
        color: argb(hex),
        tone: { fill: tint(hex), font: shade(hex) },
      })),
    );
    addSheet(workbook, 'Tasks', TASK_COLUMNS, tasks, {
      muted: (t) => t.status === 'DONE',
      tabColor: argb('008300'),
    });
    return this.file('tasks', await toBuffer(workbook));
  }

  private file(name: string, data: Buffer): ExportFile {
    const day = toBerlinDateString(this.clock.now());
    return { filename: `lifeos-${name}-${day}.xlsx`, contentType: XLSX, data };
  }
}
