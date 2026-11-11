'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  ArticleEditor,
  FacebookEditor,
  InstagramEditor,
  LinkedinEditor,
} from '@/components/studio/editors';
import {
  FacebookPreview,
  InstagramPreview,
  LinkedinPreview,
  SerpPreview,
} from '@/components/studio/previews';
import { StatusBadge } from '@/components/studio/status-badge';
import {
  AnyContent,
  apiFetch,
  ArticleContent,
  canWriteContent,
  CONTENT_KINDS,
  ContentDetail,
  ContentSummary,
  FacebookContent,
  InstagramContent,
  LANG_LABELS,
  LinkedinContent,
} from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { contentToText, isDirty } from '@/lib/content-text';
import { describeError } from '@/lib/errors';

export default function ContentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { currentOrgId, currentRole, memberships } = useApp();
  const orgName =
    memberships.find((m) => m.organizationId === currentOrgId)?.organization.name ??
    'Your organization';
  const canWrite = canWriteContent(currentRole);
  const base = `/organizations/${currentOrgId}/content/${id}`;

  const [detail, setDetail] = useState<ContentDetail | null>(null);
  const [draft, setDraft] = useState<AnyContent | null>(null);
  const [saved, setSaved] = useState<AnyContent | null>(null);
  const [related, setRelated] = useState<ContentSummary[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [target, setTarget] = useState('');

  const load = useCallback(async () => {
    if (!currentOrgId) return;
    try {
      const d = await apiFetch<ContentDetail>(base);
      setDetail(d);
      setDraft(d.piece.content);
      setSaved(d.piece.content);
      const all = await apiFetch<ContentSummary[]>(
        `/organizations/${currentOrgId}/content?sourceId=${d.piece.sourceId}`,
      );
      setRelated(all);
    } catch (e) {
      setError(describeError(e));
    }
  }, [currentOrgId, base]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = draft !== null && saved !== null && isDirty(draft, saved);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await apiFetch<ContentDetail>(base, {
        method: 'PATCH',
        body: JSON.stringify({ content: draft }),
      });
      setDetail((prev) => ({ ...res, source: prev?.source }));
      setDraft(res.piece.content);
      setSaved(res.piece.content);
      setNotice(
        res.piece.warnings.length
          ? 'Saved. Some details still need checking.'
          : 'Saved. Everything matches your verified facts.',
      );
    } catch (e) {
      setError(describeError(e));
    }
    setSaving(false);
  }

  async function translate() {
    if (!target) return;
    setTranslating(true);
    setError('');
    try {
      const res = await apiFetch<ContentDetail>(`${base}/translate`, {
        method: 'POST',
        body: JSON.stringify({ language: target }),
      });
      router.push(`/studio/${res.piece.id}`);
    } catch (e) {
      setError(describeError(e));
      setTranslating(false);
    }
  }

  async function remove() {
    if (!confirm('Delete this content? This cannot be undone.')) return;
    try {
      await apiFetch(base, { method: 'DELETE' });
      router.replace('/studio');
    } catch (e) {
      setError(describeError(e));
    }
  }

  async function copy() {
    if (!detail || !draft) return;
    try {
      await navigator.clipboard.writeText(contentToText(detail.piece.kind, draft));
      setNotice('Copied to the clipboard.');
    } catch {
      setError('Copying is not allowed by your browser here.');
    }
  }

  if (!detail || !draft) return <p className="text-sm text-slate-500">{error || 'Loading…'}</p>;
  const { piece, seoChecks, source } = detail;
  const kind = CONTENT_KINDS.find((k) => k.id === piece.kind)!;
  const warnings = piece.warnings;
  const siblings = related.filter(
    (p) =>
      p.id !== piece.id &&
      (p.translatedFromId === piece.id ||
        (piece.translatedFromId &&
          (p.id === piece.translatedFromId || p.translatedFromId === piece.translatedFromId))),
  );
  const languagesLeft = Object.keys(LANG_LABELS).filter((l) => l !== piece.language);
  const props = { warnings, disabled: !canWrite };

  return (
    <div className="space-y-4">
      <Link href="/studio" className="text-sm font-semibold text-brand">
        ← Content studio
      </Link>

      <section className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold" dir="auto">
              {piece.title}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span>
                {kind.icon} {kind.label} · {LANG_LABELS[piece.language] ?? piece.language}
              </span>
              <StatusBadge status={piece.status} />
              {piece.edited && <span className="text-xs">edited</span>}
              {source && (
                <Link href={`/sources/${source.id}`} className="text-brand underline">
                  Source: {source.title}
                </Link>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={copy}>
              Copy
            </button>
            {canWrite && (
              <>
                <button className="btn-primary" onClick={save} disabled={saving || !dirty}>
                  {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
                </button>
                <button
                  className="btn-ghost"
                  onClick={save}
                  disabled={saving}
                  title="Re-check the text against the current verified facts"
                >
                  Re-check facts
                </button>
                <button className="btn-danger" onClick={remove}>
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && (
          <p className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>
        )}
        {dirty && (
          <p className="mt-3 rounded-lg bg-slate-100 p-3 text-xs text-slate-600">
            You have unsaved changes.
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          {piece.kind === 'ARTICLE' && (
            <ArticleEditor value={draft as ArticleContent} onChange={setDraft} {...props} />
          )}
          {piece.kind === 'INSTAGRAM' && (
            <InstagramEditor value={draft as InstagramContent} onChange={setDraft} {...props} />
          )}
          {piece.kind === 'FACEBOOK' && (
            <FacebookEditor value={draft as FacebookContent} onChange={setDraft} {...props} />
          )}
          {piece.kind === 'LINKEDIN' && (
            <LinkedinEditor value={draft as LinkedinContent} onChange={setDraft} {...props} />
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className={`card p-4 ${warnings.length ? 'ring-2 ring-amber-300' : ''}`}>
            <h2 className="text-sm font-bold">
              {warnings.length
                ? `⚠ ${warnings.length} detail${warnings.length > 1 ? 's' : ''} to check`
                : '✓ Facts match'}
            </h2>
            {warnings.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500">
                Every number, date, link and email matches your verified facts.
              </p>
            ) : (
              <>
                <p className="mt-1 text-xs text-slate-500">
                  These are not in your verified facts, so they may be invented. Highlighted in the
                  text. Fix or remove them, or add them as a fact on the source if they are correct,
                  then use “Re-check facts”.
                </p>
                <ul className="mt-2 space-y-1.5">
                  {warnings.map((w, i) => (
                    <li key={i} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      {w.message}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {piece.kind === 'ARTICLE' && <SerpPreview a={draft as ArticleContent} />}
          {piece.kind === 'INSTAGRAM' && (
            <InstagramPreview p={draft as InstagramContent} org={orgName} />
          )}
          {piece.kind === 'FACEBOOK' && (
            <FacebookPreview p={draft as FacebookContent} org={orgName} />
          )}
          {piece.kind === 'LINKEDIN' && (
            <LinkedinPreview p={draft as LinkedinContent} org={orgName} />
          )}

          {seoChecks && (
            <section className="card p-4">
              <h2 className="text-sm font-bold">SEO checklist</h2>
              <p className="text-[11px] text-slate-400">Based on the last saved version.</p>
              <ul className="mt-2 space-y-1.5">
                {seoChecks.map((c) => (
                  <li key={c.id} className="flex gap-2 text-xs">
                    <span className={c.ok ? 'text-green-600' : 'text-amber-600'}>
                      {c.ok ? '✓' : '!'}
                    </span>
                    <span className={c.ok ? 'text-slate-600' : 'text-slate-800'}>{c.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {canWrite && (
            <section className="card space-y-3 p-4">
              <h2 className="text-sm font-bold">Translate</h2>
              <p className="text-xs text-slate-500">
                Creates a new copy in another language. Numbers, dates and links stay unchanged.
              </p>
              <div className="flex gap-2">
                <select
                  className="input"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  disabled={translating}
                >
                  <option value="">Choose a language…</option>
                  {languagesLeft.map((l) => (
                    <option key={l} value={l}>
                      {LANG_LABELS[l]}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-primary"
                  onClick={translate}
                  disabled={!target || translating || dirty}
                >
                  {translating ? '…' : 'Translate'}
                </button>
              </div>
              {dirty && (
                <p className="text-[11px] text-amber-700">
                  Save your changes first so they are included.
                </p>
              )}
              {translating && (
                <p className="text-xs text-slate-500">Translating. This can take up to a minute.</p>
              )}
            </section>
          )}

          {siblings.length > 0 && (
            <section className="card p-4">
              <h2 className="text-sm font-bold">Other languages</h2>
              <ul className="mt-2 space-y-1">
                {siblings.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/studio/${p.id}`}
                      className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
                    >
                      <span>{LANG_LABELS[p.language] ?? p.language}</span>
                      <StatusBadge status={p.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="px-1 text-[11px] text-slate-400">
            Written by {piece.model ?? 'AI'} on {new Date(piece.createdAt).toLocaleString()} from{' '}
            {piece.usedFactIds.length} verified fact{piece.usedFactIds.length === 1 ? '' : 's'}.
          </p>
        </aside>
      </div>
    </div>
  );
}
