'use client';

import { ArrowDown, ArrowUp, Link as LinkIcon, Plus, Trash2 } from 'lucide-react';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { ArticleContent, ClaimWarning } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Field, flagsIn, ListEditor, TextBox } from './fields';

type Section = ArticleContent['sections'][number];
type Faq = ArticleContent['faq'][number];

const MAX_SECTIONS = 10;
const MAX_SUBSECTIONS = 5;
const MAX_FAQ = 8;

const move = <T,>(arr: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= arr.length) return arr;
  const copy = [...arr];
  const [x] = copy.splice(from, 1);
  copy.splice(to, 0, x);
  return copy;
};

/** Text that grows with what is typed, like a paragraph in a page editor. Unverified details are highlighted. */
function Flow({
  value,
  onChange,
  max,
  placeholder,
  warnings,
  disabled,
  className = '',
  single = false,
  format = false,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder: string;
  warnings: ClaimWarning[];
  disabled?: boolean;
  className?: string;
  /** A heading: no line breaks. */
  single?: boolean;
  /** Offer bold, italic and links (paragraph text, not headings). */
  format?: boolean;
  label: string;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState('https://');
  const [urlError, setUrlError] = useState(false);
  const picked = useRef({ s: 0, e: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  /** Applies a change, then puts the selection back so formatting can be repeated or undone. */
  const apply = (next: string, from: number, to: number) => {
    onChange(next);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(from, to);
    });
  };

  /** Wraps the selection in a mark (** or *), or takes the mark off if it is already there. */
  function wrap(mark: string) {
    const el = ref.current;
    if (!el || disabled) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const sel = value.slice(s, e);
    const m = mark.length;
    if (value.slice(s - m, s) === mark && value.slice(e, e + m) === mark) {
      apply(value.slice(0, s - m) + sel + value.slice(e + m), s - m, e - m);
    } else if (sel.length > 2 * m && sel.startsWith(mark) && sel.endsWith(mark)) {
      const inner = sel.slice(m, sel.length - m);
      apply(value.slice(0, s) + inner + value.slice(e), s, s + inner.length);
    } else {
      apply(value.slice(0, s) + mark + sel + mark + value.slice(e), s + m, e + m);
    }
  }

  function openLink() {
    const el = ref.current;
    if (!el || disabled) return;
    picked.current = { s: el.selectionStart, e: el.selectionEnd };
    setUrl('https://');
    setUrlError(false);
    setLinkOpen(true);
  }

  function addLink() {
    const address = url.trim();
    if (!/^https?:\/\/[^\s)<>"']+$/.test(address) || address.length > 500) {
      setUrlError(true);
      return;
    }
    const { s, e } = picked.current;
    const text = value.slice(s, e).replace(/[\][\n]/g, ' ') || address;
    const md = `[${text}](${address})`;
    setLinkOpen(false);
    apply(value.slice(0, s) + md + value.slice(e), s, s + md.length);
  }

  const flags = flagsIn(value, warnings);
  const tool =
    'flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-semibold text-slate-700 hover:bg-slate-100';
  return (
    <div
      className="relative"
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocused(false);
          setLinkOpen(false);
        }
      }}
    >
      {format && !disabled && (focused || linkOpen) && (
        <div
          className="absolute -top-10 start-2 z-20 flex items-center gap-0.5 rounded-lg border border-line bg-white p-1 shadow-md"
          // keep the text selected when a button is pressed
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault();
          }}
        >
          {linkOpen ? (
            <>
              <input
                autoFocus
                dir="ltr"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setUrlError(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addLink();
                  } else if (e.key === 'Escape') {
                    setLinkOpen(false);
                    ref.current?.focus();
                  }
                }}
                aria-label={t('wp.linkUrl')}
                placeholder={t('wp.linkUrl')}
                aria-invalid={urlError}
                className={`h-8 w-64 rounded-md border px-2 text-sm outline-none ${urlError ? 'border-red-400' : 'border-line'}`}
              />
              <button type="button" className={`${tool} text-brand`} onClick={addLink}>
                {t('wp.linkApply')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={tool}
                onClick={() => wrap('**')}
                title={t('wp.bold')}
                aria-label={t('wp.bold')}
              >
                <span className="font-bold">B</span>
              </button>
              <button
                type="button"
                className={tool}
                onClick={() => wrap('*')}
                title={t('wp.italic')}
                aria-label={t('wp.italic')}
              >
                <span className="italic">I</span>
              </button>
              <button
                type="button"
                className={tool}
                onClick={openLink}
                title={t('wp.link')}
                aria-label={t('wp.link')}
              >
                <LinkIcon size={15} aria-hidden />
              </button>
            </>
          )}
        </div>
      )}
      {urlError && linkOpen && (
        <p className="absolute -top-14 start-2 z-20 rounded bg-red-600 px-2 py-0.5 text-[11px] text-white">
          {t('wp.linkInvalid')}
        </p>
      )}
      <textarea
        ref={ref}
        rows={1}
        value={value}
        dir="auto"
        disabled={disabled}
        maxLength={max}
        aria-label={label}
        placeholder={placeholder}
        onChange={(e) => onChange(single ? e.target.value.replace(/\n/g, ' ') : e.target.value)}
        onKeyDown={(e) => {
          if (single && e.key === 'Enter') e.preventDefault();
          if (format && (e.ctrlKey || e.metaKey)) {
            const k = e.key.toLowerCase();
            if (k === 'b') {
              e.preventDefault();
              wrap('**');
            } else if (k === 'i') {
              e.preventDefault();
              wrap('*');
            } else if (k === 'k') {
              e.preventDefault();
              openLink();
            }
          }
        }}
        className={`block w-full resize-none overflow-hidden rounded-md border-0 bg-transparent px-2 py-1 outline-none ring-0 transition placeholder:text-slate-300 hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-brand/30 ${
          flags.length ? 'bg-amber-50 ring-2 ring-amber-300' : ''
        } ${className}`}
      />
      {flags.length > 0 && (
        <p className="px-2 text-[11px] text-amber-700">
          ⚠ {t('fld.notVerified', { values: flags.map((f) => f.value).join(', ') })}
        </p>
      )}
      {value.length > max * 0.9 && (
        <p className="px-2 text-[11px] text-slate-400">
          {value.length}/{max}
        </p>
      )}
    </div>
  );
}

