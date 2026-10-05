'use client';

import { useState } from 'react';
import { formatDate } from '@/lib/format';
import { columnPath, niceScale, useSize } from './use-width';

export interface WeekPoint {
  weekStart: string;
  count: number;
}

/** Minimum chart height; the chart grows to fill its container. */
const MIN_HEIGHT = 200;
const PAD = { top: 20, right: 8, bottom: 28, left: 28 };
const MAX_BAR = 24;

/** "28 Sep" from a YYYY-MM-DD week start (a Berlin calendar day). */
const shortDay = (weekStart: string) => formatDate(`${weekStart}T12:00:00Z`).slice(0, 6);

/**
 * Applications per week: a single-series column chart (no legend; the card title names it).
 * Only the current week carries a direct label; hover shows any week's value.
 */
export function WeeklyChart({ data }: { data: WeekPoint[] }) {
  const [ref, { width, height: boxHeight }] = useSize<HTMLDivElement>();
  const HEIGHT = Math.max(MIN_HEIGHT, boxHeight);
  const [hover, setHover] = useState<number | null>(null);

  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const { max, step } = niceScale(Math.max(...data.map((d) => d.count), 0));
  const band = data.length ? innerW / data.length : 0;
  const barW = Math.min(MAX_BAR, band * 0.6);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  const last = data.length - 1;
  const peak = data.reduce((best, d, i) => (d.count > (data[best]?.count ?? 0) ? i : best), 0);
  const hovered = hover !== null ? data[hover] : undefined;
  // On narrow charts, label every other week (always including the current one).
  const labelEvery = band < 48 ? 2 : 1;

  return (
    <div ref={ref} className="relative min-h-[200px] flex-1">
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          className="block"
          role="img"
          aria-label="Applications per week"
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
            const h = innerH - (y(d.count) - PAD.top);
            const active = hover === i;
            return (
              <g key={d.weekStart}>
                <path
                  d={columnPath(cx - barW / 2, y(d.count), barW, h)}
                  fill="var(--chart-series)"
                  opacity={hover === null || active ? 1 : 0.45}
                />
                {(i === last || i === peak) && d.count > 0 && (
                  <text
                    x={cx}
                    y={y(d.count) - 6}
                    textAnchor="middle"
                    className="fill-foreground text-[11px] font-medium tabular-nums"
                  >
                    {d.count}
                  </text>
                )}
                <text
                  x={cx}
                  y={HEIGHT - 8}
                  textAnchor="middle"
                  className={
                    i === last
                      ? 'fill-foreground text-[11px] font-medium'
                      : 'fill-muted-foreground text-[11px]'
                  }
                >
                  {i === last
                    ? band < 48
                      ? 'Now'
                      : 'This week'
                    : (last - i) % labelEvery === 0
                      ? shortDay(d.weekStart)
                      : ''}
                </text>
                {/* Hit target: the whole band, larger than the mark. */}
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
        </svg>
      )}
      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: PAD.left + band * hover + band / 2, top: y(hovered.count) - 8 }}
        >
          <p className="text-muted-foreground">
            Week of {formatDate(`${hovered.weekStart}T12:00:00Z`)}
          </p>
          <p className="font-medium tabular-nums">
            {hovered.count} {hovered.count === 1 ? 'application' : 'applications'}
          </p>
        </div>
      )}
      <table className="sr-only">
        <caption>Applications per week</caption>
        <thead>
          <tr>
            <th>Week starting</th>
            <th>Applications</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.weekStart}>
              <td>{formatDate(`${d.weekStart}T12:00:00Z`)}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A 12px-tall sparkline of weekly counts: muted history, accent current week. */
export function Sparkline({ data }: { data: WeekPoint[] }) {
  const w = 72;
  const h = 24;
  const max = Math.max(1, ...data.map((d) => d.count));
  const gap = 2;
  const barW = (w - gap * (data.length - 1)) / Math.max(1, data.length);
  return (
    <svg width={w} height={h} aria-hidden className="shrink-0">
      {data.map((d, i) => {
        const bh = Math.max(d.count > 0 ? 2 : 1, (d.count / max) * h);
        return (
          <rect
            key={d.weekStart}
            x={i * (barW + gap)}
            y={h - bh}
            width={barW}
            height={bh}
            rx={1}
            fill={i === data.length - 1 ? 'var(--chart-series)' : 'var(--chart-axis)'}
          />
        );
      })}
    </svg>
  );
}
