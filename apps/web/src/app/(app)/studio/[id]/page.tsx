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
import { PublishPanel } from '@/components/channels/publish-panel';
import { ImagesPanel } from '@/components/studio/images-panel';
import { ScheduleBox } from '@/components/studio/schedule-box';
import { PipelineSteps } from '@/components/studio/pipeline-steps';
import { StatusBadge } from '@/components/studio/status-badge';
import {
  AnyContent,
  apiFetch,
  ArticleContent,
  canReviewContent,
  canScheduleContent,
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
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';

/** Whether the writer produced an image idea, so "Draw with AI" can work without a description. */
function hasImageIdea(kind: string, content: unknown): boolean {
  const c = content as Record<string, any> | null;
  const idea =
    kind === 'ARTICLE'
      ? c?.featuredImageBrief
      : kind === 'INSTAGRAM'
        ? c?.imageBrief
        : c?.images?.[0]?.brief;
  return typeof idea === 'string' && idea.trim().length > 0;
}

export default function ContentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { currentOrgId, currentRole, memberships, user } = useApp();
  const { t, dateLocale } = useI18n();
  const orgName =
    memberships.find((m) => m.organizationId === currentOrgId)?.organization.name ??
    t('det.yourOrg');
  const canWrite = canWriteContent(currentRole);
  const canReview = canReviewContent(currentRole);
  const canSchedule = canScheduleContent(currentRole);
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
      setNotice(res.piece.warnings.length ? t('det.savedWarn') : t('det.savedOk'));
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
          ? t('det.submitted')
          : action === 'withdraw'
            ? t('det.withdrawn')
            : action === 'approve'
              ? t('det.approved')
              : t('det.sentBack'),
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
    if (!confirm(t('det.confirmDelete'))) return;
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
      setNotice(t('det.copied'));
    } catch {
      setError(t('det.copyDenied'));
    }
  }

  if (!detail || !draft)
    return <p className="text-sm text-muted">{error || t('common.loading')}</p>;
  const { piece, seoChecks, source } = detail;
  const kind = CONTENT_KINDS.find((k) => k.id === piece.kind)!;
  const nFacts = piece.usedFactIds.length;
  const factsUsed =
    nFacts === 1 ? t('det.step.factsUsed1') : t('det.step.factsUsedN', { n: nFacts });
  const checkLabel = (n: number) => (n === 1 ? t('det.check1') : t('det.checkN', { n }));
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
        <span aria-hidden className="rtl:hidden">
          ←
        </span>
        <span aria-hidden className="hidden rtl:inline">
          →
        </span>{' '}
        {t('det.back')}
      </Link>

      <section className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold" dir="auto">
              {piece.title}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>
                {kind.icon} {t(`kind.${piece.kind}` as MessageKey)} ·{' '}
                {LANG_LABELS[piece.language] ?? piece.language}
              </span>
              <StatusBadge status={piece.status} />
              <ApprovalBadge status={piece.approvalStatus} />
              {piece.edited && <span className="text-xs">{t('studio.edited')}</span>}
              {source && (
                <Link href={`/sources/${source.id}`} className="text-brand underline">
                  {t('det.source', { title: source.title })}
                </Link>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={copy}>
              {t('det.copy')}
            </button>
            {canWrite && (
              <>
                <button className="btn-primary" onClick={save} disabled={saving || !dirty}>
                  {saving ? t('det.saving') : dirty ? t('det.saveChanges') : t('det.saved')}
                </button>
                <button
                  className="btn-ghost"
                  onClick={save}
                  disabled={saving}
                  title={t('det.recheckTitle')}
                >
                  {t('det.recheck')}
                </button>
                <button className="btn-danger" onClick={remove}>
                  {t('common.delete')}
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
            {t('det.unsaved')}
          </p>
        )}
      </section>

      <PipelineSteps
        steps={[
          {
            label: t('det.step.source'),
            detail: source?.title ?? t('det.step.original'),
            state: 'done',
          },
          { label: t('det.step.facts'), detail: factsUsed, state: 'done' },
          {
            label: t('det.step.draft'),
            detail: piece.model ?? t('det.step.aiDraft'),
            state: 'done',
          },
          {
            label: t('det.step.review'),
            detail: warnings.length
              ? checkLabel(warnings.length)
              : piece.approvalStatus === 'APPROVED'
                ? t('approval.APPROVED')
                : piece.approvalStatus === 'IN_REVIEW'
                  ? t('det.step.waiting')
                  : piece.approvalStatus === 'CHANGES_REQUESTED'
                    ? t('approval.CHANGES_REQUESTED')
                    : t('det.step.ready'),
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
              {warnings.length ? `⚠ ${checkLabel(warnings.length)}` : `✓ ${t('det.factsMatch')}`}
            </h2>
            {warnings.length === 0 ? (
              <p className="mt-1 text-xs text-muted">{t('det.factsMatchHint')}</p>
            ) : (
              <>
                <p className="mt-1 text-xs text-muted">{t('det.flagHint')}</p>
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

          {currentOrgId && (
            <section className="card p-4">
              <h2 className="text-sm font-display text-base font-semibold">{t('det.pictures')}</h2>
              <div className="mt-2">
                <ImagesPanel
                  orgId={currentOrgId}
                  contentId={piece.id}
                  kind={piece.kind}
                  hasIdea={hasImageIdea(piece.kind, draft)}
                  canEdit={canWrite}
                  canDraw={canWrite}
                  onChanged={load}
                />
              </div>
            </section>
          )}

          <section className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-display text-base font-semibold">{t('det.approval')}</h2>
              <ApprovalBadge status={piece.approvalStatus} />
            </div>
            {piece.approvalStatus === 'APPROVED' && (
              <p className="mt-1 text-xs text-muted">{t('det.approvedHint')}</p>
            )}
            {(canWrite || canReview) && piece.approvalStatus !== 'APPROVED' && (
              <div className="mt-3 space-y-2">
                <textarea
                  className="input min-h-[64px]"
                  placeholder={
                    piece.approvalStatus === 'IN_REVIEW'
                      ? t('det.commentRequired')
                      : t('det.noteReviewer')
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
                      {t('det.submitReview')}
                    </button>
                    {(dirty || warnings.length > 0) && (
                      <p className="text-[11px] text-amber-700">
                        {dirty ? t('det.saveBeforeSubmit') : t('det.fixBeforeSubmit')}
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
                          {t('det.approve')}
                        </button>
                        <button
                          className="btn-ghost flex-1"
                          onClick={() => decide('request-changes')}
                          disabled={deciding || dirty || comment.trim().length < 3}
                        >
                          {t('det.requestChanges')}
                        </button>
                      </div>
                    )}
                    {canWrite && (
                      <button
                        className="btn-ghost w-full"
                        onClick={() => decide('withdraw')}
                        disabled={deciding}
                      >
                        {t('det.withdraw')}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
            <ReviewHistory reviews={reviews} userId={user?.id} />
          </section>

          {piece.approvalStatus === 'APPROVED' && (
            <section className="card p-4">
              <h2 className="text-sm font-display text-base font-semibold">{t('det.schedule')}</h2>
              {canSchedule ? (
                <div className="mt-2">
                  <ScheduleBox base={base} scheduledFor={piece.scheduledFor} onChanged={load} />
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted">
                  {piece.scheduledFor
                    ? t('det.plannedFor', {
                        date: new Date(piece.scheduledFor).toLocaleString(dateLocale),
                      })
                    : t('det.notScheduled')}
                </p>
              )}
            </section>
          )}

          {piece.approvalStatus === 'APPROVED' && currentOrgId && (
            <section className="card p-4">
              <h2 className="text-sm font-display text-base font-semibold">{t('det.publish')}</h2>
              <div className="mt-2">
                <PublishPanel
                  orgId={currentOrgId}
                  contentId={piece.id}
                  scheduledFor={piece.scheduledFor}
                  canPublish={canSchedule}
                />
              </div>
            </section>
          )}

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
              <h2 className="text-sm font-display text-base font-semibold">{t('det.seo')}</h2>
              <p className="text-[11px] text-slate-400">{t('det.seoBased')}</p>
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
              <h2 className="text-sm font-display text-base font-semibold">{t('det.translate')}</h2>
              <p className="text-xs text-muted">{t('det.translateHint')}</p>
              <div className="flex gap-2">
                <select
                  className="input"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  disabled={translating}
                >
                  <option value="">{t('det.chooseLang')}</option>
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
                  {translating ? '…' : t('det.translate')}
                </button>
              </div>
              {dirty && <p className="text-[11px] text-amber-700">{t('det.saveFirst')}</p>}
              {translating && <p className="text-xs text-muted">{t('det.translating')}</p>}
            </section>
          )}

          {siblings.length > 0 && (
            <section className="card p-4">
              <h2 className="text-sm font-display text-base font-semibold">
                {t('det.otherLangs')}
              </h2>
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
            {nFacts === 1
              ? t('det.written1', {
                  model: piece.model ?? t('det.modelAi'),
                  date: new Date(piece.createdAt).toLocaleString(dateLocale),
                })
              : t('det.writtenN', {
                  model: piece.model ?? t('det.modelAi'),
                  date: new Date(piece.createdAt).toLocaleString(dateLocale),
                  n: nFacts,
                })}
          </p>
        </aside>
      </div>
    </div>
  );
}
