'use client';

import { useT } from '@/lib/i18n';

export function StatusBadge({ status }: { status: string }) {
  const t = useT();
  return status === 'NEEDS_REVIEW' ? (
    <span className="chip-warn">{t('status.needsReview')}</span>
  ) : (
    <span className="chip-ok">{t('status.draft')}</span>
  );
}
