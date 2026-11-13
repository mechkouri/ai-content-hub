'use client';

import { useEffect, useRef, useState } from 'react';
import { Brand, Fill, resolveFill, TOKENS } from '@/lib/design/doc';
import { useT } from '@/lib/i18n';

/** A colour button that opens the brand colours and a free colour picker. A value is a brand token or a hex colour. */
export function ColorField({
  value,
  brand,
  onChange,
  label,
  allowNone = false,
}: {
  value: Fill | null;
  brand: Brand;
  onChange: (v: Fill | null) => void;
  label: string;
  /** Offer "no colour" (for an optional box behind text). */
  allowNone?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  const shown = value ? resolveFill(value, brand) : null;
  const swatch = (fill: Fill) => (
    <button
      key={fill}
      type="button"
      aria-label={fill}
      aria-pressed={value === fill}
      onClick={() => {
        onChange(fill);
        setOpen(false);
      }}
      className={`h-7 w-7 rounded-full border ${value === fill ? 'ring-2 ring-brand ring-offset-1' : 'border-slate-300'}`}
      style={{ background: resolveFill(fill, brand) }}
    />
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-2 hover:bg-surface"
      >
        <span
          className="h-5 w-5 rounded-full border border-slate-300"
          style={{
            background:
              shown ?? 'repeating-linear-gradient(45deg,#fff,#fff 4px,#e2e8f0 4px,#e2e8f0 8px)',
          }}
        />
        <span className="hidden text-xs font-semibold text-slate-600 sm:inline">{label}</span>
      </button>
      {open && (
        <div className="absolute start-0 top-11 z-30 w-60 space-y-2 rounded-xl border border-line bg-white p-3 shadow-lg">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {t('dx.brandColours')}
          </p>
          <div className="flex flex-wrap gap-2">
            {TOKENS.map((tk) => swatch(tk))}
            {allowNone && (
              <button
                type="button"
                aria-label={t('dx.noBox')}
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="flex h-7 items-center rounded-full border border-slate-300 px-2 text-[11px] font-semibold"
              >
                {t('dx.noBox')}
              </button>
            )}
          </div>
          <label className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">
            {t('dx.custom')}
            <input
              type="color"
              value={shown ?? '#000000'}
              onChange={(e) => onChange(e.target.value.toLowerCase())}
              className="h-7 w-10 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
            />
          </label>
        </div>
      )}
    </div>
  );
}
