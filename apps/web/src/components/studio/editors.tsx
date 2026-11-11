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
  return (
    <ListEditor
      items={images}
      onChange={onChange}
      max={max}
      itemLabel="Image"
      addLabel="Add an image idea"
      disabled={disabled}
      makeNew={() => ({ brief: '', altText: '' })}
      render={(img, update) => (
        <>
          <Field label="What the image should show">
            <TextBox
              value={img.brief}
              onChange={(brief) => update({ brief })}
              max={400}
              rows={2}
              warnings={warnings}
              disabled={disabled}
            />
          </Field>
          <Field label="Alt text" hint="for accessibility and SEO">
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
  const set = <K extends keyof ArticleContent>(k: K, v: ArticleContent[K]) =>
    onChange({ ...a, [k]: v });
  return (
    <>
      <Block title="Search appearance" hint="How the article appears in Google results.">
        <Field label="SEO title">
          <TextBox
            value={a.seoTitle}
            onChange={(v) => set('seoTitle', v)}
            max={90}
            ideal={[30, 60]}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label="Meta description">
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
        <Field label="URL slug" hint="lowercase letters, numbers and hyphens only">
          <TextBox value={a.slug} onChange={(v) => set('slug', v)} max={120} disabled={disabled} />
        </Field>
      </Block>

      <Block title="Article">
        <Field label="Main heading (H1)">
          <TextBox
            value={a.h1}
            onChange={(v) => set('h1', v)}
            max={160}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label="Excerpt">
          <TextBox
            value={a.excerpt}
            onChange={(v) => set('excerpt', v)}
            max={400}
            rows={2}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label="Introduction">
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
          <p className="mb-2 text-sm font-semibold">Sections</p>
          <ListEditor<ArticleContent['sections'][number]>
            items={a.sections}
            onChange={(v) => set('sections', v)}
            max={10}
            itemLabel="Section"
            addLabel="Add a section"
            disabled={disabled}
            makeNew={() => ({ heading: '', body: '' })}
            render={(s, update) => (
              <>
                <Field label="Heading (H2)">
                  <TextBox
                    value={s.heading}
                    onChange={(heading) => update({ heading })}
                    max={160}
                    warnings={warnings}
                    disabled={disabled}
                  />
                </Field>
                <Field label="Text">
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
                  <p className="mb-2 text-xs font-semibold text-muted">Sub-sections (H3)</p>
                  <ListEditor
                    items={s.subsections ?? []}
                    onChange={(subsections) => update({ subsections })}
                    max={5}
                    itemLabel="Sub-section"
                    addLabel="Add a sub-section"
                    disabled={disabled}
                    makeNew={() => ({ heading: '', body: '' })}
                    render={(sub, updateSub) => (
                      <>
                        <TextBox
                          value={sub.heading}
                          onChange={(heading) => updateSub({ heading })}
                          max={160}
                          placeholder="Sub-heading"
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
        <Field label="Conclusion">
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

      <Block title="FAQ" hint="Answers must come from the verified facts.">
        <ListEditor
          items={a.faq}
          onChange={(v) => set('faq', v)}
          max={8}
          itemLabel="Question"
          addLabel="Add a question"
          disabled={disabled}
          makeNew={() => ({ question: '', answer: '' })}
          render={(f, update) => (
            <>
              <TextBox
                value={f.question}
                onChange={(question) => update({ question })}
                max={220}
                placeholder="Question"
                warnings={warnings}
                disabled={disabled}
              />
              <TextBox
                value={f.answer}
                onChange={(answer) => update({ answer })}
                max={900}
                rows={3}
                placeholder="Answer"
                warnings={warnings}
                disabled={disabled}
              />
            </>
          )}
        />
      </Block>

      <Block title="Links, image and markup" hint="Suggestions for your website team.">
        <div>
          <p className="mb-2 text-sm font-semibold">Internal link suggestions</p>
          <ListEditor
            items={a.internalLinkSuggestions}
            onChange={(v) => set('internalLinkSuggestions', v)}
            max={6}
            itemLabel="Link"
            addLabel="Add a link idea"
            disabled={disabled}
            makeNew={() => ({ anchorText: '', suggestedTopic: '' })}
            render={(l, update) => (
              <>
                <TextBox
                  value={l.anchorText}
                  onChange={(anchorText) => update({ anchorText })}
                  max={100}
                  placeholder="Link text"
                  disabled={disabled}
                />
                <TextBox
                  value={l.suggestedTopic}
                  onChange={(suggestedTopic) => update({ suggestedTopic })}
                  max={200}
                  placeholder="Page or topic to link to"
                  disabled={disabled}
                />
              </>
            )}
          />
        </div>
        <Field label="Featured image idea">
          <TextBox
            value={a.featuredImageBrief}
            onChange={(v) => set('featuredImageBrief', v)}
            max={500}
            rows={2}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label="Image alt text">
          <TextBox
            value={a.imageAltText}
            onChange={(v) => set('imageAltText', v)}
            max={220}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label="Structured data (schema.org)">
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
              placeholder="Notes for the developer"
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
  const set = <K extends keyof InstagramContent>(k: K, v: InstagramContent[K]) =>
    onChange({ ...p, [k]: v });
  return (
    <>
      <Block title="Caption">
        <Field label="Caption" hint="the first line is the hook">
          <TextBox
            value={p.caption}
            onChange={(v) => set('caption', v)}
            max={2200}
            rows={8}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label="Call to action">
          <TextBox
            value={p.cta}
            onChange={(v) => set('cta', v)}
            max={180}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label="Hashtags">
          <HashtagEditor
            tags={p.hashtags}
            onChange={(v) => set('hashtags', v)}
            max={15}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
      </Block>
      <Block title="Carousel slides" hint="Optional. Up to 10 slides, short and punchy.">
        <ListEditor
          items={p.carousel}
          onChange={(v) => set('carousel', v)}
          max={10}
          itemLabel="Slide"
          addLabel="Add a slide"
          disabled={disabled}
          makeNew={() => ({ headline: '', body: '' })}
          render={(s, update) => (
            <>
              <TextBox
                value={s.headline}
                onChange={(headline) => update({ headline })}
                max={90}
                placeholder="Headline"
                warnings={warnings}
                disabled={disabled}
              />
              <TextBox
                value={s.body}
                onChange={(body) => update({ body })}
                max={260}
                rows={2}
                placeholder="Slide text"
                warnings={warnings}
                disabled={disabled}
              />
            </>
          )}
        />
      </Block>
      <Block title="Image">
        <Field label="Cover image idea">
          <TextBox
            value={p.imageBrief}
            onChange={(v) => set('imageBrief', v)}
            max={500}
            rows={2}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label="Alt text">
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
  const set = <K extends keyof FacebookContent>(k: K, v: FacebookContent[K]) =>
    onChange({ ...p, [k]: v });
  return (
    <>
      <Block title="Post">
        <Field label="Post text">
          <TextBox
            value={p.postText}
            onChange={(v) => set('postText', v)}
            max={2500}
            rows={7}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label="Call to action">
          <TextBox
            value={p.cta}
            onChange={(v) => set('cta', v)}
            max={180}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label="Link" hint="only an official link from the verified facts">
          <TextBox
            value={p.link ?? ''}
            onChange={(v) => set('link', v.trim() ? v : null)}
            max={500}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label="Hashtags">
          <HashtagEditor
            tags={p.hashtags}
            onChange={(v) => set('hashtags', v)}
            max={5}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
      </Block>
      <Block title="Images" hint="Add several for a multi-image post.">
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

const MODES: { id: LinkedinContent['imageMode']; label: string }[] = [
  { id: 'text', label: 'Text only' },
  { id: 'image', label: 'One image' },
  { id: 'multi_image', label: 'Several images' },
];

export function LinkedinEditor({
  value: p,
  onChange,
  warnings,
  disabled,
}: EditorProps<LinkedinContent>) {
  const set = <K extends keyof LinkedinContent>(k: K, v: LinkedinContent[K]) =>
    onChange({ ...p, [k]: v });
  const maxImages = p.imageMode === 'text' ? 0 : p.imageMode === 'image' ? 1 : 9;
  return (
    <>
      <Block title="Post">
        <Field label="Post text">
          <TextBox
            value={p.postText}
            onChange={(v) => set('postText', v)}
            max={3000}
            rows={9}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label="Call to action">
          <TextBox
            value={p.cta}
            onChange={(v) => set('cta', v)}
            max={180}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
        <Field label="Hashtags">
          <HashtagEditor
            tags={p.hashtags}
            onChange={(v) => set('hashtags', v)}
            max={5}
            warnings={warnings}
            disabled={disabled}
          />
        </Field>
      </Block>
      <Block title="Format and images">
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
              {m.label}
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
