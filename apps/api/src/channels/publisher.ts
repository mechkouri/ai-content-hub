import { ChannelProvider, ContentKind } from '@prisma/client';
import { PostPayload } from './publishing-rules';

export interface PublishResult {
  externalId: string;
  url?: string | null;
}

/** Thrown for failures that retrying cannot fix (rejected content, revoked access). */
export class PermanentPublishError extends Error {}

/** One network or website. Real providers (WordPress, Meta, LinkedIn) plug in here. */
export interface Publisher {
  readonly provider: ChannelProvider;
  /** Whether this provider can publish this kind of content. */
  supports(kind: ContentKind): boolean;
  publish(
    channel: { id: string; name: string; config: unknown },
    payload: PostPayload,
  ): Promise<PublishResult>;
}

export const PUBLISHERS = Symbol('PUBLISHERS');
