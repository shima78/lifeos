'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * One line of text that is cut off with "…" when it doesn't fit. Hovering shows the full text in
 * a tooltip, but only when it was actually cut off.
 *
 * Pass `href` inside rows that are made clickable by a stretched link: the text then sits above
 * that link (so it can receive the hover) and links to the same place itself.
 */
export function TruncatedText({
  text,
  href,
  className,
}: {
  text: string;
  href?: string;
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  const isTruncated = () => {
    const el = ref.current;
    return el ? el.scrollWidth > el.clientWidth + 1 : false;
  };

  const classes = cn('block truncate', href && 'relative z-[1]', className);

  return (
    <Tooltip open={open} onOpenChange={(next) => setOpen(next && isTruncated())}>
      <TooltipTrigger asChild>
        {href ? (
          <Link
            ref={(el) => {
              ref.current = el;
            }}
            href={href}
            tabIndex={-1}
            className={classes}
          >
            {text}
          </Link>
        ) : (
          <span
            ref={(el) => {
              ref.current = el;
            }}
            className={classes}
          >
            {text}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
