'use client';

import Link from 'next/link';
import { useState } from 'react';
import { apiFetch, ContentDetail, ContentKind, CONTENT_KINDS, Lang } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { useT } from '@/lib/i18n';
import { createDrafts } from '@/lib/quick-create';

const SOCIAL = CONTENT_KINDS.filter((k) => k.id !== 'ARTICLE');

/** Social posts announcing an article, written from the same confirmed details and in the same language. */
export function SocialFromArticle({
  orgId,
  sourceId,
  title,
  language,
  onCreated,
}: {
  orgId: string;
  sourceId: string;
  title: string;
  language: Lang;
  onCreated?: () => void;
}) {
  const t = useT();
  const [kinds, setKinds] = useState<ContentKind[]>(['FACEBOOK']);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ kind: ContentKind; id: string }[]>([]);
  const [error, setError] = useState('');

  async function create() {
    setBusy(true);
    setError('');
    const result = await createDrafts(kinds, async (kind) => {
      const res = await apiFetch<ContentDetail>(`/organizations/${orgId}/content/generate`, {
        method: 'POST',
        body: JSON.stringify({
          sourceId,
          kind,
          options: {
            language,
            style: 'informative',
            tone: 'friendly',
            length: 'short',
            instructions:
              `The post announces our new article titled "${title}". Invite people to read it.`.slice(
                0,
                500,
              ),
          },
        }),
      });
      return res.piece.id;
    });
    setMade((cur) => [...cur, ...result.made]);
    if (result.failed.length) {
      const names = result.failed.map((f) => t(`kind.${f.kind}`)).join(', ');
      setError(`${names}: ${describeError(result.failed[0].error)}`);
    }
    if (result.made.length) onCreated?.();
    setBusy(false);
  }

  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-display text-base font-semibold">{t('soc.title')}</h2>
      <p className="text-xs text-muted">{t('soc.hint')}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('soc.title')}>
        {SOCIAL.map((k) => (
          <button
            key={k.id}
            type="button"
            disabled={busy}
            aria-pressed={kinds.includes(k.id)}
            onClick={() =>
              setKinds((cur) =>
                cur.includes(k.id) ? cur.filter((x) => x !== k.id) : [...cur, k.id],
              )
            }
            className={`rounded-full border-2 px-3 py-1 text-xs font-semibold ${
              kinds.includes(k.id) ? 'border-brand bg-brand-soft' : 'border-slate-200'
            }`}
          >
            <span aria-hidden>{k.icon}</span> {t(`kind.${k.id}`)}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn-primary btn-sm"
        disabled={busy || kinds.length === 0}
        onClick={create}
      >
        {busy ? t('qc.writing') : t('soc.go')}
      </button>
      {error && <p className="text-xs text-danger-ink">{error}</p>}
      {made.length > 0 && (
        <ul className="flex flex-wrap gap-3 text-sm">
          {made.map((m) => (
            <li key={m.id}>
              <Link href={`/studio/${m.id}`} className="font-semibold text-brand underline">
                {t(`kind.${m.kind}`)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
