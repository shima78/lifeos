import { Briefcase, Building2, LayoutDashboard, type LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavModule {
  /** Section heading in the sidebar. */
  label: string;
  items: NavItem[];
}

/**
 * LifeOS is organised in modules. Each module adds a section here (and its own pages under
 * src/app). Job search is the first one; tasks and activity tracking are planned next.
 */
export const NAV_MODULES: NavModule[] = [
  {
    label: 'Overview',
    items: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Job search',
    items: [
      { href: '/applications', label: 'Applications', icon: Briefcase },
      { href: '/companies', label: 'Companies', icon: Building2 },
    ],
  },
];

export const isActivePath = (pathname: string, href: string): boolean =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

/** Title for the top bar, from the deepest matching nav item. */
export function pageTitle(pathname: string): string {
  if (pathname === '/applications/new') return 'Add application';
  if (/^\/applications\/[^/]+\/edit$/.test(pathname)) return 'Edit application';
  const match = NAV_MODULES.flatMap((m) => m.items)
    .filter((i) => isActivePath(pathname, i.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.label ?? 'LifeOS';
}
