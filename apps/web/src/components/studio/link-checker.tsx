'use client';

import { useState } from 'react';
import { apiFetch, ArticleContent } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';

type Status = 'ok' | 'redirect' | 'broken' | 'unverified' | 'unsafe';
interface Result {
  url: string;
  status: Status;
  finalUrl?: string;
}

const STYLE: Record<Status, { dot: string; label: MessageKey }> = {
  ok: { dot: 'bg-green-500', label: 'lc.ok' },
  redirect: { dot: 'bg-amber-500', label: 'lc.redirect' },
  broken: { dot: 'bg-red-500', label: 'lc.broken' },
  unverified: { dot: 'bg-slate-400', label: 'lc.unverified' },
  unsafe: { dot: 'bg-slate-400', label: 'lc.unsafe' },
};

/** Checks that the links in the article still work, so readers never land on a dead page. */
export function LinkChecker({
  orgId,
  contentId,
  article,
  disabled,
  onFix,
}: {
  orgId: string;
  contentId: string;
  article: ArticleContent;
  disabled?: boolean;
  /** Replace an old address by its new one everywhere in the article. */
  onFix: (from: string, to: string) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState('');

  async function run() {
    setBusy(true);
    setError('');
    try {
      const r = await apiFetch<{ results: Result[] }>(
        `/organizations/${orgId}/content/${contentId}/check-links`,
        { method: 'POST', body: JSON.stringify({ content: article }) },
      );
      setResults(r.results);
    } catch (e) {
      setError(describeError(e));
    }
    setBusy(false);
  }

  const broken = results?.filter((r) => r.status === 'broken').length ?? 0;

  return (
    <section className="card p-4">
      <h2 className="font-display text-sm font-semibold">{t('lc.title')}</h2>
      <p className="mt-1 text-xs text-muted">{t('lc.hint')}</p>
      <button
        type="button"
        className="btn-ghost btn-sm mt-2"
        disabled={disabled || busy}
        onClick={run}
      >
        {busy ? t('lc.checking') : t('lc.check')}
      </button>
      {error && <p className="mt-2 text-xs text-danger-ink">{error}</p>}
      {results && results.length === 0 && <p className="mt-2 text-xs text-muted">{t('lc.none')}</p>}
      {results && results.length > 0 && (
        <>
          <p className="mt-2 text-xs font-semibold">
            {broken === 0 ? t('lc.allGood') : t('lc.someBroken', { n: broken })}
          </p>
          <ul className="mt-2 space-y-2">
            {results.map((r) => (
              <li key={r.url} className="text-xs">
                <div className="flex gap-2">
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${STYLE[r.status].dot}`}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="break-all text-slate-700" dir="ltr">
                      {r.url}
                    </p>
                    <p className="text-slate-500">{t(STYLE[r.status].label)}</p>
                    {r.status === 'redirect' && r.finalUrl && (
                      <button
                        type="button"
                        className="mt-1 font-semibold text-brand underline"
                        disabled={disabled}
                        onClick={() => {
                          onFix(r.url, r.finalUrl!);
                          setResults((all) => all?.filter((x) => x.url !== r.url) ?? null);
                        }}
                      >
                        {t('lc.update')}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
