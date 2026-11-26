'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { apiFetch, ArticleContent } from '@/lib/api';
import { articleToMarkdown } from '@/lib/content-text';
import { describeError } from '@/lib/errors';
import { useT } from '@/lib/i18n';
import { copyRich } from '@/lib/rich-copy';

const PARTS = ['title', 'text', 'description', 'address'] as const;
type Part = (typeof PARTS)[number];

/**
 * Putting an article on any website without connecting it: copy each piece into the matching box of the site's
 * editor. The text keeps its headings and links.
 */
export function WebsiteCopy({
  orgId,
  contentId,
  article,
}: {
  orgId: string;
  contentId: string;
  article: ArticleContent;
}) {
  const t = useT();
  const [copied, setCopied] = useState<Part | null>(null);
  const [pictures, setPictures] = useState(0);
  const [error, setError] = useState('');

  async function copy(part: Part) {
    setError('');
    setCopied(null);
    try {
      if (part === 'text') {
        const result = apiFetch<{ html: string; pictures: number }>(
          `/organizations/${orgId}/content/${contentId}/html`,
          { method: 'POST', body: JSON.stringify({ content: article }) },
        );
        // the title has its own box on a website, so it is not repeated in the text
        const plain = articleToMarkdown(article).split('\n').slice(2).join('\n');
        await copyRich(
          result.then((r) => r.html),
          plain,
        );
        setPictures((await result).pictures);
      } else {
        const values = {
          title: article.h1,
          description: article.metaDescription,
          address: article.slug,
        };
        await navigator.clipboard.writeText(values[part]);
      }
      setCopied(part);
    } catch (e) {
      setError(e instanceof DOMException ? t('det.copyDenied') : describeError(e));
    }
  }

  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-display text-base font-semibold">{t('web.heading')}</h2>
      <p className="text-xs text-muted">{t('web.hint')}</p>
      <ol className="space-y-2">
        {PARTS.map((part, i) => (
          <li key={part}>
            <button
              type="button"
              className="btn-ghost btn-sm w-full !justify-start text-start"
              onClick={() => copy(part)}
            >
              {copied === part ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
              <span>
                {i + 1}. {copied === part ? t('seo.copied') : t(`web.${part}`)}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {copied === 'text' && pictures > 0 && (
        <p className="text-xs text-amber-800">{t('web.pictures', { n: pictures })}</p>
      )}
      {error && <p className="text-xs text-danger-ink">{error}</p>}
    </section>
  );
}
