'use client';

import {
  CalendarDays,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  LineChart,
  LucideIcon,
  Megaphone,
  Palette,
  PenLine,
  Search,
  Settings,
  Share2,
  Sparkles,
  Wand2,
  Workflow,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useT } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';
import { Logo } from './logo';

interface NavItem {
  href: string;
  label: MessageKey;
  icon: LucideIcon;
}

export const NAV_GROUPS: { title: MessageKey; items: NavItem[] }[] = [
  {
    title: 'nav.workspace',
    items: [
      { href: '/dashboard', label: 'nav.overview', icon: LayoutGrid },
      { href: '/studio', label: 'nav.studio', icon: PenLine },
      { href: '/seo', label: 'nav.seo', icon: Search },
      { href: '/sources', label: 'nav.sources', icon: FileText },
      { href: '/calendar', label: 'nav.calendar', icon: CalendarDays },
      { href: '/analytics', label: 'nav.analytics', icon: LineChart },
    ],
  },
  {
    title: 'nav.aiStudio',
    items: [
      { href: '/brand', label: 'nav.brand', icon: Palette },
      { href: '/channels', label: 'nav.channels', icon: Share2 },
      { href: '/design', label: 'nav.designStudio', icon: Wand2 },
    ],
  },
];

/** Used less often, so they stay out of the way until opened (or until one of them is the current page). */
export const MORE_ITEMS: NavItem[] = [
  { href: '/media', label: 'nav.media', icon: ImageIcon },
  { href: '/campaigns', label: 'nav.campaigns', icon: Megaphone },
  { href: '/automation', label: 'nav.workflow', icon: Workflow },
  { href: '/ai', label: 'nav.aiProviders', icon: Sparkles },
];

export interface SidebarProps {
  pathname: string;
  /** Active brand kit name, if any. */
  brandName: string | null;
  /** AI text generations used today vs the daily limit. Null when unavailable for this role. */
  credits: { used: number; limit: number } | null;
  open: boolean;
  onClose: () => void;
}

const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

function NavLink({
  item: { href, label, icon: Icon },
  pathname,
  onClose,
}: {
  item: NavItem;
  pathname: string;
  onClose: () => void;
}) {
  const t = useT();
  const active = isActive(pathname, href);
  return (
    <li>
      <Link
        href={href}
        onClick={onClose}
        aria-current={active ? 'page' : undefined}
        className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition ${
          active
            ? 'bg-brand-soft font-semibold text-brand-dark'
            : 'font-medium text-slate-600 hover:bg-surface hover:text-ink'
        }`}
      >
        <Icon size={18} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
        {t(label)}
      </Link>
    </li>
  );
}

export function Sidebar({ pathname, brandName, credits, open, onClose }: SidebarProps) {
  const t = useT();
  const pct =
    credits && credits.limit > 0
      ? Math.min(100, Math.round((credits.used / credits.limit) * 100))
      : 0;
  const tone = pct >= 90 ? 'bg-danger' : pct >= 70 ? 'bg-warn' : 'bg-brand';

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={`fixed inset-y-0 start-0 z-40 flex w-rail flex-col border-e border-line bg-white transition-transform duration-200 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full lg:rtl:translate-x-0'
        }`}
        aria-label={t('nav.main')}
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-5">
          <Logo />
          <button
            className="rounded-lg p-1.5 text-muted hover:bg-surface lg:hidden"
            onClick={onClose}
            aria-label={t('nav.closeMenu')}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-3">
          {NAV_GROUPS.map((g) => (
            <div key={g.title}>
              <p className="eyebrow px-3 pb-1.5">{t(g.title)}</p>
              <ul className="space-y-0.5">
                {g.items.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} onClose={onClose} />
                ))}
              </ul>
            </div>
          ))}
          <details open={MORE_ITEMS.some((i) => isActive(pathname, i.href))}>
            <summary className="eyebrow cursor-pointer px-3 pb-1.5">{t('nav.more')}</summary>
            <ul className="space-y-0.5">
              {MORE_ITEMS.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} onClose={onClose} />
              ))}
            </ul>
          </details>
        </nav>

        <div className="shrink-0 space-y-2 border-t border-line p-3">
          <Link
            href="/brand"
            onClick={onClose}
            className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 hover:bg-surface"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Palette size={16} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-label text-[11px] font-semibold uppercase tracking-wide text-muted">
                {t('sidebar.brandKit')}
              </span>
              <span className="block truncate text-sm font-medium">
                {brandName ?? t('sidebar.notSetUp')}
              </span>
            </span>
          </Link>

          {credits && (
            <Link
              href="/ai"
              onClick={onClose}
              className="block rounded-xl bg-surface px-3 py-2.5 hover:bg-surface-sub"
              aria-label={t('sidebar.aiUsage')}
            >
              <span className="flex items-center justify-between font-label text-[11px] font-semibold uppercase tracking-wide text-muted">
                <span>{t('sidebar.aiToday')}</span>
                <span className="text-ink">
                  {credits.used} / {credits.limit}
                </span>
              </span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line">
                <span
                  className={`block h-full rounded-full ${tone}`}
                  style={{ width: `${pct}%` }}
                />
              </span>
            </Link>
          )}

          <Link
            href="/members"
            onClick={onClose}
            className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-surface hover:text-ink ${
              isActive(pathname, '/members') ? 'bg-brand-soft text-brand-dark' : 'text-slate-600'
            }`}
          >
            <Settings size={18} strokeWidth={1.8} aria-hidden />
            {t('nav.settings')}
          </Link>
        </div>
      </aside>
    </>
  );
}
