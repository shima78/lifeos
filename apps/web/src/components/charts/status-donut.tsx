'use client';

import { type ApplicationStatus, STATUS_LABELS } from '@lifeos/contracts';
import { statusColor } from '@/components/status-badge';

export interface Slice {
  key: ApplicationStatus | 'OTHER';
  label: string;
  count: number;
  color: string;
}

/** Part-to-whole reads at a glance only with few segments; extra statuses fold into "Other". */
export const MAX_SLICES = 6;

export function toSlices(data: { status: ApplicationStatus; count: number }[]): Slice[] {
  const nonZero = data.filter((d) => d.count > 0);
  const slices: Slice[] = nonZero.map((d) => ({
    key: d.status,
    label: STATUS_LABELS[d.status],
    count: d.count,
    color: statusColor(d.status),
  }));
  if (slices.length <= MAX_SLICES) return slices;
  // Keep the largest five in pipeline order, fold the rest.
  const keep = new Set(
    [...slices]
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_SLICES - 1)
      .map((s) => s.key),
  );
  const rest = slices.filter((s) => !keep.has(s.key));
  return [
    ...slices.filter((s) => keep.has(s.key)),
    {
      key: 'OTHER',
      label: 'Other',
      count: rest.reduce((n, s) => n + s.count, 0),
      color: 'var(--chart-muted)',
    },
  ];
}

const SIZE = 168;
const OUTER = 80;
const INNER = 56;

function arcPath(start: number, end: number): string {
  // Angles in radians, 0 = 12 o'clock, clockwise.
  const pt = (r: number, a: number) => [SIZE / 2 + r * Math.sin(a), SIZE / 2 - r * Math.cos(a)];
  const large = end - start > Math.PI ? 1 : 0;
  const [x1, y1] = pt(OUTER, start);
  const [x2, y2] = pt(OUTER, end);
  const [x3, y3] = pt(INNER, end);
  const [x4, y4] = pt(INNER, start);
  return `M${x1},${y1} A${OUTER},${OUTER} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${INNER},${INNER} 0 ${large} 0 ${x4},${y4} Z`;
}

/**
 * Donut of applications by status. Segments are separated by a 2px surface-colored gap; the
 * center shows the total, or the hovered status's count and share. Identity is carried by the
 * labelled legend rendered next to it (PipelineChart), never by color alone.
 */
export function StatusDonut({
  slices,
  total,
  active,
  onActiveChange,
}: {
  slices: Slice[];
  total: number;
  active: Slice['key'] | null;
  onActiveChange: (key: Slice['key'] | null) => void;
}) {
  const sum = slices.reduce((n, s) => n + s.count, 0);
  const focused = slices.find((s) => s.key === active);

  let angle = 0;
  const arcs = slices.map((s) => {
    const sweep = sum ? (s.count / sum) * Math.PI * 2 : 0;
    const arc = { slice: s, start: angle, end: angle + sweep };
    angle += sweep;
    return arc;
  });

  return (
    <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
      <svg
        width={SIZE}
        height={SIZE}
        role="img"
        aria-label={`Applications by status: ${slices.map((s) => `${s.label} ${s.count}`).join(', ')}`}
      >
        {sum === 0 && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={(OUTER + INNER) / 2}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={OUTER - INNER}
          />
        )}
        {arcs.length === 1 && arcs[0] ? (
          // A full ring can't be drawn as one arc.
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={(OUTER + INNER) / 2}
            fill="none"
            stroke={arcs[0].slice.color}
            strokeWidth={OUTER - INNER}
            onMouseEnter={() => onActiveChange(arcs[0]!.slice.key)}
            onMouseLeave={() => onActiveChange(null)}
          />
        ) : (
          arcs.map(({ slice, start, end }) => (
            <path
              key={slice.key}
              d={arcPath(start, end)}
              fill={slice.color}
              stroke="var(--card)"
              strokeWidth={2}
              strokeLinejoin="round"
              opacity={active === null || active === slice.key ? 1 : 0.35}
              className="cursor-pointer transition-opacity"
              onMouseEnter={() => onActiveChange(slice.key)}
              onMouseLeave={() => onActiveChange(null)}
            >
              <title>{`${slice.label}: ${slice.count}`}</title>
            </path>
          ))
        )}
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-2xl leading-none font-semibold">{focused ? focused.count : total}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {focused
              ? `${focused.label} · ${total ? Math.round((focused.count / total) * 100) : 0}%`
              : 'applications'}
          </p>
        </div>
      </div>
    </div>
  );
}
