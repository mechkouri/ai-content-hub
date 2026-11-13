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
import { PostPayload } from './publishing-rules';
import {
  buildMultipart,
  FetchFailedError,
  HTTP_CLIENT,
  HttpClient,
  HttpOptions,
  HttpResponse,
  UnsafeUrlError,
} from './safe-request';

const GRAPH = 'https://graph.facebook.com/v21.0';

const inputSchema = z.object({
  pageId: z
    .string()
    .trim()
    .regex(/^\d{5,25}$/, 'The Page ID is a number, for example 1234567890'),
  accessToken: z.string().trim().min(20).max(1000),
});

/** Graph API error codes that mean "slow down", where trying again later is safe. */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

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

/** Publishes posts, with or without pictures, to a Facebook Page through the Graph API. */
@Injectable()
export class FacebookPublisher implements Publisher {
  readonly provider = ChannelProvider.FACEBOOK;

  constructor(@Inject(HTTP_CLIENT) private readonly http: HttpClient) {}

  supports(kind: ContentKind) {
    return kind === ContentKind.FACEBOOK;
  }

  // ---------- connecting ----------

  reconnectInput(config: Record<string, unknown>, details: Record<string, unknown>) {
    return { pageId: config.pageId, accessToken: details.accessToken };
  }

  identity(config: Record<string, unknown>) {
    return typeof config.pageId === 'string' ? config.pageId : undefined;
  }

  /** Checks that the token really belongs to that Page before anything is saved. */
  async prepare(input: Record<string, unknown>): Promise<PreparedChannel> {
    const v = parseBody(inputSchema, input);
    let res: HttpResponse;
    try {
      res = await this.http(`${GRAPH}/me?fields=id,name`, { headers: authHeader(v.accessToken) });
    } catch (e) {
      if (e instanceof UnsafeUrlError)
        throw new UnprocessableEntityException('Facebook cannot be reached from here.');
      const why = e instanceof FetchFailedError ? e.message : 'Facebook could not be reached.';
      throw new UnprocessableEntityException(`Could not connect to Facebook. ${why}`);
    }
    if (res.status !== 200 || !res.json?.id) {
      const { code, message } = graphError(res);
      throw new UnprocessableEntityException(
        code === 190 || res.status === 401
          ? 'Facebook did not accept that access token. It may be wrong, expired or revoked. Create a new Page access token.'
          : `Facebook refused the connection${message ? `: ${message}` : ` (${res.status})`}.`,
      );
    }
    if (String(res.json.id) !== v.pageId) {
      throw new UnprocessableEntityException(
        'This access token does not belong to that Page. Use a Page access token (not a personal user token) generated for this Page.',
      );
    }
    return {
      config: { pageId: v.pageId, pageName: String(res.json.name ?? '') },
      secret: { accessToken: v.accessToken },
    };
  }

  // ---------- publishing ----------

  async publish(
    channel: PublishChannel,
    payload: PostPayload,
    media: PublishMedia[] = [],
  ): Promise<PublishResult> {
    const cfg = channel.config as { pageId?: string } | null;
    const token = channel.secret?.accessToken;
    if (!cfg?.pageId || !token) {
      throw new ChannelAuthError('This channel has no saved access token. Reconnect it.');
    }
    const page = `${GRAPH}/${cfg.pageId}`;
    const headers = authHeader(token);
    // A link cannot ride along with a photo, so it goes into the text.
    const message =
      payload.link && media.length && !payload.text.includes(payload.link)
        ? `${payload.text}\n\n${payload.link}`
        : payload.text;

    let postId: string;
    if (media.length === 0) {
      const res = await this.send(`${page}/feed`, {
        method: 'POST',
        headers,
        body: { message, ...(payload.link ? { link: payload.link } : {}) },
      });
      postId = String(res.json.id);
    } else if (media.length === 1) {
      const res = await this.send(`${page}/photos`, {
        method: 'POST',
        headers,
        raw: buildMultipart(
          { caption: message, published: 'true' },
          { field: 'source', ...media[0] },
        ),
      });
      postId = String(res.json.post_id ?? res.json.id);
    } else {
      // Pictures are uploaded unpublished first. A failure here is safe to retry: nothing is public yet.
      const ids: string[] = [];
      for (const m of media) {
        const up = await this.send(
          `${page}/photos`,
          {
            method: 'POST',
            headers,
            raw: buildMultipart({ published: 'false' }, { field: 'source', ...m }),
          },
          true,
        );
        ids.push(String(up.json.id));
      }
      const res = await this.send(`${page}/feed`, {
        method: 'POST',
        headers,
        body: { message, attached_media: ids.map((id) => ({ media_fbid: id })) },
      });
      postId = String(res.json.id);
    }
    return { externalId: postId, url: `https://www.facebook.com/${postId}` };
  }

  /**
   * One request. Rate limits are always retryable. Any other uncertain failure of the request that
   * actually publishes is NOT retried: it may have gone through, and posting twice is worse than asking.
   */
  private async send(url: string, opts: HttpOptions, safeToRetry = false): Promise<HttpResponse> {
    let res: HttpResponse;
    try {
      res = await this.http(url, opts);
    } catch (e) {
      if (e instanceof UnsafeUrlError)
        throw new PermanentPublishError('Facebook cannot be reached from here.');
      const why = e instanceof FetchFailedError ? e.message : 'The connection to Facebook failed.';
      if (safeToRetry) throw new Error(why);
      throw new PermanentPublishError(
        `${why} Facebook may have published the post: check your Page, then use "Try again" if it is missing.`,
      );
    }
    if (
      res.status >= 200 &&
      res.status < 300 &&
      res.json &&
      !res.json.error &&
      (res.json.id || res.json.post_id)
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
        `Facebook rejected the saved access token or its permissions${message ? ` (${message})` : ''}. Reconnect the channel with a new Page access token.`,
      );
    }
    if (res.status === 429 || (code !== undefined && RATE_LIMIT_CODES.has(code))) {
      throw new Error('Facebook is limiting how fast this Page can post. It will be retried.');
    }
    if (safeToRetry && res.status >= 500)
      throw new Error(`Facebook is not available right now (${res.status}).`);
    if (res.status >= 400 && res.status < 500) {
      throw new PermanentPublishError(
        `Facebook refused the post${message ? `: ${message}` : ` (${res.status})`}.`,
      );
    }
    throw new PermanentPublishError(
      `Facebook did not confirm the post (${res.status}). Check your Page, then use "Try again" if it is missing.`,
    );
  }
}
