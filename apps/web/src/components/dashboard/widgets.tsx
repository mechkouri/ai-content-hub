import { Briefcase, Camera, Check, LucideIcon, Newspaper, ThumbsUp } from 'lucide-react';
import Link from 'next/link';
import { ContentKind } from '@/lib/api';

export const KIND_ICON: Record<ContentKind, { icon: LucideIcon; tint: string }> = {
  ARTICLE: { icon: Newspaper, tint: 'bg-brand-soft text-brand-dark' },
  INSTAGRAM: { icon: Camera, tint: 'bg-pink-50 text-pink-600' },
  FACEBOOK: { icon: ThumbsUp, tint: 'bg-blue-50 text-blue-700' },
  LINKEDIN: { icon: Briefcase, tint: 'bg-sky-50 text-sky-700' },
};

export function KindBadge({ kind }: { kind: ContentKind }) {
  const { icon: Icon, tint } = KIND_ICON[kind];
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}>
      <Icon size={18} aria-hidden />
    </span>
  );
}

/** One KPI card: small caps label, big number, a line of context and an optional bar. */
export function StatCard({
  label,
  value,
  suffix,
  note,
  icon: Icon,
  progress,
  tone = 'brand',
}: {
  label: string;
  value: string | number;
  suffix?: string;
  note?: string;
  icon: LucideIcon;
  /** 0..100 */
  progress?: number;
  tone?: 'brand' | 'ai' | 'ok';
}) {
  const iconTint =
    tone === 'ai'
      ? 'bg-ai-soft text-ai'
      : tone === 'ok'
        ? 'bg-ok-soft text-ok-ink'
        : 'bg-brand-soft text-brand';
  const bar =
    progress === undefined
      ? ''
      : progress >= 90
        ? 'bg-danger'
        : progress >= 70
          ? 'bg-warn'
          : 'bg-brand';
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <p className="eyebrow">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconTint}`}>
          <Icon size={17} aria-hidden />
        </span>
      </div>
      <p className="mt-3 font-display text-[40px] font-bold leading-none tracking-tight">
        {value}
        {suffix && (
          <span className="ms-1 font-label text-base font-semibold text-muted">{suffix}</span>
        )}
      </p>
      {progress !== undefined && (
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-sub"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className={`h-full rounded-full ${bar}`} style={{ width: `${progress}%` }} />
        </div>
      )}
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
    </div>
  );
}

export function StepItem({
  done,
  title,
  hint,
  href,
}: {
  done: boolean;
  title: string;
  hint: string;
  href: string;
}) {
  return (
    <Link href={href} className="flex items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-surface">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
          done ? 'border-ok bg-ok text-white' : 'border-line-strong text-transparent'
        }`}
        aria-hidden
      >
        <Check size={12} strokeWidth={3} />
      </span>
      <span>
        <span className={`block text-sm font-medium ${done ? 'text-muted line-through' : ''}`}>
          {title}
        </span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </Link>
  );
}

export function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`h-2 w-2 rounded-full ${ok ? 'bg-ok' : 'bg-slate-300'}`} aria-hidden />;
}
