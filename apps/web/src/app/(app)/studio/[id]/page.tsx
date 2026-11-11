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
import { ApprovalBadge, ReviewHistory } from '@/components/studio/approval';
import { PipelineSteps } from '@/components/studio/pipeline-steps';
import { StatusBadge } from '@/components/studio/status-badge';
import {
  AnyContent,
  apiFetch,
  ArticleContent,
  canReviewContent,
  canWriteContent,
  ContentReview,
  CONTENT_KINDS,
  ContentDetail,
  ClaimWarning,
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
  const { currentOrgId, currentRole, memberships, user } = useApp();
  const orgName =
    memberships.find((m) => m.organizationId === currentOrgId)?.organization.name ??
    'Your organization';
  const canWrite = canWriteContent(currentRole);
  const canReview = canReviewContent(currentRole);
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
  const [reviews, setReviews] = useState<ContentReview[]>([]);
  const [comment, setComment] = useState('');
  const [deciding, setDeciding] = useState(false);

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
      setReviews(await apiFetch<ContentReview[]>(`${base}/reviews`));
    } catch (e) {
      setError(describeError(e));
    }
  }, [currentOrgId, base]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = draft !== null && saved !== null && isDirty(draft, saved);

  // Live check: while editing, ask the server (no AI involved) which details are not in the verified facts,
  // so invented dates, prices and links are highlighted as you type, not only after saving.
  const [live, setLive] = useState<ClaimWarning[] | null>(null);
  useEffect(() => {
    if (!dirty || !draft || !currentOrgId) {
      setLive(null);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      apiFetch<{ warnings: ClaimWarning[] }>(`${base}/check`, {
        method: 'POST',
        body: JSON.stringify({ content: draft }),
      })
        .then((r) => current && setLive(r.warnings))
        .catch(() => current && setLive(null)); // an unfinished edit may not validate yet: keep the last saved result
    }, 700);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [dirty, draft, currentOrgId, base]);

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
      apiFetch<ContentReview[]>(`${base}/reviews`)
        .then(setReviews)
        .catch(() => undefined);
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

  async function decide(action: 'submit' | 'withdraw' | 'approve' | 'request-changes') {
    setDeciding(true);
    setError('');
    setNotice('');
    try {
      await apiFetch(`${base}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ comment: comment.trim() || undefined }),
      });
      setComment('');
      await load();
      setNotice(
        action === 'submit'
          ? 'Submitted for review.'
          : action === 'withdraw'
            ? 'Submission withdrawn.'
            : action === 'approve'
              ? 'Approved.'
              : 'Sent back with your comment.',
      );
    } catch (e) {
      setError(describeError(e));
    }
    setDeciding(false);
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

  if (!detail || !draft) return <p className="text-sm text-muted">{error || 'Loading…'}</p>;
  const { piece, seoChecks, source } = detail;
  const kind = CONTENT_KINDS.find((k) => k.id === piece.kind)!;
  // While there are unsaved edits, show the live verdict; otherwise the saved one.
  const warnings = dirty && live ? live : piece.warnings;
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
            <h1 className="font-display text-2xl font-semibold" dir="auto">
              {piece.title}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>
                {kind.icon} {kind.label} · {LANG_LABELS[piece.language] ?? piece.language}
              </span>
              <StatusBadge status={piece.status} />
              <ApprovalBadge status={piece.approvalStatus} />
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
        {error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm text-danger-ink">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-3 rounded-lg border border-green-200 bg-ok-soft p-3 text-sm text-ok-ink">
            {notice}
          </p>
        )}
        {dirty && (
          <p className="mt-3 rounded-lg bg-slate-100 p-3 text-xs text-slate-600">
            You have unsaved changes.
          </p>
        )}
      </section>

      <PipelineSteps
        steps={[
          { label: 'Source parsed', detail: source?.title ?? 'Original saved', state: 'done' },
          {
            label: 'Facts verified',
            detail: `${piece.usedFactIds.length} verified fact${piece.usedFactIds.length === 1 ? '' : 's'} used`,
            state: 'done',
          },
          { label: 'Draft written', detail: piece.model ?? 'AI draft', state: 'done' },
          {
            label: 'Human review',
            detail: warnings.length
              ? `${warnings.length} detail${warnings.length === 1 ? '' : 's'} to check`
              : piece.approvalStatus === 'APPROVED'
                ? 'Approved'
                : piece.approvalStatus === 'IN_REVIEW'
                  ? 'Waiting for an approver'
                  : piece.approvalStatus === 'CHANGES_REQUESTED'
                    ? 'Changes requested'
                    : 'Ready to submit',
            state: piece.approvalStatus === 'APPROVED' && !warnings.length ? 'done' : 'active',
          },
        ]}
      />

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
            <h2 className="text-sm font-display text-base font-semibold">
              {warnings.length
                ? `⚠ ${warnings.length} detail${warnings.length > 1 ? 's' : ''} to check`
                : '✓ Facts match'}
            </h2>
            {warnings.length === 0 ? (
              <p className="mt-1 text-xs text-muted">
                Every number, date, link and email matches your verified facts.
              </p>
            ) : (
              <>
                <p className="mt-1 text-xs text-muted">
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

          <section className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-display text-base font-semibold">Approval</h2>
              <ApprovalBadge status={piece.approvalStatus} />
            </div>
            {piece.approvalStatus === 'APPROVED' && (
              <p className="mt-1 text-xs text-muted">
                Approved. Any edit will send it back to draft so the approved text is always the
                saved text.
              </p>
            )}
            {(canWrite || canReview) && piece.approvalStatus !== 'APPROVED' && (
              <div className="mt-3 space-y-2">
                <textarea
                  className="input min-h-[64px]"
                  placeholder={
                    piece.approvalStatus === 'IN_REVIEW'
                      ? 'Comment (required to request changes)'
                      : 'Add a note for the reviewer (optional)'
                  }
                  maxLength={1000}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={deciding}
                />
                {canWrite && piece.approvalStatus !== 'IN_REVIEW' && (
                  <>
                    <button
                      className="btn-primary w-full"
                      onClick={() => decide('submit')}
                      disabled={deciding || dirty || warnings.length > 0}
                    >
                      Submit for review
                    </button>
                    {(dirty || warnings.length > 0) && (
                      <p className="text-[11px] text-amber-700">
                        {dirty
                          ? 'Save your changes before submitting.'
                          : 'Fix the details flagged above before submitting.'}
                      </p>
                    )}
                  </>
                )}
                {piece.approvalStatus === 'IN_REVIEW' && (
                  <>
                    {canReview && (
                      <div className="flex gap-2">
                        <button
                          className="btn-primary flex-1"
                          onClick={() => decide('approve')}
                          disabled={deciding || dirty}
                        >
                          Approve
                        </button>
                        <button
                          className="btn-ghost flex-1"
                          onClick={() => decide('request-changes')}
                          disabled={deciding || dirty || comment.trim().length < 3}
                        >
                          Request changes
                        </button>
                      </div>
                    )}
                    {canWrite && (
                      <button
                        className="btn-ghost w-full"
                        onClick={() => decide('withdraw')}
                        disabled={deciding}
                      >
                        Withdraw
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
            <ReviewHistory reviews={reviews} userId={user?.id} />
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
              <h2 className="text-sm font-display text-base font-semibold">SEO checklist</h2>
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
              <h2 className="text-sm font-display text-base font-semibold">Translate</h2>
              <p className="text-xs text-muted">
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
                <p className="text-xs text-muted">Translating. This can take up to a minute.</p>
              )}
            </section>
          )}

          {siblings.length > 0 && (
            <section className="card p-4">
              <h2 className="text-sm font-display text-base font-semibold">Other languages</h2>
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
