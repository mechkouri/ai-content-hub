'use client';

import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { apiFetch, ArticleContent } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';

export type SuggestField = 'title' | 'meta' | 'keywords';

/**
 * "Suggest with AI" for one SEO field. It shows a few options written from the article (never saved by itself):
 * pressing one puts it in the field, where it can still be edited. The server drops any suggestion that mentions
 * a date, number or link the article does not support.
 */
export function SeoSuggest({
  orgId,
  contentId,
  field,
  article,
  keyword,
  disabled,
  onApply,
}: {
  orgId: string;
  contentId: string;
  field: SuggestField;
  article: ArticleContent;
  keyword: string;
  disabled?: boolean;
  onApply: (text: string) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<string[] | null>(null);
  const [error, setError] = useState('');

  async function ask() {
    setBusy(true);
    setError('');
    setOptions(null);
    try {
      const r = await apiFetch<{ suggestions: string[] }>(
        `/organizations/${orgId}/content/${contentId}/seo-suggest`,
        {
          method: 'POST',
          body: JSON.stringify({
            field,
            keyword: keyword.trim() || null,
            // the text as it is being edited, so a suggestion matches the current draft
            content: article,
          }),
        },
      );
      setOptions(r.suggestions);
    } catch (e) {
      setError(describeError(e));
    }
    setBusy(false);
  }

  return (
    <div className="mt-1.5">
      <button type="button" className="btn-ghost btn-sm" disabled={disabled || busy} onClick={ask}>
        <Sparkles size={13} aria-hidden /> {busy ? t('sg.thinking') : t('sg.suggest')}
      </button>
      {error && <p className="mt-1.5 text-xs text-danger-ink">{error}</p>}
      {options && options.length === 0 && (
        <p className="mt-1.5 text-xs text-muted">{t('sg.none')}</p>
      )}
      {options && options.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <p className="text-[11px] text-slate-400">{t('sg.pick')}</p>
          <ul className="space-y-1.5">
            {options.map((o) => (
              <li key={o}>
                <button
                  type="button"
                  dir="auto"
                  onClick={() => {
                    onApply(o);
                    setOptions(null);
                  }}
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-start text-xs hover:border-brand hover:bg-brand-soft"
                >
                  {o}
                  {field !== 'keywords' && (
                    <span className="ms-2 text-[10px] text-slate-400">{o.length}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-400">{t('sg.cost')}</p>
        </div>
      )}
    </div>
  );
}
