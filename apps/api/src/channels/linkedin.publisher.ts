import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ChannelProvider, ContentKind } from '@prisma/client';
import { z } from 'zod';
import { parseBody } from '../common/parse';
import { loadEnv } from '../config/env';
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
  FetchFailedError,
  HTTP_CLIENT,
  HttpClient,
  HttpOptions,
  HttpResponse,
  UnsafeUrlError,
} from './safe-request';

const API = 'https://api.linkedin.com';

const inputSchema = z.object({
  accessToken: z.string().trim().min(20).max(2000),
});

/**
 * LinkedIn reads post text in its own "little text format". These characters are reserved and must be
 * escaped with a backslash or the text is cut off or mangled. Hashtags are written as a template.
 */
const RESERVED = /[|{}@[\]()<>#\\*_~]/g;
const escapeLittle = (s: string) => s.replace(RESERVED, (c) => '\\' + c);

export function toLittleText(text: string): string {
  let out = '';
  let last = 0;
  const tag = /(^|\s)#([\p{L}\p{N}_]+)/gu;
  for (let m = tag.exec(text); m; m = tag.exec(text)) {
    out += escapeLittle(text.slice(last, m.index)) + m[1] + `{hashtag|\\#|${escapeLittle(m[2])}}`;
    last = m.index + m[0].length;
  }
  return out + escapeLittle(text.slice(last));
}

const headersFor = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'LinkedIn-Version': loadEnv().LINKEDIN_API_VERSION,
  'X-Restli-Protocol-Version': '2.0.0',
});

const clean = (s: unknown) =>
  String(s ?? '')
    .replace(/<[^>]*>/g, '')
    .slice(0, 300);

/** Publishes text and picture posts to a LinkedIn member profile through the Posts API. */
@Injectable()
export class LinkedInPublisher implements Publisher {
  readonly provider = ChannelProvider.LINKEDIN;

  constructor(@Inject(HTTP_CLIENT) private readonly http: HttpClient) {}

  supports(kind: ContentKind) {
    return kind === ContentKind.LINKEDIN;
  }

  // ---------- connecting ----------

  /** Reads the profile the token belongs to. The post author is that person. */
  async prepare(input: Record<string, unknown>): Promise<PreparedChannel> {
    const v = parseBody(inputSchema, input);
    let res: HttpResponse;
    try {
      res = await this.http(`${API}/v2/userinfo`, {
        headers: { Authorization: `Bearer ${v.accessToken}` },
      });
    } catch (e) {
      if (e instanceof UnsafeUrlError)
        throw new UnprocessableEntityException('LinkedIn cannot be reached from here.');
      const why = e instanceof FetchFailedError ? e.message : 'LinkedIn could not be reached.';
      throw new UnprocessableEntityException(`Could not connect to LinkedIn. ${why}`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new UnprocessableEntityException(
        'LinkedIn did not accept that access token. It may be wrong or expired (tokens last 60 days), or it was created without the "openid", "profile" and "w_member_social" permissions.',
      );
    }
    if (res.status !== 200 || typeof res.json?.sub !== 'string' || !res.json.sub) {
      throw new UnprocessableEntityException(`LinkedIn answered with an error (${res.status}).`);
    }
    return {
      config: {
        authorUrn: `urn:li:person:${res.json.sub}`,
        memberName: String(res.json.name ?? ''),
      },
      secret: { accessToken: v.accessToken },
    };
  }

  // ---------- publishing ----------

  async publish(
    channel: PublishChannel,
    payload: PostPayload,
    media: PublishMedia[] = [],
  ): Promise<PublishResult> {
    const cfg = channel.config as { authorUrn?: string } | null;
    const token = channel.secret?.accessToken;
    if (!cfg?.authorUrn || !token) {
      throw new ChannelAuthError('This channel has no saved access token. Reconnect it.');
    }
    const headers = headersFor(token);

    // Pictures are uploaded first. A failure here is safe to retry: nothing is public yet.
    const imageUrns: string[] = [];
    for (const m of media) imageUrns.push(await this.uploadImage(cfg.authorUrn, headers, m));

    const content =
      imageUrns.length === 1
        ? { media: { id: imageUrns[0] } }
        : imageUrns.length > 1
          ? { multiImage: { images: imageUrns.map((id) => ({ id })) } }
          : undefined;

    const res = await this.send(`${API}/rest/posts`, {
      method: 'POST',
      headers,
      body: {
        author: cfg.authorUrn,
        commentary: toLittleText(payload.text),
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        ...(content ? { content } : {}),
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      },
    });
    const urn = res.headers?.['x-restli-id'];
    if (!urn) {
      throw new PermanentPublishError(
        'LinkedIn did not confirm the post. Check your profile, then use "Try again" if it is missing.',
      );
    }
    return {
      externalId: urn,
      url: `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}/`,
    };
  }

  private async uploadImage(
    author: string,
    headers: Record<string, string>,
    m: PublishMedia,
  ): Promise<string> {
    const init = await this.send(
      `${API}/rest/images?action=initializeUpload`,
      { method: 'POST', headers, body: { initializeUploadRequest: { owner: author } } },
      true,
    );
    const value = init.json?.value;
    if (!value?.uploadUrl || !value?.image)
      throw new Error('LinkedIn did not return an upload address.');
    await this.send(
      String(value.uploadUrl),
      {
        method: 'PUT',
        headers: { Authorization: headers.Authorization },
        raw: { contentType: m.mimeType, data: m.data },
      },
      true,
      true,
    );
    return String(value.image);
  }

  /**
   * One request. Rate limits are always retryable. Any other uncertain failure of the request that
   * actually publishes is NOT retried: it may have gone through, and posting twice is worse than asking.
   */
  private async send(
    url: string,
    opts: HttpOptions,
    safeToRetry = false,
    emptyOk = false,
  ): Promise<HttpResponse> {
    let res: HttpResponse;
    try {
      res = await this.http(url, opts);
    } catch (e) {
      if (e instanceof UnsafeUrlError)
        throw new PermanentPublishError('LinkedIn cannot be reached from here.');
      const why = e instanceof FetchFailedError ? e.message : 'The connection to LinkedIn failed.';
      if (safeToRetry) throw new Error(why);
      throw new PermanentPublishError(
        `${why} LinkedIn may have published the post: check your profile, then use "Try again" if it is missing.`,
      );
    }
    if (
      res.status >= 200 &&
      res.status < 300 &&
      (emptyOk || res.json || res.headers?.['x-restli-id'])
    )
      return res;

    const message = clean(res.json?.message);
    if (res.status === 401 || res.status === 403) {
      throw new ChannelAuthError(
        `LinkedIn rejected the saved access token or its permissions${message ? ` (${message})` : ''}. Tokens last 60 days: reconnect the channel with a new one.`,
      );
    }
    if (res.status === 429)
      throw new Error('LinkedIn is limiting how fast you can post. It will be retried.');
    if (res.status === 426) {
      throw new PermanentPublishError(
        'LinkedIn no longer supports the API version this app uses. The server setting LINKEDIN_API_VERSION needs updating.',
      );
    }
    if (safeToRetry && res.status >= 500)
      throw new Error(`LinkedIn is not available right now (${res.status}).`);
    if (res.status >= 400 && res.status < 500) {
      throw new PermanentPublishError(
        `LinkedIn refused the post${message ? `: ${message}` : ` (${res.status})`}.`,
      );
    }
    throw new PermanentPublishError(
      `LinkedIn did not confirm the post (${res.status}). Check your profile, then use "Try again" if it is missing.`,
    );
  }
}
