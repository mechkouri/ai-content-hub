import { ContentKind } from '@prisma/client';

/** What will actually be posted for a piece of content, as plain text. Kept with the job as the audit trail. */
export interface PostPayload {
  kind: ContentKind;
  title: string;
  text: string;
  link?: string | null;
}

export interface PostCheck {
  /** Problems that make the post invalid for its network: publishing is refused. */
  errors: string[];
  /** Best-practice advice: the post is allowed, but could perform better. */
  warnings: string[];
}

const hashtagLine = (tags: unknown): string =>
  Array.isArray(tags)
    ? tags
        .map((t) => String(t).trim().replace(/^#+/, ''))
        .filter(Boolean)
        .map((t) => '#' + t.replace(/\s+/g, ''))
        .join(' ')
    : '';

const join = (parts: unknown[]) =>
  parts
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
    .join('\n\n');

/** Builds the final text exactly as a network would receive it (body, call to action, hashtags). */
export function renderPost(kind: ContentKind, title: string, content: any): PostPayload {
  switch (kind) {
    case ContentKind.INSTAGRAM:
      return {
        kind,
        title,
        text: join([content.caption, content.cta, hashtagLine(content.hashtags)]),
      };
    case ContentKind.FACEBOOK:
      return {
        kind,
        title,
        text: join([content.postText, content.cta, hashtagLine(content.hashtags)]),
        link: content.link ?? null,
      };
    case ContentKind.LINKEDIN:
      return {
        kind,
        title,
        text: join([content.postText, content.cta, hashtagLine(content.hashtags)]),
      };
    default: {
      const sections = Array.isArray(content.sections) ? content.sections : [];
      return {
        kind,
        title: content.h1 ?? title,
        text: join([
          content.introduction,
          ...sections.map((s: any) => join([s.heading, s.body])),
          content.conclusion,
        ]),
      };
    }
  }
}

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

/**
 * Network rules and best practices. Hard limits are errors; guidance is a warning.
 * Applied to the final text, so a caption that fits alone but not with its hashtags is caught.
 */
export function checkPost(kind: ContentKind, content: any, payload: PostPayload): PostCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const len = payload.text.length;
  const tags = count(payload.text, /(^|\s)#\S+/g);

  if (!payload.text.trim()) errors.push('There is no text to publish.');

  switch (kind) {
    case ContentKind.INSTAGRAM:
      if (len > 2200)
        errors.push(`Instagram captions are limited to 2200 characters (this is ${len}).`);
      if (tags > 30) errors.push(`Instagram allows at most 30 hashtags (this has ${tags}).`);
      else if (tags > 15)
        warnings.push('More than 15 hashtags can look spammy; 5 to 10 work best.');
      if (!/\n/.test(payload.text.slice(0, 125)) && len > 125) {
        warnings.push(
          'Put the key message in the first line: only about 125 characters show before "more".',
        );
      }
      break;
    case ContentKind.FACEBOOK:
      if (len > 63000) errors.push('This post is too long for Facebook.');
      if (len > 800)
        warnings.push('Shorter Facebook posts (under 500 characters) usually get more engagement.');
      if (tags > 5) warnings.push('Facebook posts work best with at most 2 or 3 hashtags.');
      break;
    case ContentKind.LINKEDIN:
      if (len > 3000)
        errors.push(`LinkedIn posts are limited to 3000 characters (this is ${len}).`);
      if (tags > 5) warnings.push('LinkedIn recommends 3 to 5 hashtags at most.');
      if (len > 1300)
        warnings.push(
          'Only about the first 210 characters show before "see more": lead with the point.',
        );
      break;
    default: {
      if (!content?.slug) errors.push('The article needs a URL slug.');
      if (!content?.h1) errors.push('The article needs a main title (H1).');
      if (String(content?.seoTitle ?? '').length > 60) {
        warnings.push('The SEO title is over 60 characters and may be cut off in search results.');
      }
      if (String(content?.metaDescription ?? '').length > 160) {
        warnings.push(
          'The meta description is over 160 characters and may be cut off in search results.',
        );
      }
      if (!content?.imageAltText) warnings.push('Add alternative text for the featured image.');
    }
  }
  return { errors, warnings };
}
