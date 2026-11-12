import { PublishJob, PublishStatus } from '@/lib/api';

const LABEL: Record<PublishStatus, string> = {
  QUEUED: 'Waiting',
  PUBLISHING: 'Publishing…',
  PUBLISHED: 'Published',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

export function JobBadge({ status }: { status: PublishStatus }) {
  const cls =
    status === 'PUBLISHED'
      ? 'chip-ok'
      : status === 'FAILED'
        ? 'chip-warn'
        : status === 'QUEUED' || status === 'PUBLISHING'
          ? 'chip-info'
          : 'chip-draft';
  return <span className={cls}>{LABEL[status]}</span>;
}

/** One line saying what happened or will happen to a post. */
export function jobWhen(j: PublishJob): string {
  if (j.status === 'PUBLISHED' && j.publishedAt) {
    return `Published ${new Date(j.publishedAt).toLocaleString()}`;
  }
  if (j.status === 'QUEUED') {
    const at = new Date(j.runAt);
    return at.getTime() <= Date.now() ? 'Waiting to go out' : `Goes out ${at.toLocaleString()}`;
  }
  if (j.status === 'FAILED')
    return `Failed after ${j.attempts} attempt${j.attempts === 1 ? '' : 's'}`;
  return '';
}