/** Move up, move down and remove, shown beside a block when it is hovered or focused. */
function BlockTools({
  onUp,
  onDown,
  onRemove,
  disabled,
  first,
  last,
}: {
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  disabled?: boolean;
  first: boolean;
  last: boolean;
}) {
  const { t } = useI18n();
  if (disabled) return null;
  const btn =
    'flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30';
  return (
    <div className="absolute -top-3 end-2 z-10 hidden gap-0.5 rounded-lg border border-line bg-white p-0.5 shadow-sm group-focus-within:flex group-hover:flex">
      <button
        type="button"
        className={btn}
        onClick={onUp}
        disabled={first}
        title={t('wp.moveUp')}
        aria-label={t('wp.moveUp')}
      >
        <ArrowUp size={14} />
      </button>
      <button
        type="button"
        className={btn}
        onClick={onDown}
        disabled={last}
        title={t('wp.moveDown')}
        aria-label={t('wp.moveDown')}
      >
        <ArrowDown size={14} />
      </button>
      <button
        type="button"
        className={`${btn} text-red-600`}
        onClick={onRemove}
        title={t('wp.removeBlock')}
        aria-label={t('wp.removeBlock')}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function Inserter({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 py-1">{children}</div>;
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs font-semibold text-slate-500 hover:border-brand hover:text-brand"
    >
      <Plus size={13} aria-hidden /> {children}
    </button>
  );
}

/**
 * The article as a page, in the spirit of the WordPress editor: a big title, the permalink, then the text as
 * flowing blocks (paragraphs, headings, subheadings, questions) that grow as you type. Everything still maps
 * onto the structured article, so the fact check, the SEO score and publishing keep working unchanged.
 */
export function ArticleDocument({
  value: a,
  onChange,
  warnings,
  disabled,
}: {
  value: ArticleContent;
  onChange: (v: ArticleContent) => void;
  warnings: ClaimWarning[];
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const set = (patch: Partial<ArticleContent>) => onChange({ ...a, ...patch });
  const setSection = (i: number, patch: Partial<Section>) =>
    set({ sections: a.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const setFaq = (i: number, patch: Partial<Faq>) =>
    set({ faq: a.faq.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const props = { warnings, disabled };
  const words = [
    a.introduction,
    a.conclusion,
    ...a.sections.flatMap((s) => [s.body, ...(s.subsections ?? []).map((x) => x.body)]),
  ]
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;

  return (
    <div className="space-y-4">
      <article className="card mx-auto max-w-3xl space-y-2 p-6 sm:p-10">
        <Flow
          {...props}
          single
          value={a.h1}
          onChange={(v) => set({ h1: v })}
          max={160}
          label={t('ed.h1')}
          placeholder={t('wp.titlePh')}
          className="font-display text-3xl font-bold leading-tight sm:text-4xl"
        />
        <p className="px-2 text-xs text-slate-400" dir="ltr">
          {t('wp.permalink')}: <span className="text-slate-500">…/{a.slug || '…'}</span>
        </p>

        <div className="pt-2">
          <Flow
            {...props}
            value={a.excerpt}
            onChange={(v) => set({ excerpt: v })}
            max={400}
            label={t('ed.excerpt')}
            placeholder={t('wp.excerptPh')}
            className="text-sm italic text-slate-500"
          />
        </div>

        <p className="px-2 pt-2 text-[11px] text-slate-400">{t('wp.formatHint')}</p>
        <div className="pt-2">
          <Flow
            {...props}
            value={a.introduction}
            onChange={(v) => set({ introduction: v })}
            max={2500}
            format
            label={t('ed.intro')}
            placeholder={t('wp.introPh')}
            className="text-lg leading-relaxed"
          />
        </div>

        {a.sections.map((s, i) => (
          <div key={i} className="group relative rounded-lg pt-4">
            <BlockTools
              {...props}
              first={i === 0}
              last={i === a.sections.length - 1}
              onUp={() => set({ sections: move(a.sections, i, i - 1) })}
              onDown={() => set({ sections: move(a.sections, i, i + 1) })}
              onRemove={() => set({ sections: a.sections.filter((_, j) => j !== i) })}
            />
            <Flow
              {...props}
              single
              value={s.heading}
              onChange={(v) => setSection(i, { heading: v })}
              max={160}
              label={t('ed.h2')}
              placeholder={t('wp.headingPh')}
              className="font-display text-2xl font-semibold leading-snug"
            />
            <Flow
              {...props}
              value={s.body}
              onChange={(v) => setSection(i, { body: v })}
              max={4500}
              format
              label={t('ed.text')}
              placeholder={t('wp.bodyPh')}
              className="text-base leading-relaxed"
            />
            {(s.subsections ?? []).map((sub, k) => (
              <div key={k} className="group relative ms-4 border-s-2 border-slate-100 ps-3 pt-2">
                <BlockTools
                  {...props}
                  first={k === 0}
                  last={k === (s.subsections ?? []).length - 1}
                  onUp={() => setSection(i, { subsections: move(s.subsections ?? [], k, k - 1) })}
                  onDown={() => setSection(i, { subsections: move(s.subsections ?? [], k, k + 1) })}
                  onRemove={() =>
                    setSection(i, { subsections: (s.subsections ?? []).filter((_, j) => j !== k) })
                  }
                />
                <Flow
                  {...props}
                  single
                  value={sub.heading}
                  onChange={(v) =>
                    setSection(i, {
                      subsections: (s.subsections ?? []).map((x, j) =>
                        j === k ? { ...x, heading: v } : x,
                      ),
                    })
                  }
                  max={160}
                  label={t('ed.subheading')}
                  placeholder={t('wp.subheadingPh')}
                  className="font-display text-xl font-semibold"
                />
                <Flow
                  {...props}
                  value={sub.body}
                  onChange={(v) =>
                    setSection(i, {
                      subsections: (s.subsections ?? []).map((x, j) =>
                        j === k ? { ...x, body: v } : x,
                      ),
                    })
                  }
                  max={3500}
                  format
                  label={t('ed.text')}
                  placeholder={t('wp.bodyPh')}
                  className="text-base leading-relaxed"
                />
              </div>
            ))}
            {!disabled && (s.subsections ?? []).length < MAX_SUBSECTIONS && (
              <div className="ms-4 pt-1">
                <AddButton
                  onClick={() =>
                    setSection(i, {
                      subsections: [...(s.subsections ?? []), { heading: '', body: '' }],
                    })
                  }
                >
                  {t('wp.addSub')}
                </AddButton>
              </div>
            )}
          </div>
        ))}

        {!disabled && a.sections.length < MAX_SECTIONS && (
          <Inserter>
            <AddButton
              onClick={() => set({ sections: [...a.sections, { heading: '', body: '' }] })}
            >
              {t('wp.addSection')}
            </AddButton>
          </Inserter>
        )}

        <div className="pt-4">
          <Flow
            {...props}
            value={a.conclusion}
            onChange={(v) => set({ conclusion: v })}
            max={2500}
            format
            label={t('ed.conclusion')}
            placeholder={t('wp.conclusionPh')}
            className="text-base leading-relaxed"
          />
        </div>

        {(a.faq.length > 0 || !disabled) && (
          <div className="space-y-2 border-t border-line pt-6">
            <h2 className="px-2 font-display text-xl font-semibold">{t('wp.faqTitle')}</h2>
            {a.faq.map((f, i) => (
              <div key={i} className="group relative rounded-lg pt-2">
                <BlockTools
                  {...props}
                  first={i === 0}
                  last={i === a.faq.length - 1}
                  onUp={() => set({ faq: move(a.faq, i, i - 1) })}
                  onDown={() => set({ faq: move(a.faq, i, i + 1) })}
                  onRemove={() => set({ faq: a.faq.filter((_, j) => j !== i) })}
                />
                <Flow
                  {...props}
                  single
                  value={f.question}
                  onChange={(v) => setFaq(i, { question: v })}
                  max={220}
                  label={t('ed.question')}
                  placeholder={t('wp.questionPh')}
                  className="font-semibold"
                />
                <Flow
                  {...props}
                  value={f.answer}
                  onChange={(v) => setFaq(i, { answer: v })}
                  max={900}
                  format
                  label={t('ed.answer')}
                  placeholder={t('wp.answerPh')}
                  className="text-base leading-relaxed"
                />
              </div>
            ))}
            {!disabled && a.faq.length < MAX_FAQ && (
              <Inserter>
                <AddButton onClick={() => set({ faq: [...a.faq, { question: '', answer: '' }] })}>
                  {t('wp.addFaq')}
                </AddButton>
              </Inserter>
            )}
          </div>
        )}
        <p className="pt-4 text-end text-xs text-slate-400">{t('wp.words', { n: words })}</p>
      </article>

      <details className="card mx-auto max-w-3xl p-5">
        <summary className="cursor-pointer font-display text-base font-semibold">
          {t('wp.settings')}
        </summary>
        <p className="mt-1 text-xs text-muted">{t('wp.settingsHint')}</p>
        <div className="mt-4 space-y-4">
          <Field label={t('ed.featuredIdea')}>
            <TextBox
              value={a.featuredImageBrief}
              onChange={(v) => set({ featuredImageBrief: v })}
              max={500}
              rows={2}
              warnings={warnings}
              disabled={disabled}
            />
          </Field>
          <Field label={t('ed.imageAlt')}>
            <TextBox
              value={a.imageAltText}
              onChange={(v) => set({ imageAltText: v })}
              max={220}
              warnings={warnings}
              disabled={disabled}
            />
          </Field>
          <Field label={t('ed.structured')}>
            <select
              className="input"
              disabled={disabled}
              value={a.structuredData.type}
              onChange={(e) =>
                set({ structuredData: { ...a.structuredData, type: e.target.value } })
              }
            >
              {[
                'Article',
                'NewsArticle',
                'Event',
                'FAQPage',
                'EducationalOccupationalProgram',
                'JobPosting',
                'Other',
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <div className="mt-2">
              <TextBox
                value={a.structuredData.notes ?? ''}
                onChange={(notes) => set({ structuredData: { ...a.structuredData, notes } })}
                max={500}
                rows={2}
                placeholder={t('ed.devNotes')}
                disabled={disabled}
              />
            </div>
          </Field>
          <div>
            <p className="mb-2 text-sm font-semibold">{t('ed.internalLinks')}</p>
            <ListEditor
              items={a.internalLinkSuggestions}
              onChange={(v) => set({ internalLinkSuggestions: v })}
              max={6}
              itemLabel={t('ed.link')}
              addLabel={t('ed.addLinkIdea')}
              disabled={disabled}
              makeNew={() => ({ anchorText: '', suggestedTopic: '' })}
              render={(l, update) => (
                <>
                  <TextBox
                    value={l.anchorText}
                    onChange={(anchorText) => update({ anchorText })}
                    max={100}
                    placeholder={t('ed.linkText')}
                    disabled={disabled}
                  />
                  <TextBox
                    value={l.suggestedTopic}
                    onChange={(suggestedTopic) => update({ suggestedTopic })}
                    max={200}
                    placeholder={t('ed.linkTopic')}
                    disabled={disabled}
                  />
                </>
              )}
            />
          </div>
        </div>
      </details>
    </div>
  );
}
