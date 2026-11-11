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
  Settings,
  Share2,
  Sparkles,
  Wand2,
  Workflow,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { Logo } from './logo';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Overview', icon: LayoutGrid },
      { href: '/sources', label: 'Sources', icon: FileText },
      { href: '/studio', label: 'Content studio', icon: PenLine },
    ],
  },
  {
    title: 'AI studio',
    items: [
      { href: '/brand', label: 'Brand kit', icon: Palette },
      { href: '/media', label: 'Media library', icon: ImageIcon },
      { href: '/ai', label: 'AI providers', icon: Sparkles },
    ],
  },
];

/** Planned features from the design that are not built yet. They are shown disabled, never faked. */
export const SOON_ITEMS: { label: string; icon: LucideIcon }[] = [
  { label: 'Campaigns', icon: Megaphone },
  { label: 'Content calendar', icon: CalendarDays },
  { label: 'Visual design studio', icon: Wand2 },
  { label: 'Workflow automation', icon: Workflow },
  { label: 'Channels', icon: Share2 },
  { label: 'Analytics', icon: LineChart },
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

export function Sidebar({ pathname, brandName, credits, open, onClose }: SidebarProps) {
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
        className={`fixed inset-y-0 left-0 z-40 flex w-rail flex-col border-r border-line bg-white transition-transform duration-200 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Main navigation"
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-5">
          <Logo />
          <button
            className="rounded-lg p-1.5 text-muted hover:bg-surface lg:hidden"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-3">
          {NAV_GROUPS.map((g) => (
            <div key={g.title}>
              <p className="eyebrow px-3 pb-1.5">{g.title}</p>
              <ul className="space-y-0.5">
                {g.items.map(({ href, label, icon: Icon }) => {
                  const active = isActive(pathname, href);
                  return (
                    <li key={href}>
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
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div>
            <p className="eyebrow px-3 pb-1.5">Coming soon</p>
            <ul className="space-y-0.5">
              {SOON_ITEMS.map(({ label, icon: Icon }) => (
                <li
                  key={label}
                  aria-disabled="true"
                  className="flex h-10 cursor-not-allowed items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-400"
                >
                  <Icon size={18} strokeWidth={1.8} aria-hidden />
                  <span className="flex-1">{label}</span>
                  <span className="rounded bg-surface-sub px-1.5 py-0.5 font-label text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Soon
                  </span>
                </li>
              ))}
            </ul>
          </div>
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
                Brand kit
              </span>
              <span className="block truncate text-sm font-medium">
                {brandName ?? 'Not set up yet'}
              </span>
            </span>
          </Link>

          {credits && (
            <Link
              href="/ai"
              onClick={onClose}
              className="block rounded-xl bg-surface px-3 py-2.5 hover:bg-surface-sub"
              aria-label="AI usage today"
            >
              <span className="flex items-center justify-between font-label text-[11px] font-semibold uppercase tracking-wide text-muted">
                <span>AI generations today</span>
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
            Settings &amp; team
          </Link>
        </div>
      </aside>
    </>
  );
}
