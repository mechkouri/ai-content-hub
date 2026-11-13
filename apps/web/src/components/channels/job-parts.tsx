'use client';

import { PublishJob, PublishStatus } from '@/lib/api';
import { useT } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';

export function JobBadge({ status }: { status: PublishStatus }) {
  const t = useT();
  const cls =
    status === 'PUBLISHED'
      ? 'chip-ok'
      : status === 'FAILED'
        ? 'chip-warn'
        : status === 'QUEUED' || status === 'PUBLISHING'
          ? 'chip-info'
          : 'chip-draft';
  return <span className={cls}>{t(`job.${status}`)}</span>;
}

/** One line saying what happened or will happen to a post. */
export function jobWhen(
  j: PublishJob,
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  dateLocale: string,
): string {
  if (j.status === 'PUBLISHED' && j.publishedAt) {
    return t('job.publishedAt', { when: new Date(j.publishedAt).toLocaleString(dateLocale) });
  }
  if (j.status === 'QUEUED') {
    const at = new Date(j.runAt);
    return at.getTime() <= Date.now()
      ? t('job.waiting')
      : t('job.goesOut', { when: at.toLocaleString(dateLocale) });
  }
  if (j.status === 'FAILED') {
    return t(j.attempts === 1 ? 'job.failedOne' : 'job.failedMany', { n: j.attempts });
  }
  return '';
}
