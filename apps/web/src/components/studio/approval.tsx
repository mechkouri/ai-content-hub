import { ApprovalStatus, ContentReview, ReviewAction } from '@/lib/api';

const LABEL: Record<ApprovalStatus, string> = {
  DRAFT: 'Not submitted',
  IN_REVIEW: 'In review',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Approved',
};

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const cls =
    status === 'APPROVED'
      ? 'chip-ok'
      : status === 'IN_REVIEW'
        ? 'chip-info'
        : status === 'CHANGES_REQUESTED'
          ? 'chip-warn'
          : 'chip-draft';
  return <span className={cls}>{LABEL[status]}</span>;
}

const EVENT: Record<ReviewAction, string> = {
  SUBMITTED: 'submitted for review',
  WITHDRAWN: 'withdrew the submission',
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'requested changes',
  INVALIDATED: 'edit reset the review',
};

export function ReviewHistory({ reviews, userId }: { reviews: ContentReview[]; userId?: string }) {
  if (reviews.length === 0) return null;
  return (
    <ol className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      {[...reviews].reverse().map((r) => (
        <li key={r.id} className="text-xs">
          <p className="text-slate-700">
            <span className="font-semibold">
              {r.action === 'INVALIDATED' ? 'System' : r.actorId === userId ? 'You' : 'A teammate'}
            </span>{' '}
            {EVENT[r.action]}
            <span className="text-slate-400"> · {new Date(r.createdAt).toLocaleString()}</span>
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
