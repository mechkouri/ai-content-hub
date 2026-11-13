import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ChannelProvider, ContentKind } from '@prisma/client';
import { z } from 'zod';
import { parseBody } from '../common/parse';
import {
  ChannelAuthError,
  PermanentPublishError,
  PreparedChannel,
  Publisher,
  PublishChannel,
  PublishMedia,
  PublishResult,
} from './publisher';
import {
  FetchFailedError,
  HTTP_CLIENT,
  HttpClient,
  HttpResponse,
  UnsafeUrlError,
} from './safe-request';
import { PostPayload } from './publishing-rules';

const inputSchema = z.object({
  siteUrl: z.string().trim().url().max(200),
  username: z.string().trim().min(1).max(100),
  applicationPassword: z.string().min(8).max(200),
  publishAs: z.enum(['publish', 'draft']).default('publish'),
});

interface WpConfig {
  siteUrl: string;
  publishAs: 'publish' | 'draft';
}

/** https://example.com/blog/ -> https://example.com/blog . Query and fragment are dropped. */
export function normalizeSiteUrl(input: string): string {
  const u = new URL(input);
  if (u.protocol !== 'https:') {
    throw new UnprocessableEntityException(
      'Use the https address of your site. The login would travel unprotected over http.',
    );
  }
  return (u.origin + u.pathname).replace(/\/+$/, '');
}

const authHeader = (username: string, password: string) => ({
  Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
});

const wpMessage = (r: HttpResponse) =>
  typeof r.json?.message === 'string'
    ? String(r.json.message)
        .replace(/<[^>]*>/g, '')
        .slice(0, 300)
    : '';

/** Publishes articles to a WordPress site through its REST API, using an application password. */
@Injectable()
export class WordPressPublisher implements Publisher {
  readonly provider = ChannelProvider.WORDPRESS;

  constructor(@Inject(HTTP_CLIENT) private readonly http: HttpClient) {}

  supports(kind: ContentKind) {
    return kind === ContentKind.ARTICLE;
  }

  // ---------- connecting ----------

  reconnectInput(config: Record<string, unknown>, details: Record<string, unknown>) {
    return {
      siteUrl: config.siteUrl,
      publishAs: config.publishAs,
      username: details.username,
      applicationPassword: details.applicationPassword,
    };
  }

  identity(config: Record<string, unknown>) {
    return typeof config.siteUrl === 'string' ? config.siteUrl : undefined;
  }

  /** Checks the site and the login before anything is saved, so a wrong password is caught right away. */
  async prepare(input: Record<string, unknown>): Promise<PreparedChannel> {
    const v = parseBody(inputSchema, input);
    const siteUrl = normalizeSiteUrl(v.siteUrl);

    let res: HttpResponse;
    try {
      res = await this.http(`${siteUrl}/wp-json/wp/v2/users/me?context=edit`, {
        headers: authHeader(v.username, v.applicationPassword),
      });
    } catch (e) {
      if (e instanceof UnsafeUrlError) {
        throw new UnprocessableEntityException('That address cannot be used for a website.');
      }
      const why = e instanceof FetchFailedError ? e.message : 'The site could not be reached.';
      throw new UnprocessableEntityException(`Could not connect to the site. ${why}`);
    }

    if (res.status === 401 || res.status === 403) {
      throw new UnprocessableEntityException(
        'WordPress did not accept that username and application password. Create an application password in your profile (Users, then Profile, then Application Passwords) and use your username, not your email.',
      );
    }
    if (res.status === 404) {
      throw new UnprocessableEntityException(
        'The WordPress REST API was not found at this address. Check the site address, and that permalinks are not blocking /wp-json.',
      );
    }
    if (res.status !== 200 || typeof res.json?.id !== 'number') {
      throw new UnprocessableEntityException(
        res.status === 200
          ? 'This address does not look like a WordPress site.'
          : `WordPress answered with an error (${res.status}).`,
      );
    }
    const caps = res.json.capabilities as Record<string, boolean> | undefined;
    const needed = v.publishAs === 'publish' ? 'publish_posts' : 'edit_posts';
    if (caps && caps[needed] !== true) {
      throw new UnprocessableEntityException(
        v.publishAs === 'publish'
          ? 'This WordPress user is not allowed to publish posts. Use an Editor or Administrator account, or choose "Save as draft".'
          : 'This WordPress user is not allowed to create posts.',
      );
    }
    return {
      config: {
        siteUrl,
        publishAs: v.publishAs,
        wordpressUser: String(res.json.name ?? v.username),
      },
      secret: { username: v.username, applicationPassword: v.applicationPassword },
    };
  }

