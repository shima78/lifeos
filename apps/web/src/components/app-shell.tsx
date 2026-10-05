'use client';

import { PanelLeftClose, PanelLeftOpen, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { AssistantPanel } from '@/components/assistant/assistant-panel';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { useAssistant } from '@/lib/assistant';
import { NAV_MODULES, isActivePath, pageTitle } from '@/lib/navigation';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';

const SIDEBAR_KEY = 'lifeos.sidebar.open';

/**
 * Sidebar state. It's never hidden: closed, it is a narrow rail of icons; open, it shows labels.
 * On wide screens the open state pushes the content and is remembered. On small screens the open
 * menu slides over the content (the rail keeps its place) and closes again after navigating.
 */
function useSidebar(isDesktop: boolean) {
  const [docked, setDocked] = useState(true);
  const [overlay, setOverlay] = useState(false);
  // Animate only after the saved state is applied, so the page doesn't slide on load.
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_KEY) === 'false') setDocked(false);
    } catch {
      // Storage unavailable: keep the default.
    }
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const setDockedAndSave = useCallback((open: boolean) => {
    setDocked(open);
    try {
      localStorage.setItem(SIDEBAR_KEY, String(open));
    } catch {
      // Persistence is a convenience only.
    }
  }, []);

  const expanded = isDesktop ? docked : overlay;
  const toggle = useCallback(() => {
    if (isDesktop) setDockedAndSave(!docked);
    else setOverlay((o) => !o);
  }, [isDesktop, docked, setDockedAndSave]);
  const closeOverlay = useCallback(() => setOverlay(false), []);

  return { expanded, docked, overlay, toggle, closeOverlay, animate };
}

function Sidebar({
  expanded,
  overlay,
  onToggle,
  onNavigate,
}: {
  expanded: boolean;
  /** Small screens: the open menu floats over the content. */
  overlay: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const ToggleIcon = expanded ? PanelLeftClose : PanelLeftOpen;

  return (
    <aside
      id="app-sidebar"
      aria-label="Main menu"
      className={cn(
        'flex h-full flex-col overflow-hidden border-r bg-sidebar py-3',
        overlay ? 'w-60 px-3' : expanded ? 'w-full px-3' : 'w-full px-2',
        overlay && 'fixed inset-y-0 left-0 z-50 shadow-xl',
      )}
    >
      {/* Header: logo + the menu's open/close button */}
      <div
        className={cn('flex items-center', expanded ? 'justify-between pl-1' : 'flex-col gap-2')}
      >
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2.5 font-semibold tracking-tight"
          aria-label="LifeOS home"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground text-sm font-bold text-background">
            L
          </span>
          {expanded && <span className="text-[15px]">LifeOS</span>}
        </Link>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls="app-sidebar"
          aria-label={expanded ? 'Collapse menu' : 'Expand menu'}
          title={`${expanded ? 'Collapse' : 'Expand'} menu (Ctrl+B)`}
          className="text-muted-foreground"
        >
          <ToggleIcon />
        </Button>
      </div>

      {/* Navigation: icons always, labels and section names when expanded */}
      <nav className="mt-6 flex flex-1 flex-col gap-5 overflow-x-hidden overflow-y-auto">
        {NAV_MODULES.map((module, i) => (
          <div key={module.label}>
            {expanded ? (
              <p className="mb-1.5 px-3 text-[11px] font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase">
                {module.label}
              </p>
            ) : (
              i > 0 && <div className="mx-2 mb-3 border-t" aria-hidden />
            )}
            <div className="flex flex-col gap-0.5">
              {module.items.map(({ href, label, icon: Icon }) => {
                const active = isActivePath(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    aria-label={expanded ? undefined : label}
                    title={expanded ? undefined : label}
                    className={cn(
                      'flex items-center rounded-md text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                      expanded ? 'gap-2.5 px-3 py-1.5' : 'size-10 justify-center',
                      active && 'bg-accent font-medium text-foreground',
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {expanded && label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div
        className={cn(
          'flex items-center border-t pt-3 text-xs text-muted-foreground',
          expanded ? 'justify-between px-2' : 'justify-center',
        )}
      >
        {expanded && <span className="whitespace-nowrap">Europe/Berlin</span>}
        <ThemeToggle />
      </div>
    </aside>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { open: chatOpen, setOpen: setChatOpen, toggle: toggleChat } = useAssistant();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const chatDocked = useMediaQuery('(min-width: 1280px)');
  const sidebar = useSidebar(isDesktop);

  // Ctrl/Cmd+J toggles the assistant, Ctrl/Cmd+B the menu, Esc closes the menu overlay.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        toggleChat();
      } else if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        sidebar.toggle();
      } else if (e.key === 'Escape') {
        sidebar.closeOverlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleChat, sidebar]);

  // Columns: [menu][content][assistant]. The menu column is the rail (3.5rem) unless docked open.
  const wide = sidebar.docked;
  const withChat = chatOpen && chatDocked;
  const columns = wide
    ? withChat
      ? 'lg:grid-cols-[15rem_minmax(0,1fr)_0rem] xl:grid-cols-[15rem_minmax(0,1fr)_25rem]'
      : 'lg:grid-cols-[15rem_minmax(0,1fr)_0rem]'
    : withChat
      ? 'lg:grid-cols-[3.5rem_minmax(0,1fr)_0rem] xl:grid-cols-[3.5rem_minmax(0,1fr)_25rem]'
      : 'lg:grid-cols-[3.5rem_minmax(0,1fr)_0rem]';

  const overlayOpen = !isDesktop && sidebar.overlay;

  return (
    <div
      className={cn(
        'grid min-h-dvh grid-cols-[3.5rem_minmax(0,1fr)]',
        columns,
        sidebar.animate &&
          'transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none',
      )}
    >
      {/* Menu column. Its cell keeps the rail's width on small screens while the open menu floats. */}
      <div className="sticky top-0 z-50 h-dvh">
        <Sidebar
          expanded={sidebar.expanded}
          overlay={overlayOpen}
          onToggle={sidebar.toggle}
          onNavigate={sidebar.closeOverlay}
        />
      </div>
      {overlayOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close menu"
          onClick={sidebar.closeOverlay}
          className="fixed inset-0 z-40 bg-black/40"
        />
      )}

      <div className="flex min-w-0 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur md:px-6">
          <p className="min-w-0 truncate text-sm font-semibold">{pageTitle(pathname)}</p>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
              <Link href="/applications/new">
                <Plus /> Add application
              </Link>
            </Button>
            <Button
              size="sm"
              variant={chatOpen ? 'secondary' : 'default'}
              onClick={toggleChat}
              aria-pressed={chatOpen}
              title="Assistant (Ctrl+J)"
            >
              <Sparkles /> <span className="hidden sm:inline">Ask Claude</span>
              <kbd className="ml-1 hidden rounded border border-current/20 px-1 text-[10px] font-medium opacity-70 md:inline">
                Ctrl J
              </kbd>
            </Button>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-6 md:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>

      {/* Assistant: a docked column on wide screens, a slide-over below that */}
      {withChat ? (
        <aside className="sticky top-0 h-dvh overflow-hidden border-l">
          <AssistantPanel />
        </aside>
      ) : (
        <div className="hidden lg:block" aria-hidden />
      )}
      {chatOpen && !chatDocked && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close assistant"
            className="absolute inset-0 bg-black/40"
            onClick={() => setChatOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 w-full max-w-md border-l shadow-2xl">
            <AssistantPanel />
          </div>
        </div>
      )}
    </div>
  );
}
