import { Inject, Injectable, Optional, UnprocessableEntityException } from '@nestjs/common';
import { ChannelProvider, ContentKind } from '@prisma/client';
import { randomUUID } from 'crypto';
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
import { PostPayload } from './publishing-rules';
import { toJpeg } from './image-convert';
import { PUBLIC_MEDIA, PublicMediaStore } from './public-media';
import {
  FetchFailedError,
  HTTP_CLIENT,
  HttpClient,
  HttpOptions,
  HttpResponse,
  UnsafeUrlError,
} from './safe-request';

const GRAPH = 'https://graph.facebook.com/v21.0';

const inputSchema = z.object({
  igUserId: z
    .string()
    .trim()
    .regex(/^\d{5,25}$/, 'The Instagram account ID is a number, for example 17841400000000000'),
  accessToken: z.string().trim().min(20).max(1000),
});

/** Graph API error codes that mean "slow down", where trying again later is safe. */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

/** Instagram accepts JPEG pictures only, and at most 10 in one post. */
export const IG_MAX_IMAGES = 10;

/** How long to wait for Instagram to download and process a picture before giving up for now. */
export const IG_TIMING = Symbol('IG_TIMING');
/** Turns any picture into a JPEG. Tests replace it; production uses sharp. */
export type JpegConverter = (data: Buffer) => Promise<Buffer>;
export const IG_CONVERT = Symbol('IG_CONVERT');
export interface InstagramTiming {
  intervalMs: number;
  attempts: number;
}
const DEFAULT_TIMING: InstagramTiming = { intervalMs: 3000, attempts: 20 };

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });
const clean = (s: unknown) =>
  String(s ?? '')
    .replace(/<[^>]*>/g, '')
    .slice(0, 300);

