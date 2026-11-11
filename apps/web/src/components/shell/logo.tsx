import { Sparkles } from 'lucide-react';

/** Product mark: cobalt rounded square with a spark, plus the wordmark. */
export function Logo({
  className = '',
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white shadow-[inset_0_1px_0_rgba(255,255,255,.25)]">
        <Sparkles size={18} strokeWidth={2.2} aria-hidden />
      </div>
      {!compact && (
        <div className="leading-tight">
          <p className="font-display text-[17px] font-bold tracking-tight text-ink">
            AI Content Hub
          </p>
          <p className="font-label text-[11px] text-muted">Content studio</p>
        </div>
      )}
    </div>
  );
}
