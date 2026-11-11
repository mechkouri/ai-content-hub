'use client';

import { ReactNode, useState } from 'react';
import { ClaimWarning } from '@/lib/api';

/** Arabic-Indic digits to ASCII, so "٢٠٢٧" matches a warning about "2027". */
function normalizeDigits(text: string): string {
  let out = '';
  for (const ch of text) {
    const n = ch.codePointAt(0) ?? 0;
    if (n >= 0x660 && n <= 0x669) out += String(n - 0x660);
    else if (n >= 0x6f0 && n <= 0x6f9) out += String(n - 0x6f0);
    else out += ch;
  }
  return out;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The warnings whose flagged value appears in this text. */
export function flagsIn(text: string, warnings: ClaimWarning[]): ClaimWarning[] {
  if (!text || !warnings.length) return [];
  const t = normalizeDigits(text).toLowerCase();
  return warnings.filter((w) => {
    const v = w.value.toLowerCase();
    if (w.type === 'number') return new RegExp(`(?<!\\d)${escapeRegExp(v)}(?!\\d)`).test(t);
    return t.includes(v);
  });
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="font-semibold">{label}</span>
      {hint && <span className="ml-2 text-xs font-normal text-slate-400">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

/** Text input or textarea with a character counter and amber highlighting for unverified details. */
export function TextBox({
  value,
  onChange,
  max,
  rows,
  warnings = [],
  disabled,
  placeholder,
  ideal,
}: {
  value: string;
  onChange: (v: string) => void;
  max: number;
  rows?: number;
  warnings?: ClaimWarning[];
  disabled?: boolean;
  placeholder?: string;
  /** Preferred [min, max] length; the counter turns amber outside it. */
  ideal?: [number, number];
}) {
  const flags = flagsIn(value, warnings);
  const outside = ideal && value.length > 0 && (value.length < ideal[0] || value.length > ideal[1]);
  const common = {
    className: `input ${flags.length ? '!border-amber-400 !ring-2 !ring-amber-200' : ''}`,
    value,
    disabled,
    placeholder,
    maxLength: max,
    dir: 'auto' as const,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  };
  return (
    <div>
      {rows ? <textarea rows={rows} {...common} /> : <input {...common} />}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="text-amber-700">
          {flags.length > 0 &&
            `⚠ Check: ${flags.map((f) => f.value).join(', ')} is not in the verified facts`}
        </span>
        <span className={outside ? 'text-amber-700' : 'text-slate-400'}>
          {value.length}/{max}
          {ideal ? ` · aim for ${ideal[0]}–${ideal[1]}` : ''}
        </span>
      </div>
    </div>
  );
}

/** Add/remove rows of a repeating group (sections, FAQ items, slides...). */
export function ListEditor<T>({
  items,
  onChange,
  render,
  makeNew,
  max,
  addLabel,
  disabled,
  itemLabel,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  render: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode;
  makeNew: () => T;
  max: number;
  addLabel: string;
  disabled?: boolean;
  itemLabel: string;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted">
            <span>
              {itemLabel} {i + 1}
            </span>
            {!disabled && (
              <span className="flex gap-3">
                {i > 0 && (
                  <button
                    type="button"
                    className="hover:text-brand"
                    onClick={() => onChange(move(items, i, i - 1))}
                  >
                    ↑ Up
                  </button>
                )}
                {i < items.length - 1 && (
                  <button
                    type="button"
                    className="hover:text-brand"
                    onClick={() => onChange(move(items, i, i + 1))}
                  >
                    ↓ Down
                  </button>
                )}
                <button
                  type="button"
                  className="text-red-600"
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </span>
            )}
          </div>
          <div className="space-y-3">
            {render(
              item,
              (patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))),
              i,
            )}
          </div>
        </div>
      ))}
      {!disabled && items.length < max && (
        <button type="button" className="btn-ghost" onClick={() => onChange([...items, makeNew()])}>
          + {addLabel}
        </button>
      )}
    </div>
  );
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [x] = copy.splice(from, 1);
  copy.splice(to, 0, x);
  return copy;
}

const cleanTag = (raw: string) =>
  `#${raw
    .trim()
    .replace(/^#+/, '')
    .replace(/[\s#,]+/g, '')}`;

export function HashtagEditor({
  tags,
  onChange,
  max,
  disabled,
  warnings = [],
}: {
  tags: string[];
  onChange: (t: string[]) => void;
  max: number;
  disabled?: boolean;
  warnings?: ClaimWarning[];
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const tag = cleanTag(draft);
    if (/^#[\p{L}\p{N}_]{2,40}$/u.test(tag) && !tags.includes(tag) && tags.length < max)
      onChange([...tags, tag]);
    setDraft('');
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <span
            key={t}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
              flagsIn(t, warnings).length
                ? 'bg-amber-100 text-amber-800'
                : 'bg-brand-soft text-brand'
            }`}
            dir="auto"
          >
            {t}
            {!disabled && (
              <button
                type="button"
                aria-label={`Remove ${t}`}
                onClick={() => onChange(tags.filter((x) => x !== t))}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && tags.length < max && (
        <input
          className="input mt-2"
          placeholder="Add a hashtag and press Enter"
          value={draft}
          dir="auto"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
        />
      )}
      <p className="mt-1 text-[11px] text-slate-400">
        {tags.length}/{max} hashtags
      </p>
    </div>
  );
}
