'use client';

import { ReactNode } from 'react';
import {
  ArticleContent,
  ClaimWarning,
  FacebookContent,
  ImageIdea,
  InstagramContent,
  LinkedinContent,
} from '@/lib/api';
import { useT } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';
import { Field, HashtagEditor, ListEditor, TextBox } from './fields';

interface EditorProps<T> {
  value: T;
  onChange: (v: T) => void;
  warnings: ClaimWarning[];
  disabled?: boolean;
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card space-y-4 p-6">
      <div>
        <h2 className="font-display text-base font-semibold">{title}</h2>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function ImageIdeas({
  images,
  onChange,
  max,
  warnings,
  disabled,
}: {
  images: ImageIdea[];
  onChange: (i: ImageIdea[]) => void;
  max: number;
  warnings: ClaimWarning[];
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <ListEditor
      items={images}
      onChange={onChange}
      max={max}
      itemLabel={t('ed.image')}
      addLabel={t('ed.addImageIdea')}
      disabled={disabled}
      makeNew={() => ({ brief: '', altText: '' })}
      render={(img, update) => (
        <>
          <Field label={t('ed.imageShould')}>
            <TextBox
              value={img.brief}
              onChange={(brief) => update({ brief })}
              max={400}
              rows={2}
              warnings={warnings}
              disabled={disabled}
            />
          </Field>
          <Field label={t('ed.altText')} hint={t('ed.altHint')}>
            <TextBox
              value={img.altText}
              onChange={(altText) => update({ altText })}
              max={200}
              warnings={warnings}
              disabled={disabled}
            />
          </Field>
        </>
      )}
    />
  );
}

// ---------------- article ----------------

const STRUCTURED = [
  'Article',
  'NewsArticle',
  'Event',
  'FAQPage',
  'EducationalOccupationalProgram',
  'JobPosting',
  'Other',
];

export function ArticleEditor({
  value: a,
  onChange,
  warnings,
  disabled,
}: EditorProps<ArticleContent>) {
  const t = useT();
  const set = <K extends keyof ArticleContent>(k: K, v: ArticleContent[K]) =>
    onChange({ ...a, [k]: v });
  return (
    <>
      <Block title={t('ed.searchAppearance')} hint={t('ed.searchAppearanceHint')}>
        <Field label={t('ed.seoTitle')}>
          <TextBox
            value={a.seoTitle}
            onChange={(v) => set('seoTitle', v)}
            max={90}
            ideal={[30, 60]}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label={t('ed.metaDesc')}>
          <TextBox
            value={a.metaDescription}
            onChange={(v) => set('metaDescription', v)}
            max={220}
            rows={2}
            ideal={[70, 160]}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label={t('ed.slug')} hint={t('ed.slugHint')}>
          <TextBox value={a.slug} onChange={(v) => set('slug', v)} max={120} disabled={disabled} />
        </Field>
      </Block>

      <Block title={t('ed.article')}>
        <Field label={t('ed.h1')}>
          <TextBox
            value={a.h1}
            onChange={(v) => set('h1', v)}
            max={160}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label={t('ed.excerpt')}>
          <TextBox
            value={a.excerpt}
            onChange={(v) => set('excerpt', v)}
            max={400}
            rows={2}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label={t('ed.intro')}>
          <TextBox
            value={a.introduction}
            onChange={(v) => set('introduction', v)}
            max={2500}
            rows={5}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <div>
          <p className="mb-2 text-sm font-semibold">{t('ed.sections')}</p>
          <ListEditor<ArticleContent['sections'][number]>
            items={a.sections}
            onChange={(v) => set('sections', v)}
            max={10}
            itemLabel={t('ed.section')}
            addLabel={t('ed.addSection')}
            disabled={disabled}
            makeNew={() => ({ heading: '', body: '' })}
            render={(s, update) => (
              <>
                <Field label={t('ed.h2')}>
                  <TextBox
                    value={s.heading}
                    onChange={(heading) => update({ heading })}
                    max={160}
                    warnings={warnings}
                    disabled={disabled}
                  />
                </Field>
                <Field label={t('ed.text')}>
                  <TextBox
                    value={s.body}
                    onChange={(body) => update({ body })}
                    max={4500}
                    rows={6}
                    warnings={warnings}
                    disabled={disabled}
                  />
                </Field>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold text-muted">{t('ed.subsections')}</p>
                  <ListEditor
                    items={s.subsections ?? []}
                    onChange={(subsections) => update({ subsections })}
                    max={5}
                    itemLabel={t('ed.subsection')}
                    addLabel={t('ed.addSubsection')}
                    disabled={disabled}
                    makeNew={() => ({ heading: '', body: '' })}
                    render={(sub, updateSub) => (
                      <>
                        <TextBox
                          value={sub.heading}
                          onChange={(heading) => updateSub({ heading })}
                          max={160}
                          placeholder={t('ed.subheading')}
                          warnings={warnings}
                          disabled={disabled}
                        />
                        <TextBox
                          value={sub.body}
                          onChange={(body) => updateSub({ body })}
                          max={3500}
                          rows={4}
                          warnings={warnings}
                          disabled={disabled}
                        />
                      </>
                    )}
                  />
                </div>
              </>
            )}
          />
        </div>
        <Field label={t('ed.conclusion')}>
          <TextBox
            value={a.conclusion}
            onChange={(v) => set('conclusion', v)}
            max={2500}
            rows={4}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
      </Block>

      <Block title={t('ed.faq')} hint={t('ed.faqHint')}>
        <ListEditor
          items={a.faq}
          onChange={(v) => set('faq', v)}
          max={8}
          itemLabel={t('ed.question')}
          addLabel={t('ed.addQuestion')}
          disabled={disabled}
          makeNew={() => ({ question: '', answer: '' })}
          render={(f, update) => (
            <>
              <TextBox
                value={f.question}
                onChange={(question) => update({ question })}
                max={220}
                placeholder={t('ed.question')}
                warnings={warnings}
                disabled={disabled}
              />
              <TextBox
                value={f.answer}
                onChange={(answer) => update({ answer })}
                max={900}
                rows={3}
                placeholder={t('ed.answer')}
                warnings={warnings}
                disabled={disabled}
              />
            </>
          )}
        />
      </Block>

      <Block title={t('ed.linksBlock')} hint={t('ed.linksHint')}>
        <div>
          <p className="mb-2 text-sm font-semibold">{t('ed.internalLinks')}</p>
          <ListEditor
            items={a.internalLinkSuggestions}
            onChange={(v) => set('internalLinkSuggestions', v)}
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
        <Field label={t('ed.featuredIdea')}>
          <TextBox
            value={a.featuredImageBrief}
            onChange={(v) => set('featuredImageBrief', v)}
            max={500}
            rows={2}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label={t('ed.imageAlt')}>
          <TextBox
            value={a.imageAltText}
            onChange={(v) => set('imageAltText', v)}
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
            onChange={(e) => set('structuredData', { ...a.structuredData, type: e.target.value })}
          >
            {STRUCTURED.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <div className="mt-2">
            <TextBox
              value={a.structuredData.notes ?? ''}
              onChange={(notes) => set('structuredData', { ...a.structuredData, notes })}
              max={500}
              rows={2}
              placeholder={t('ed.devNotes')}
              disabled={disabled}
            />
          </div>
        </Field>
      </Block>
    </>
  );
}

// ---------------- Instagram ----------------

export function InstagramEditor({
  value: p,
  onChange,
  warnings,
  disabled,
}: EditorProps<InstagramContent>) {
  const t = useT();
  const set = <K extends keyof InstagramContent>(k: K, v: InstagramContent[K]) =>
    onChange({ ...p, [k]: v });
  return (
    <>
      <Block title={t('ed.caption')}>
        <Field label={t('ed.caption')} hint={t('ed.captionHint')}>
          <TextBox
            value={p.caption}
            onChange={(v) => set('caption', v)}
            max={2200}
            rows={8}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label={t('ed.cta')}>
          <TextBox
            value={p.cta}
            onChange={(v) => set('cta', v)}
            max={180}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label={t('ed.hashtags')}>
          <HashtagEditor
            tags={p.hashtags}
            onChange={(v) => set('hashtags', v)}
            max={15}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
      </Block>
      <Block title={t('ed.carousel')} hint={t('ed.carouselHint')}>
        <ListEditor
          items={p.carousel}
          onChange={(v) => set('carousel', v)}
          max={10}
          itemLabel={t('ed.slide')}
          addLabel={t('ed.addSlide')}
          disabled={disabled}
          makeNew={() => ({ headline: '', body: '' })}
          render={(s, update) => (
            <>
              <TextBox
                value={s.headline}
                onChange={(headline) => update({ headline })}
                max={90}
                placeholder={t('ed.headline')}
                warnings={warnings}
                disabled={disabled}
              />
              <TextBox
                value={s.body}
                onChange={(body) => update({ body })}
                max={260}
                rows={2}
                placeholder={t('ed.slideText')}
                warnings={warnings}
                disabled={disabled}
              />
            </>
          )}
        />
      </Block>
      <Block title={t('ed.image')}>
        <Field label={t('ed.coverIdea')}>
          <TextBox
            value={p.imageBrief}
            onChange={(v) => set('imageBrief', v)}
            max={500}
            rows={2}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label={t('ed.altText')}>
          <TextBox
            value={p.altText}
            onChange={(v) => set('altText', v)}
            max={220}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
      </Block>
    </>
  );
}

// ---------------- Facebook ----------------

export function FacebookEditor({
  value: p,
  onChange,
  warnings,
  disabled,
}: EditorProps<FacebookContent>) {
  const t = useT();
  const set = <K extends keyof FacebookContent>(k: K, v: FacebookContent[K]) =>
    onChange({ ...p, [k]: v });
  return (
    <>
      <Block title={t('ed.post')}>
        <Field label={t('ed.postText')}>
          <TextBox
            value={p.postText}
            onChange={(v) => set('postText', v)}
            max={2500}
            rows={7}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label={t('ed.cta')}>
          <TextBox
            value={p.cta}
            onChange={(v) => set('cta', v)}
            max={180}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label={t('ed.link')} hint={t('ed.linkHint')}>
          <TextBox
            value={p.link ?? ''}
            onChange={(v) => set('link', v.trim() ? v : null)}
            max={500}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label={t('ed.hashtags')}>
          <HashtagEditor
            tags={p.hashtags}
            onChange={(v) => set('hashtags', v)}
            max={5}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
      </Block>
      <Block title={t('ed.images')} hint={t('ed.imagesHint')}>
        <ImageIdeas
          images={p.images}
          onChange={(v) => set('images', v)}
          max={10}
          warnings={warnings}
          disabled={disabled}
        />
      </Block>
    </>
  );
}

// ---------------- LinkedIn ----------------

const MODES: { id: LinkedinContent['imageMode']; label: MessageKey }[] = [
  { id: 'text', label: 'ed.mode.text' },
  { id: 'image', label: 'ed.mode.image' },
  { id: 'multi_image', label: 'ed.mode.multi_image' },
];

export function LinkedinEditor({
  value: p,
  onChange,
  warnings,
  disabled,
}: EditorProps<LinkedinContent>) {
  const t = useT();
  const set = <K extends keyof LinkedinContent>(k: K, v: LinkedinContent[K]) =>
    onChange({ ...p, [k]: v });
  const maxImages = p.imageMode === 'text' ? 0 : p.imageMode === 'image' ? 1 : 9;
  return (
    <>
      <Block title={t('ed.post')}>
        <Field label={t('ed.postText')}>
          <TextBox
            value={p.postText}
            onChange={(v) => set('postText', v)}
            max={3000}
            rows={9}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label={t('ed.cta')}>
          <TextBox
            value={p.cta}
            onChange={(v) => set('cta', v)}
            max={180}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label={t('ed.hashtags')}>
          <HashtagEditor
            tags={p.hashtags}
            onChange={(v) => set('hashtags', v)}
            max={5}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
      </Block>
      <Block title={t('ed.formatImages')}>
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange({
                  ...p,
                  imageMode: m.id,
                  images: m.id === 'text' ? [] : m.id === 'image' ? p.images.slice(0, 1) : p.images,
                })
              }
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                p.imageMode === m.id
                  ? 'bg-brand text-white'
                  : 'bg-slate-200/70 text-slate-700 hover:bg-slate-300/70'
              }`}
            >
              {t(m.label)}
            </button>
          ))}
        </div>
        {maxImages > 0 && (
          <ImageIdeas
            images={p.images}
            onChange={(v) => set('images', v)}
            max={maxImages}
            warnings={warnings}
            disabled={disabled}
          />
        )}
      </Block>
    </>
  );
}
