import { ChannelProvider, ContentKind } from '@prisma/client';
import { PostPayload } from './publishing-rules';

export interface PublishResult {
  externalId: string;
  url?: string | null;
}

/** Thrown for failures that retrying cannot fix (rejected content, revoked access). */
export class PermanentPublishError extends Error {}

/** The saved login no longer works. The channel is marked as needing attention so nothing else is sent. */
export class ChannelAuthError extends PermanentPublishError {}

/** What a provider keeps after checking the details a person entered when connecting a channel. */
export interface PreparedChannel {
  /** Non-secret settings, shown in the app. */
  config: Record<string, unknown>;
  /** Logins and tokens. Encrypted before they are stored, never returned by the API. */
  secret?: Record<string, string>;
}

export interface PublishChannel {
  id: string;
  name: string;
  config: unknown;
  /** Decrypted just before publishing. Null for channels without a login. */
  secret: Record<string, string> | null;
}

/** A picture to post, already read from storage. */
export interface PublishMedia {
  filename: string;
  mimeType: string;
  data: Buffer;
  /** Description for people who cannot see the picture. */
  altText?: string;
  /** Pictures inside an article's text: the media library id the text refers to, and the picture's size. */
  assetId?: string;
  width?: number;
  height?: number;
}

/** One network or website. Real providers (WordPress, Meta, LinkedIn) plug in here. */
export interface Publisher {
  readonly provider: ChannelProvider;
  /** Whether this provider can publish this kind of content. */
  supports(kind: ContentKind): boolean;
  /** Whether the server has everything this provider needs. Omitted when nothing besides a login is needed. */
  ready?(): boolean;
  /** Validates and tests the details entered when connecting. Providers without settings omit it. */
  prepare?(input: Record<string, unknown>): Promise<PreparedChannel>;
  /**
   * Reconnecting keeps what identifies the account (site, Page, profile) and only takes a new login.
   * Returns the input for {@link prepare}.
   */
  reconnectInput?(
    config: Record<string, unknown>,
    details: Record<string, unknown>,
  ): Record<string, unknown>;
  /** What identifies the account behind a channel, so a reconnect can never switch to another one. */
  identity?(config: Record<string, unknown>): string | undefined;
  publish(
    channel: PublishChannel,
    payload: PostPayload,
    media: PublishMedia[],
    /** Pictures that sit inside the article text (websites place them in the page; networks ignore them). */
    inline?: PublishMedia[],
  ): Promise<PublishResult>;
}

export const PUBLISHERS = Symbol('PUBLISHERS');
