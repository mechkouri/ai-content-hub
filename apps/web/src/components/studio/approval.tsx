'use client';

import { ApprovalStatus, ContentReview } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const { t } = useI18n();
  const cls =
    status === 'APPROVED'
      ? 'chip-ok'
      : status === 'IN_REVIEW'
        ? 'chip-info'
        : status === 'CHANGES_REQUESTED'
          ? 'chip-warn'
          : 'chip-draft';
  return <span className={cls}>{t(`approval.${status}`)}</span>;
}

export function ReviewHistory({ reviews, userId }: { reviews: ContentReview[]; userId?: string }) {
  const { t, dateLocale } = useI18n();
  if (reviews.length === 0) return null;
  return (
    <ol className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      {[...reviews].reverse().map((r) => (
        <li key={r.id} className="text-xs">
          <p className="text-slate-700">
            <span className="font-semibold">
              {r.action === 'INVALIDATED'
                ? t('review.system')
                : r.actorId === userId
                  ? t('review.you')
                  : t('review.teammate')}
            </span>{' '}
            {t(`review.${r.action}`)}
            <span className="text-slate-400">
              {' '}
              · {new Date(r.createdAt).toLocaleString(dateLocale)}
            </span>
          </p>
          {r.comment && r.action !== 'INVALIDATED' && (
            <p className="mt-0.5 rounded-lg bg-slate-50 px-2 py-1 text-slate-600" dir="auto">
              “{r.comment}”
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