const graphError = (r: HttpResponse) => {
  const e = r.json?.error;
  return {
    code: typeof e?.code === 'number' ? (e.code as number) : undefined,
    message: clean(e?.message),
  };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Publishes photo and carousel posts to an Instagram business or creator account through the Graph API. */
@Injectable()
export class InstagramPublisher implements Publisher {
  readonly provider = ChannelProvider.INSTAGRAM;
  private readonly timing: InstagramTiming;
  private readonly convert: JpegConverter;

  constructor(
    @Inject(HTTP_CLIENT) private readonly http: HttpClient,
    @Inject(PUBLIC_MEDIA) private readonly store: PublicMediaStore,
    @Optional() @Inject(IG_TIMING) timing?: InstagramTiming,
    @Optional() @Inject(IG_CONVERT) convert?: JpegConverter,
  ) {
    this.timing = timing ?? DEFAULT_TIMING;
    this.convert = convert ?? toJpeg;
  }

  supports(kind: ContentKind) {
    return kind === ContentKind.INSTAGRAM;
  }

  /** Without public picture storage no Instagram post can be made, so the channel is not offered. */
  ready() {
    return this.store.configured;
  }

  // ---------- connecting ----------

  reconnectInput(config: Record<string, unknown>, details: Record<string, unknown>) {
    return { igUserId: config.igUserId, accessToken: details.accessToken };
  }

  identity(config: Record<string, unknown>) {
    return typeof config.igUserId === 'string' ? config.igUserId : undefined;
  }

  /** Checks that the token can act for that Instagram account before anything is saved. */
  async prepare(input: Record<string, unknown>): Promise<PreparedChannel> {
    const v = parseBody(inputSchema, input);
    let res: HttpResponse;
    try {
      res = await this.http(`${GRAPH}/${v.igUserId}?fields=id,username`, {
        headers: authHeader(v.accessToken),
      });
    } catch (e) {
      if (e instanceof UnsafeUrlError)
        throw new UnprocessableEntityException('Instagram cannot be reached from here.');
      const why = e instanceof FetchFailedError ? e.message : 'Instagram could not be reached.';
      throw new UnprocessableEntityException(`Could not connect to Instagram. ${why}`);
    }
    if (res.status !== 200 || !res.json?.id) {
      const { code, message } = graphError(res);
      throw new UnprocessableEntityException(
        code === 190 || res.status === 401
          ? 'Instagram did not accept that access token. It may be wrong, expired or revoked. Create a new access token.'
          : code === 100 || res.status === 400
            ? 'This token cannot see that Instagram account. Check the account ID, and that the account is a business or creator account linked to your Facebook Page.'
            : `Instagram refused the connection${message ? `: ${message}` : ` (${res.status})`}.`,
      );
    }
    if (String(res.json.id) !== v.igUserId) {
      throw new UnprocessableEntityException(
        'This access token does not belong to that Instagram account.',
      );
    }
    return {
      config: { igUserId: v.igUserId, username: String(res.json.username ?? '') },
      secret: { accessToken: v.accessToken },
    };
  }

  // ---------- publishing ----------

  async publish(
    channel: PublishChannel,
    payload: PostPayload,
    media: PublishMedia[] = [],
  ): Promise<PublishResult> {
    const cfg = channel.config as { igUserId?: string } | null;
    const token = channel.secret?.accessToken;
    if (!cfg?.igUserId || !token) {
      throw new ChannelAuthError('This channel has no saved access token. Reconnect it.');
    }
    if (!this.store.configured) {
      throw new PermanentPublishError(
        'Instagram needs public picture storage on the server (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).',
      );
    }
    if (media.length === 0) {
      throw new PermanentPublishError('Instagram posts need at least one picture.');
    }
    if (media.length > IG_MAX_IMAGES) {
      throw new PermanentPublishError(`Instagram allows at most ${IG_MAX_IMAGES} pictures.`);
    }
    // Instagram takes JPEG only: other formats are converted here, before anything goes online.
    const pictures: PublishMedia[] = [];
    for (const m of media) {
      if (m.mimeType === 'image/jpeg') {
        pictures.push(m);
        continue;
      }
      try {
        pictures.push({ ...m, mimeType: 'image/jpeg', data: await this.convert(m.data) });
      } catch {
        throw new PermanentPublishError(
          `A picture (${m.filename}) could not be converted to JPEG. Replace it with another picture.`,
        );
      }
    }

    const ig = `${GRAPH}/${cfg.igUserId}`;
    const headers = authHeader(token);
    const uploaded: string[] = [];
    try {
      // Pictures go online only for the minutes Instagram needs to fetch them.
      const urls: string[] = [];
      for (const m of pictures) {
        const key = `instagram/${randomUUID()}.jpg`;
        try {
          urls.push(await this.store.upload(key, m.data, m.mimeType));
          uploaded.push(key);
        } catch (e) {
          throw new Error(e instanceof Error ? e.message : 'Public picture storage failed');
        }
      }

      let creation: string;
      if (pictures.length === 1) {
        creation = await this.createContainer(ig, headers, {
          image_url: urls[0],
          caption: payload.text,
          ...(pictures[0].altText ? { alt_text: pictures[0].altText } : {}),
        });
      } else {
        const children: string[] = [];
        for (let i = 0; i < pictures.length; i++) {
          children.push(
            await this.createContainer(ig, headers, {
              image_url: urls[i],
              is_carousel_item: true,
              ...(pictures[i].altText ? { alt_text: pictures[i].altText } : {}),
            }),
          );
        }
        creation = await this.createContainer(ig, headers, {
          media_type: 'CAROUSEL',
          children: children.join(','),
          caption: payload.text,
        });
      }

      // Publishing is the one step that must not be repeated blindly: if it may have gone through, say so.
      const done = await this.send(
        `${ig}/media_publish`,
        { method: 'POST', headers, body: { creation_id: creation } },
        false,
      );
      const mediaId = String(done.json.id);
      return { externalId: mediaId, url: await this.permalink(mediaId, headers) };
    } finally {
      await Promise.all(uploaded.map((k) => this.store.remove(k)));
    }
  }

  /** Creates a media container and waits until Instagram has downloaded and processed the picture. */
  private async createContainer(
    ig: string,
    headers: Record<string, string>,
    body: Record<string, unknown>,
  ): Promise<string> {
    const res = await this.send(`${ig}/media`, { method: 'POST', headers, body }, true);
    const id = String(res.json.id);
    await this.waitUntilReady(id, headers);
    return id;
  }

  private async waitUntilReady(containerId: string, headers: Record<string, string>) {
    for (let i = 0; i < this.timing.attempts; i++) {
      const res = await this.send(
        `${GRAPH}/${containerId}?fields=status_code,status`,
        { headers },
        true,
        true,
      );
      const code = String(res.json.status_code ?? '');
      if (code === 'FINISHED') return;
      if (code === 'ERROR' || code === 'EXPIRED') {
        const detail = clean(res.json.status);
        throw new PermanentPublishError(
          `Instagram could not process a picture${detail ? ` (${detail})` : ''}. Use a JPEG between 320 and 1440 pixels wide, with a ratio between 4:5 and 1.91:1.`,
        );
      }
      await sleep(this.timing.intervalMs);
    }
    throw new Error('Instagram is still processing the pictures. It will be retried.');
  }

  private async permalink(mediaId: string, headers: Record<string, string>) {
    try {
      const res = await this.http(`${GRAPH}/${mediaId}?fields=permalink`, { headers });
      return typeof res.json?.permalink === 'string' ? (res.json.permalink as string) : null;
    } catch {
      return null; // the post is live; a missing link is not worth failing for
    }
  }

  /**
   * One request. Rate limits are always retryable. Any other uncertain failure of the request that
   * actually publishes is NOT retried: it may have gone through, and posting twice is worse than asking.
   */
  private async send(
    url: string,
    opts: HttpOptions,
    safeToRetry: boolean,
    expectStatus = false,
  ): Promise<HttpResponse> {
    let res: HttpResponse;
    try {
      res = await this.http(url, opts);
    } catch (e) {
      if (e instanceof UnsafeUrlError)
        throw new PermanentPublishError('Instagram cannot be reached from here.');
      const why = e instanceof FetchFailedError ? e.message : 'The connection to Instagram failed.';
      if (safeToRetry) throw new Error(why);
      throw new PermanentPublishError(
        `${why} Instagram may have published the post: check your account, then use "Try again" if it is missing.`,
      );
    }
    if (
      res.status >= 200 &&
      res.status < 300 &&
      res.json &&
      !res.json.error &&
      (res.json.id || (expectStatus && res.json.status_code))
    ) {
      return res;
    }
    const { code, message } = graphError(res);
    if (
      res.status === 401 ||
      code === 190 ||
      code === 102 ||
      code === 10 ||
      (code !== undefined && code >= 200 && code < 300)
    ) {
      throw new ChannelAuthError(
        `Instagram rejected the saved access token or its permissions${message ? ` (${message})` : ''}. Reconnect the channel with a new access token.`,
      );
    }
    if (res.status === 429 || (code !== undefined && RATE_LIMIT_CODES.has(code))) {
      throw new Error('Instagram is limiting how fast this account can post. It will be retried.');
    }
    if (safeToRetry && res.status >= 500)
      throw new Error(`Instagram is not available right now (${res.status}).`);
    if (res.status >= 400 && res.status < 500) {
      throw new PermanentPublishError(
        `Instagram refused the post${message ? `: ${message}` : ` (${res.status})`}.`,
      );
    }
    throw new PermanentPublishError(
      `Instagram did not confirm the post (${res.status}). Check your account, then use "Try again" if it is missing.`,
    );
  }
}
