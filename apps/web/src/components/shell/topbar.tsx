'use client';

import { ChevronsUpDown, LogOut, Menu, Plus, PlusCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useT } from '@/lib/i18n';

export interface TopbarProps {
  orgs: { id: string; name: string }[];
  currentOrgId: string | null;
  onOrgChange: (id: string) => void;
  userEmail: string;
  onSignOut: () => void;
  onMenu: () => void;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

export function Topbar({
  orgs,
  currentOrgId,
  onOrgChange,
  userEmail,
  onSignOut,
  onMenu,
}: TopbarProps) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = orgs.find((o) => o.id === currentOrgId);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/85 px-4 backdrop-blur-md lg:px-10">
      <button
        className="rounded-lg p-2 text-slate-600 hover:bg-surface lg:hidden"
        onClick={onMenu}
        aria-label={t('nav.openMenu')}
      >
        <Menu size={20} />
      </button>

      {/* Organization switcher */}
      <label className="relative flex h-10 min-w-0 max-w-[280px] items-center gap-2.5 rounded-lg border border-line bg-white ps-2 pe-8 hover:border-line-strong">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-soft font-label text-[11px] font-bold text-brand-dark">
          {initials(current?.name ?? '')}
        </span>
        <span className="sr-only">{t('topbar.org')}</span>
        <select
          aria-label={t('topbar.org')}
          className="w-full cursor-pointer appearance-none truncate bg-transparent text-sm font-semibold text-ink outline-none"
          value={currentOrgId ?? ''}
          onChange={(e) => onOrgChange(e.target.value)}
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <ChevronsUpDown
          size={14}
          className="pointer-events-none absolute end-2.5 text-muted"
          aria-hidden
        />
      </label>

      <div className="flex-1" />

      <LanguageSwitcher />

      <Link href="/studio" className="btn-primary hidden sm:inline-flex">
        <Plus size={16} aria-hidden />
        {t('topbar.create')}
      </Link>
      <Link href="/studio" className="btn-primary !px-3 sm:hidden" aria-label={t('topbar.create')}>
        <Plus size={18} aria-hidden />
      </Link>

      {/* User menu */}
      <div className="relative" ref={ref}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t('topbar.account')}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-ink font-label text-xs font-bold text-white hover:ring-4 hover:ring-slate-200"
        >
          {userEmail.slice(0, 1).toUpperCase() || '?'}
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute end-0 mt-2 w-64 rounded-xl border border-line bg-white p-1.5 shadow-pop"
          >
            <div className="border-b border-line px-3 pb-2 pt-1.5">
              <p className="eyebrow">{t('topbar.signedInAs')}</p>
              <p className="truncate text-sm font-medium" title={userEmail}>
                {userEmail}
              </p>
            </div>
            <Link
              href="/onboarding"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="mt-1 flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm text-slate-700 hover:bg-surface"
            >
              <PlusCircle size={16} aria-hidden /> {t('topbar.newOrg')}
            </Link>
            <button
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onSignOut();
              }}
              className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-sm text-slate-700 hover:bg-surface"
            >
              <LogOut size={16} aria-hidden /> {t('topbar.logout')}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

/** Topbar shown to visitors who are not signed in: browsing is free, the account is needed to create. */
export function GuestTopbar({ onMenu }: { onMenu: () => void }) {
  const t = useT();
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/85 px-4 backdrop-blur-md lg:px-10">
      <button
        className="rounded-lg p-2 text-slate-600 hover:bg-surface lg:hidden"
        onClick={onMenu}
        aria-label={t('nav.openMenu')}
      >
        <Menu size={20} />
      </button>
      <div className="flex-1" />
      <LanguageSwitcher />
      <Link href="/login" className="btn-ghost">
        {t('topbar.login')}
      </Link>
      <Link href="/signup" className="btn-primary">
        {t('topbar.signup')}
      </Link>
    </header>
  );
}
