import { loadEnv } from '../config/env';

/**
 * A place where a picture is reachable from the public internet for a short time.
 * Instagram downloads pictures from a web address; it cannot receive an upload.
 */
export interface PublicMediaStore {
  /** Whether the server has what it needs (a Supabase project and its service key). */
  readonly configured: boolean;
  /** Stores the picture and returns the public address it can be downloaded from. */
  upload(key: string, data: Buffer, mimeType: string): Promise<string>;
  /** Removes it again. Never throws: a leftover file is harmless, a failed post is not. */
  remove(key: string): Promise<void>;
}

export const PUBLIC_MEDIA = Symbol('PUBLIC_MEDIA');

type FetchFn = typeof fetch;

/** Supabase Storage through its REST API. The bucket must be public so Instagram can read the file. */
export class SupabasePublicMedia implements PublicMediaStore {
  private readonly base?: string;
  private readonly key?: string;
  private readonly bucket: string;

  constructor(
    cfg?: { url?: string; serviceKey?: string; bucket?: string },
    private readonly fetchFn: FetchFn = fetch,
  ) {
    const env =
      cfg ??
      (() => {
        const e = loadEnv();
        return {
          url: e.SUPABASE_URL,
          serviceKey: e.SUPABASE_SERVICE_ROLE_KEY,
          bucket: e.PUBLIC_MEDIA_BUCKET,
        };
      })();
    this.base = env.url?.replace(/\/+$/, '');
    this.key = env.serviceKey;
    this.bucket = env.bucket ?? 'public-media';
  }

  get configured() {
    return !!this.base && !!this.key;
  }

  private path(key: string) {
    // Only keys this server builds reach here, but never let one climb out of the bucket.
    if (!/^[A-Za-z0-9/_.-]+$/.test(key) || key.includes('..'))
      throw new Error('Invalid storage key');
    return `${this.base}/storage/v1/object/${this.bucket}/${key}`;
  }

  async upload(key: string, data: Buffer, mimeType: string): Promise<string> {
    if (!this.configured) throw new Error('Public picture storage is not configured');
    const res = await this.fetchFn(this.path(key), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.key}`,
        apikey: this.key!,
        'Content-Type': mimeType,
        'x-upsert': 'true',
        'Cache-Control': 'max-age=300',
      },
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`Public picture storage refused the upload (${res.status})`);
    return `${this.base}/storage/v1/object/public/${this.bucket}/${key}`;
  }

  async remove(key: string): Promise<void> {
    if (!this.configured) return;
    try {
      await this.fetchFn(this.path(key), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.key}`, apikey: this.key! },
      });
    } catch {
      // best effort
    }
  }
}
