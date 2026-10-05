'use client';

import { type RefObject, useEffect, useRef, useState } from 'react';

/** Tracks an element's content size, so SVG charts can render at real pixel sizes. */
export function useSize<T extends HTMLElement>(): [
  RefObject<T | null>,
  { width: number; height: number },
] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const rect = entry?.contentRect;
      setSize({ width: Math.floor(rect?.width ?? 0), height: Math.floor(rect?.height ?? 0) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

/** A clean axis maximum and tick step (1, 2, 5 × 10^n) for counts. */
export function niceScale(max: number, targetTicks = 4): { max: number; step: number } {
  if (max <= 0) return { max: 4, step: 1 };
  const rough = max / targetTicks;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const niceStep = Math.max(1, Math.ceil(step));
  return { max: Math.ceil(max / niceStep) * niceStep, step: niceStep };
}

/** SVG path for a column with a 4px rounded top and a square base. */
export function columnPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return [
    `M${x},${y + h}`,
    `V${y + rr}`,
    `Q${x},${y} ${x + rr},${y}`,
    `H${x + w - rr}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `V${y + h}`,
    'Z',
  ].join(' ');
}
