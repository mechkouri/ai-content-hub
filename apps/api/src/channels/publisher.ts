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
}

/** One network or website. Real providers (WordPress, Meta, LinkedIn) plug in here. */
export interface Publisher {
  readonly provider: ChannelProvider;
  /** Whether this provider can publish this kind of content. */
  supports(kind: ContentKind): boolean;
  /** Validates and tests the details entered when connecting. Providers without settings omit it. */
  prepare?(input: Record<string, unknown>): Promise<PreparedChannel>;
  publish(
    channel: PublishChannel,
    payload: PostPayload,
    media: PublishMedia[],
  ): Promise<PublishResult>;
}

export const PUBLISHERS = Symbol('PUBLISHERS');
