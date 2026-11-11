'use client';

import { ReactNode } from 'react';
import {
  ArticleContent,
  FacebookContent,
  ImageIdea,
  InstagramContent,
  LinkedinContent,
} from '@/lib/api';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function Avatar({ name }: { name: string }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-brand via-fuchsia-500 to-orange-400 text-sm font-bold text-white">
      {name.trim()[0]?.toUpperCase() ?? 'A'}
    </div>
  );
}

function ImagePlaceholder({ brief, className = '' }: { brief: string; className?: string }) {
  return (
    <div
      className={`flex items-center justify-center bg-slate-100 p-3 text-center text-[11px] italic text-slate-400 ${className}`}
    >
      {brief ? `🖼 ${clip(brief, 110)}` : '🖼 Image'}
    </div>
  );
}

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <p className="border-b border-slate-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      {children}
    </div>
  );
}

/** What the article looks like in Google results. */
export function SerpPreview({ a }: { a: ArticleContent }) {
  return (
    <Frame label="Google preview">
      <div className="p-4" dir="auto">
        <p className="truncate text-xs text-slate-500">yourwebsite.com › {a.slug || 'article'}</p>
        <p className="mt-0.5 text-lg leading-snug text-[#1a0dab]">
          {clip(a.seoTitle, 62) || 'SEO title'}
        </p>
        <p className="mt-0.5 text-sm text-slate-600">
          {clip(a.metaDescription, 165) || 'Meta description'}
        </p>
      </div>
    </Frame>
  );
}

const Hash = ({ tags, className = 'text-[#00376b]' }: { tags: string[]; className?: string }) =>
  tags.length ? (
    <p className={`mt-2 text-sm ${className}`} dir="auto">
      {tags.join(' ')}
    </p>
  ) : null;

export function InstagramPreview({ p, org }: { p: InstagramContent; org: string }) {
  const first = p.caption.split('\n')[0];
  return (
    <Frame label="Instagram preview">
      <div className="p-3">
        <div className="flex items-center gap-2">
          <Avatar name={org} />
          <p className="text-sm font-semibold">{org.toLowerCase().replace(/\s+/g, '')}</p>
        </div>
        <ImagePlaceholder brief={p.imageBrief} className="mt-3 aspect-square w-full rounded-lg" />
        {p.carousel.length > 0 && (
          <div
            className="mt-2 flex items-center justify-center gap-1"
            aria-label={`${p.carousel.length} slides`}
          >
            {p.carousel.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${i === 0 ? 'bg-brand' : 'bg-slate-300'}`}
              />
            ))}
          </div>
        )}
        <p className="mt-2 whitespace-pre-wrap text-sm" dir="auto">
          <span className="font-semibold">{org.toLowerCase().replace(/\s+/g, '')}</span>{' '}
          {p.caption.length > 125 ? `${clip(first, 125)} more` : p.caption}
        </p>
        <Hash tags={p.hashtags} />
      </div>
    </Frame>
  );
}

function ImageGrid({ images }: { images: ImageIdea[] }) {
  if (!images.length) return null;
  const shown = images.slice(0, 4);
  return (
    <div
      className={`mt-3 grid gap-0.5 overflow-hidden rounded-lg ${shown.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}
    >
      {shown.map((img, i) => (
        <ImagePlaceholder
          key={i}
          brief={img.brief}
          className={shown.length === 1 ? 'aspect-video' : 'aspect-square'}
        />
      ))}
      {images.length > 4 && (
        <p className="col-span-2 bg-slate-50 py-1 text-center text-[11px] text-slate-400">
          +{images.length - 4} more images
        </p>
      )}
    </div>
  );
}

export function FacebookPreview({ p, org }: { p: FacebookContent; org: string }) {
  return (
    <Frame label="Facebook preview">
      <div className="p-4">
        <div className="flex items-center gap-2">
          <Avatar name={org} />
          <div>
            <p className="text-sm font-semibold">{org}</p>
            <p className="text-[11px] text-slate-400">Just now · 🌍</p>
          </div>
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm" dir="auto">
          {p.postText}
        </p>
        {p.link && <p className="mt-2 truncate text-sm text-brand">{p.link}</p>}
        <Hash tags={p.hashtags} className="text-brand" />
        <ImageGrid images={p.images} />
        {p.cta && (
          <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold" dir="auto">
            {p.cta}
          </p>
        )}
      </div>
    </Frame>
  );
}

export function LinkedinPreview({ p, org }: { p: LinkedinContent; org: string }) {
  return (
    <Frame label="LinkedIn preview">
      <div className="p-4">
        <div className="flex items-center gap-2">
          <Avatar name={org} />
          <div>
            <p className="text-sm font-semibold">{org}</p>
            <p className="text-[11px] text-slate-400">Company · Just now</p>
          </div>
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm" dir="auto">
          {p.postText}
        </p>
        <Hash tags={p.hashtags} className="text-[#0a66c2]" />
        {p.imageMode !== 'text' && <ImageGrid images={p.images} />}
        {p.cta && (
          <p className="mt-3 text-sm font-semibold text-[#0a66c2]" dir="auto">
            {p.cta}
          </p>
        )}
      </div>
    </Frame>
  );
}
