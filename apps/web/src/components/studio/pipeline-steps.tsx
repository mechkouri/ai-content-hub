import { Check } from 'lucide-react';

export interface PipelineStep {
  label: string;
  detail: string;
  state: 'done' | 'active' | 'todo';
}

/** Horizontal progress of a piece of content, as in the design's campaign workspace header. */
export function PipelineSteps({ steps }: { steps: PipelineStep[] }) {
  return (
    <ol className="card grid gap-3 p-4 sm:grid-cols-4" aria-label="Content pipeline">
      {steps.map((s, i) => (
        <li
          key={s.label}
          aria-current={s.state === 'active' ? 'step' : undefined}
          className={`flex items-center gap-3 rounded-xl px-3 py-2 ${s.state === 'active' ? 'border border-brand-line bg-brand-soft' : ''}`}
        >
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-label text-xs font-bold ${
              s.state === 'done'
                ? 'bg-ok-soft text-ok-ink'
                : s.state === 'active'
                  ? 'bg-brand text-white'
                  : 'bg-surface-sub text-slate-400'
            }`}
          >
            {s.state === 'done' ? <Check size={15} strokeWidth={3} aria-hidden /> : i + 1}
          </span>
          <span className="min-w-0">
            <span className="eyebrow block">Step {String(i + 1).padStart(2, '0')}</span>
            <span className="block truncate text-sm font-semibold">{s.label}</span>
            <span className="block truncate text-xs text-muted">{s.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
