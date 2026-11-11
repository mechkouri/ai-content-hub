import {
  AlertTriangle,
  ArrowRight,
  FileText,
  ImageIcon,
  PenLine,
  Sparkles,
  Wand2,
} from 'lucide-react';
import Link from 'next/link';
import { AiStatus, CONTENT_KINDS, ContentSummary, LANG_LABELS, SourceSummary } from '@/lib/api';
import { KindBadge, StatCard, StatusDot, StepItem } from './widgets';

export interface OverviewData {
  sources: SourceSummary[];
  content: ContentSummary[];
  ai: AiStatus | null;
  hasBrandKit: boolean;
}

const KIND = Object.fromEntries(CONTENT_KINDS.map((k) => [k.id, k]));
const pct = (used: number, limit: number) =>
  limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString();
};

export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const first = local.split(/[._-]+/)[0] ?? '';
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : 'there';
}

export function Overview({
  data,
  name,
  orgName,
}: {
  data: OverviewData;
  name: string;
  orgName: string;
}) {
  const { sources, content, ai, hasBrandKit } = data;
  const ready = sources.filter((s) => s.status === 'EXTRACTED');
  const needExtraction = sources.filter((s) => s.status !== 'EXTRACTED');
  const review = content.filter((c) => c.status === 'NEEDS_REVIEW');
  const recent = content.slice(0, 5);

  const attention = [
    ...review.map((c) => ({
      key: `c-${c.id}`,
      href: `/studio/${c.id}`,
      title: c.title,
      detail: `${c.warnings.length} detail${c.warnings.length === 1 ? '' : 's'} to check against the verified facts`,
      chip: <span className="chip-warn">Needs review</span>,
      icon: <AlertTriangle size={18} className="text-warn" aria-hidden />,
    })),
    ...needExtraction.map((s) => ({
      key: `s-${s.id}`,
      href: `/sources/${s.id}`,
      title: s.title,
      detail: 'Facts have not been extracted yet',
      chip: <span className="chip-draft">Needs extraction</span>,
      icon: <FileText size={18} className="text-muted" aria-hidden />,
    })),
  ].slice(0, 6);

  const steps = [
    {
      done: hasBrandKit,
      title: 'Set up your brand kit',
      hint: 'Colors, fonts and logo applied to everything you create',
      href: '/brand',
    },
    {
      done: sources.length > 0,
      title: 'Add a source',
      hint: 'Paste text, upload a PDF or DOCX, or import a web page',
      href: '/sources',
    },
    {
      done: ready.length > 0,
      title: 'Verify the extracted facts',
      hint: 'Confirm what the AI found before anything is written',
      href: ready[0] ? `/sources/${ready[0].id}` : '/sources',
    },
    {
      done: content.length > 0,
      title: 'Create your first content',
      hint: 'An article or a social post from your verified facts',
      href: '/studio',
    },
  ];
  const allDone = steps.every((s) => s.done);

  return (
    <div className="space-y-8">
      {/* Greeting + quick create */}
      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-[32px] font-semibold leading-tight">
            {greeting()}, {name}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="chip-ai">
              <span className="h-1.5 w-1.5 rounded-full bg-ai" aria-hidden />
              {orgName}
            </span>
            Overview of your sources, content and AI usage.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {CONTENT_KINDS.map((k) => (
            <Link
              key={k.id}
              href={`/studio?kind=${k.id}`}
              className="btn-ghost btn-sm"
              title={k.blurb}
            >
              <span aria-hidden>{k.icon}</span>
              {k.label}
            </Link>
          ))}
          <Link href="/studio" className="btn-primary">
            <Wand2 size={16} aria-hidden />
            New content
          </Link>
        </div>
      </section>

      {/* KPI cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key numbers">
        <StatCard
          label="Sources"
          value={sources.length}
          icon={FileText}
          note={`${ready.length} with verified facts ready`}
        />
        <StatCard
          label="Content created"
          value={content.length}
          icon={PenLine}
          tone="ai"
          note={review.length ? `${review.length} need review` : 'Nothing waiting for review'}
        />
        {ai ? (
          <>
            <StatCard
              label="AI text today"
              value={ai.usage.text.today}
              suffix={`/ ${ai.limits.dailyText}`}
              icon={Sparkles}
              tone="ai"
              progress={pct(ai.usage.text.today, ai.limits.dailyText)}
              note={`${ai.usage.text.month} this month`}
            />
            <StatCard
              label="AI images today"
              value={ai.usage.image.today}
              suffix={`/ ${ai.limits.dailyImage}`}
              icon={ImageIcon}
              progress={pct(ai.usage.image.today, ai.limits.dailyImage)}
              note={`${ai.usage.image.month} this month`}
            />
          </>
        ) : (
          <div className="card flex items-center p-5 text-sm text-muted sm:col-span-2">
            AI usage is visible to owners, admins, editors and designers.
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* Needs attention */}
          <section className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Needs your attention</h2>
              <span className="chip-draft">{attention.length}</span>
            </div>
            {attention.length === 0 ? (
              <div className="rounded-xl bg-surface py-8 text-center text-sm text-muted">
                <p className="font-medium text-ink">All clear</p>
                <p>Nothing is waiting for review or extraction.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {attention.map((a) => (
                  <li key={a.key}>
                    <Link href={a.href} className="card card-hover flex items-center gap-3 p-3.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface">
                        {a.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold" dir="auto">
                          {a.title}
                        </span>
                        <span className="block truncate text-xs text-muted">{a.detail}</span>
                      </span>
                      {a.chip}
                      <ArrowRight size={16} className="text-slate-300" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Recent content */}
          <section className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Recent content</h2>
              <Link
                href="/studio"
                className="flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
              >
                Open studio <ArrowRight size={14} aria-hidden />
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="rounded-xl bg-surface py-8 text-center text-sm text-muted">
                <p className="font-medium text-ink">No content yet</p>
                <p>Create an article or a social post from one of your sources.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {recent.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/studio/${c.id}`}
                      className="flex items-center gap-3 py-3 hover:opacity-80"
                    >
                      <KindBadge kind={c.kind} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold" dir="auto">
                          {c.title}
                        </span>
                        <span className="block text-xs text-muted">
                          {KIND[c.kind].label} · {LANG_LABELS[c.language] ?? c.language} ·{' '}
                          {ago(c.createdAt)}
                        </span>
                      </span>
                      {c.status === 'NEEDS_REVIEW' ? (
                        <span className="chip-warn">Needs review</span>
                      ) : (
                        <span className="chip-ok">Draft</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          {!allDone && (
            <section className="card p-5">
              <h2 className="font-display text-lg font-semibold">Getting started</h2>
              <p className="mb-2 text-xs text-muted">
                {steps.filter((s) => s.done).length} of {steps.length} done
              </p>
              <div className="space-y-0.5">
                {steps.map((s) => (
                  <StepItem key={s.title} {...s} />
                ))}
              </div>
            </section>
          )}

          {/* Provider connectivity (design: "Pipe connectivity") */}
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="eyebrow">AI providers</h2>
              <Link href="/ai" className="text-xs font-semibold text-brand hover:underline">
                Manage
              </Link>
            </div>
            {ai ? (
              <ul className="grid grid-cols-2 gap-2">
                {[
                  ...ai.providers.text.map((p) => ({ ...p, kind: 'Text' })),
                  ...ai.providers.image.map((p) => ({ ...p, kind: 'Images' })),
                ].map((p) => (
                  <li
                    key={`${p.kind}-${p.id}`}
                    className="flex items-center justify-between rounded-lg bg-surface px-3 py-2.5"
                  >
                    <span>
                      <span className="block text-sm font-medium capitalize">{p.id}</span>
                      <span className="block text-[11px] text-muted">{p.kind}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
                      <StatusDot ok={p.configured} />
                      {p.configured ? 'Connected' : 'Not set up'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                Provider status is visible to owners, admins, editors and designers.
              </p>
            )}
            <p className="mt-3 text-[11px] text-muted">
              Free models only. The app never falls back to a paid model.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
