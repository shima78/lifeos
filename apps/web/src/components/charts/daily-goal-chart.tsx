'use client';

import { useState } from 'react';
import { formatDate } from '@/lib/format';
import { columnPath, niceScale, useSize } from './use-width';

export interface DayPoint {
  /** YYYY-MM-DD (Berlin calendar day). */
  date: string;
  count: number;
}

const MIN_HEIGHT = 200;
const PAD = { top: 22, right: 8, bottom: 28, left: 28 };
const MAX_BAR = 24;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const noon = (date: string) => `${date}T12:00:00Z`;
const weekday = (date: string) => WEEKDAYS[new Date(noon(date)).getUTCDay()];
const shortDay = (date: string) => formatDate(noon(date)).slice(0, 6);

/** Days in a row, ending today, that met the goal. Today counts once met; until then it is skipped. */
export function goalStreak(data: DayPoint[], goal: number): number {
  let streak = 0;
  for (let i = data.length - 1; i >= 0; i--) {
    const met = (data[i]?.count ?? 0) >= goal;
    if (met) streak++;
    else if (i === data.length - 1)
      continue; // today still in progress
    else break;
  }
  return streak;
}

/**
 * Applications per day against the daily goal. One series: days that met the goal are solid,
 * days below it are a lighter step of the same hue. The goal is a labelled reference line.
 */
export function DailyGoalChart({ data, goal }: { data: DayPoint[]; goal: number }) {
  const [ref, { width, height: boxHeight }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const HEIGHT = Math.max(MIN_HEIGHT, boxHeight);
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const { max, step } = niceScale(Math.max(goal, ...data.map((d) => d.count)) + 1);
  const band = data.length ? innerW / data.length : 0;
  const barW = Math.min(MAX_BAR, Math.max(2, band * 0.65));
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  const last = data.length - 1;
  // Label roughly once a week, always ending on today.
  const labelEvery = Math.max(1, Math.ceil(56 / Math.max(band, 1)));
  const hovered = hover !== null ? data[hover] : undefined;

  return (
    <div ref={ref} className="relative min-h-[200px] flex-1">
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          className="block"
          role="img"
          aria-label={`Applications per day, goal ${goal} per day`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? 'var(--chart-axis)' : 'var(--chart-grid)'}
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text
                x={PAD.left - 8}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {t}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const cx = PAD.left + band * i + band / 2;
            const met = d.count >= goal;
            const dimmed = hover !== null && hover !== i;
            return (
              <g key={d.date}>
                {d.count > 0 && (
                  <path
                    d={columnPath(
                      cx - barW / 2,
                      y(d.count),
                      barW,
                      innerH - (y(d.count) - PAD.top),
                      3,
                    )}
                    fill="var(--chart-series)"
                    opacity={(met ? 1 : 0.4) * (dimmed ? 0.5 : 1)}
                  />
                )}
                {i === last && (
                  <text
                    x={cx}
                    y={y(d.count) - 6}
                    textAnchor="middle"
                    className="fill-foreground text-[11px] font-medium tabular-nums"
                  >
                    {d.count}
                  </text>
                )}
                {(last - i) % labelEvery === 0 && (
                  <text
                    x={cx}
                    y={HEIGHT - 8}
                    textAnchor={i === last ? 'end' : 'middle'}
                    dx={i === last ? band / 2 : 0}
                    className={
                      i === last
                        ? 'fill-foreground text-[11px] font-medium'
                        : 'fill-muted-foreground text-[11px]'
                    }
                  >
                    {i === last ? 'Today' : shortDay(d.date)}
                  </text>
                )}
                <rect
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          })}

          {/* Goal reference line, drawn over the bars so it stays visible. */}
          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={y(goal)}
            y2={y(goal)}
            stroke="var(--foreground)"
            strokeOpacity={0.55}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            pointerEvents="none"
          />
          <text
            x={width - PAD.right}
            y={y(goal) - 6}
            textAnchor="end"
            className="fill-foreground text-[11px] font-medium"
            pointerEvents="none"
          >
            Goal {goal}/day
          </text>
        </svg>
      )}

      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md"
          style={{
            left: Math.min(Math.max(PAD.left + band * hover + band / 2, 70), width - 70),
            top: Math.min(y(hovered.count), y(goal)) - 8,
          }}
        >
          <p className="text-muted-foreground">
            {weekday(hovered.date)} {formatDate(noon(hovered.date))}
          </p>
          <p className="font-medium tabular-nums">
            {hovered.count} {hovered.count === 1 ? 'application' : 'applications'}
          </p>
          <p className="text-muted-foreground">
            {hovered.count >= goal ? 'Goal met' : `${goal - hovered.count} short of goal`}
          </p>
        </div>
      )}

      <table className="sr-only">
        <caption>Applications per day (goal {goal})</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Applications</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{formatDate(noon(d.date))}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Small legend for the two bar states and the goal line. */
export function DailyGoalLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] bg-chart-series" aria-hidden /> Goal met
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] bg-chart-series opacity-40" aria-hidden /> Below
        goal
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-4 border-t-[1.5px] border-dashed border-foreground/55" aria-hidden />{' '}
        Goal
      </span>
    </div>
  );
}