  // ---------- publishing ----------

  async publish(
    channel: PublishChannel,
    payload: PostPayload,
    media: PublishMedia[] = [],
  ): Promise<PublishResult> {
    const cfg = channel.config as Partial<WpConfig> | null;
    const secret = channel.secret;
    if (!cfg?.siteUrl || !secret?.username || !secret.applicationPassword) {
      throw new ChannelAuthError('This channel has no saved login. Reconnect it.');
    }
    if (!payload.html || !payload.slug) {
      throw new PermanentPublishError('The article has no body or slug to publish.');
    }
    const headers = authHeader(secret.username, secret.applicationPassword);
    const api = `${cfg.siteUrl}/wp-json/wp/v2/posts`;

    // A retry after a lost response must not create a second copy: look for the same post first.
    const found = await this.call(
      `${api}?slug=${encodeURIComponent(payload.slug)}&status=any&context=edit&per_page=5`,
      { headers },
    );
    if (Array.isArray(found.json)) {
      const same = found.json.find(
        (p: any) =>
          p?.slug === payload.slug && (p?.title?.raw ?? p?.title?.rendered) === payload.title,
      );
      if (same?.id) return { externalId: String(same.id), url: same.link ?? null };
    }

    // The first picture becomes the featured image. It is uploaded only now, after the duplicate check,
    // so a retry never re-uploads for a post that already exists. A failure here is safe to retry.
    const featured = media[0]
      ? await this.uploadFeatured(cfg.siteUrl, headers, media[0])
      : undefined;

    const res = await this.call(api, {
      method: 'POST',
      headers,
      body: {
        title: payload.title,
        content: payload.html,
        excerpt: payload.excerpt ?? '',
        slug: payload.slug,
        status: cfg.publishAs === 'draft' ? 'draft' : 'publish',
        ...(featured ? { featured_media: featured } : {}),
      },
    });
    if (!res.json?.id) throw new Error('WordPress did not confirm the post.');
    return { externalId: String(res.json.id), url: res.json.link ?? null };
  }

  /** Adds the picture to the site's media library, with its description, and returns its id. */
  private async uploadFeatured(
    siteUrl: string,
    headers: Record<string, string>,
    m: PublishMedia,
  ): Promise<number> {
    const media = `${siteUrl}/wp-json/wp/v2/media`;
    const filename = m.filename.replace(/[\r\n"\\]/g, '_') || 'image';
    const up = await this.call(media, {
      method: 'POST',
      headers: { ...headers, 'Content-Disposition': `attachment; filename="${filename}"` },
      raw: { contentType: m.mimeType, data: m.data },
    });
    const id = up.json?.id;
    if (typeof id !== 'number') throw new Error('WordPress did not confirm the picture upload.');
    if (m.altText) {
      await this.call(`${media}/${id}`, { method: 'POST', headers, body: { alt_text: m.altText } });
    }
    return id;
  }

  /** One request, with failures sorted into "try again later" and "will never work". */
  private async call(url: string, opts: Parameters<HttpClient>[1]): Promise<HttpResponse> {
    let res: HttpResponse;
    try {
      res = await this.http(url, opts);
    } catch (e) {
      if (e instanceof UnsafeUrlError)
        throw new PermanentPublishError('The site address is not allowed.');
      throw new Error(e instanceof FetchFailedError ? e.message : 'Could not reach the site.');
    }
    if (res.status >= 200 && res.status < 300) return res;
    const detail = wpMessage(res);
    if (res.status === 401 || res.status === 403) {
      throw new ChannelAuthError(
        'WordPress rejected the saved login (it may have been revoked or lacks permission). Reconnect the channel.',
      );
    }
    if (res.status === 429 || res.status >= 500) {
      throw new Error(`WordPress is not available right now (${res.status}).`);
    }
    throw new PermanentPublishError(
      `WordPress refused the post (${res.status})${detail ? `: ${detail}` : '.'}`,
    );
  }
}
