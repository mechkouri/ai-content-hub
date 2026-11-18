import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import sharp from 'sharp';
import { MediaService } from '../brand/media.service';
import { loadEnv } from '../config/env';
import { FetchedBytes, safeFetchImage } from '../sources/safe-fetch';
import { detectImageType } from '../storage/image-type';
import { slugify } from '../studio/content-schemas';

export type StockProvider = 'openverse' | 'pexels';

export interface StockImage {
  id: string;
  provider: StockProvider;
  title: string;
  thumbnail: string;
  imageUrl: string;
  width: number | null;
  height: number | null;
  creator: string;
  license: string;
  sourceUrl: string;
  /** The licence asks for the author to be credited (Creative Commons BY and similar). */
  creditRequired: boolean;
  /** A ready-to-use credit line for the picture caption. */
  credit: string;
  /** The picture's own description, a starting point for the alt text. */
  alt: string;
}

/** Replaces the network in tests. */
export const STOCK_DEPS = Symbol('STOCK_DEPS');

export interface StockDeps {
  fetchFn?: typeof fetch;
  download?: (url: string) => Promise<FetchedBytes>;
  pexelsKey?: string | undefined;
}

const LICENSE_LABEL = (code: string, version?: string) => {
  const c = code.toLowerCase();
  if (c === 'cc0') return 'CC0';
  if (c === 'pdm') return 'Public domain';
  const label = `CC ${code.toUpperCase()}`;
  return version ? `${label} ${version}` : label;
};

/** Short text from an outside service: no markup, bounded. */
const clean = (v: unknown, max = 200) =>
  String(v ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const httpsUrl = (v: unknown): string => {
  try {
    const u = new URL(String(v));
    return u.protocol === 'https:' ? u.toString() : '';
  } catch {
    return '';
  }
};

const MIN_WIDTH = 300;
const MAX_IMPORT_WIDTH = 1600;

/**
 * Free pictures for articles. Openverse needs no account; Pexels is added when a key is set on the server.
 * Both only list pictures that may be used freely; the credit line is prepared so that licences asking for
 * a credit are honoured, and it travels with the picture as its caption.
 */
@Injectable()
export class StockImagesService {
  constructor(
    private readonly media: MediaService,
    @Optional() @Inject(STOCK_DEPS) private readonly deps: StockDeps = {},
  ) {}

  private get fetchFn() {
    return this.deps.fetchFn ?? fetch;
  }
  private get pexelsKey() {
    return this.deps.pexelsKey !== undefined ? this.deps.pexelsKey : loadEnv().PEXELS_API_KEY;
  }

  providers() {
    return [
      { id: 'openverse' as const, name: 'Openverse', available: true, needsKey: false },
      { id: 'pexels' as const, name: 'Pexels', available: !!this.pexelsKey, needsKey: true },
    ];
  }

  private async getJson(url: string, headers: Record<string, string> = {}) {
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'AIContentHub/1.0', ...headers },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ServiceUnavailableException('The picture search is not available right now');
    }
    if (res.status === 429) {
      throw new HttpException('The picture search is busy. Try again in a minute.', 429);
    }
    if (!res.ok)
      throw new ServiceUnavailableException('The picture search is not available right now');
    try {
      return await res.json();
    } catch {
      throw new ServiceUnavailableException('The picture search is not available right now');
    }
  }

  async search(provider: StockProvider, query: string, page = 1): Promise<StockImage[]> {
    const q = query.trim();
    if (q.length < 2 || q.length > 100)
      throw new BadRequestException('Type 2 to 100 characters to search');
    const p = Math.min(50, Math.max(1, Math.floor(page)));
    if (provider === 'pexels') return this.searchPexels(q, p);
    return this.searchOpenverse(q, p);
  }

  private async searchOpenverse(q: string, page: number): Promise<StockImage[]> {
    const url =
      'https://api.openverse.org/v1/images/?' +
      new URLSearchParams({
        q,
        page: String(page),
        page_size: '24',
        license_type: 'commercial', // may be used on a business website
        mature: 'false',
      });
    const body = await this.getJson(url);
    const out: StockImage[] = [];
    for (const r of Array.isArray(body?.results) ? body.results : []) {
      const imageUrl = httpsUrl(r.url);
      const thumbnail = httpsUrl(r.thumbnail) || imageUrl;
      if (!imageUrl || !r.id) continue;
      const license = LICENSE_LABEL(
        clean(r.license, 20),
        clean(r.license_version, 10) || undefined,
      );
      const creator = clean(r.creator, 80);
      const creditRequired = !['cc0', 'pdm'].includes(String(r.license ?? '').toLowerCase());
      out.push({
        id: clean(r.id, 60),
        provider: 'openverse',
        title: clean(r.title, 120),
        thumbnail,
        imageUrl,
        width: Number.isFinite(r.width) ? Number(r.width) : null,
        height: Number.isFinite(r.height) ? Number(r.height) : null,
        creator,
        license,
        sourceUrl: httpsUrl(r.foreign_landing_url),
        creditRequired,
        credit: `Photo: ${creator || 'unknown author'} · ${license}${r.source ? ` · ${clean(r.source, 30)}` : ''}`,
        alt: clean(r.title, 125),
      });
    }
    return out;
  }

  private async searchPexels(q: string, page: number): Promise<StockImage[]> {
    const key = this.pexelsKey;
    if (!key)
      throw new UnprocessableEntityException(
        'Pexels is not set up on the server (missing PEXELS_API_KEY)',
      );
    const url =
      'https://api.pexels.com/v1/search?' +
      new URLSearchParams({ query: q, page: String(page), per_page: '24' });
    const body = await this.getJson(url, { Authorization: key });
    const out: StockImage[] = [];
    for (const r of Array.isArray(body?.photos) ? body.photos : []) {
      const imageUrl = httpsUrl(r?.src?.large2x || r?.src?.large || r?.src?.original);
      const thumbnail = httpsUrl(r?.src?.medium || r?.src?.small) || imageUrl;
      if (!imageUrl || !r.id) continue;
      const creator = clean(r.photographer, 80);
      out.push({
        id: String(r.id),
        provider: 'pexels',
        title: clean(r.alt, 120),
        thumbnail,
        imageUrl,
        width: Number.isFinite(r.width) ? Number(r.width) : null,
        height: Number.isFinite(r.height) ? Number(r.height) : null,
        creator,
        license: 'Pexels licence',
        sourceUrl: httpsUrl(r.url),
        creditRequired: false, // free to use without a credit; given anyway as good practice
        credit: `Photo: ${creator || 'Pexels'} · Pexels`,
        alt: clean(r.alt, 125),
      });
    }
    return out;
  }

  /**
   * Copies a picture into the organization's media library, ready for a website: the real file type is checked,
   * it is turned upright, scaled down to 1600 pixels wide, converted to WebP (smaller, faster pages), stripped of
   * hidden camera and location data, and named after what it shows.
   */
  async import(orgId: string, userId: string, input: { imageUrl: string; title: string }) {
    const url = httpsUrl(input.imageUrl);
    if (!url) throw new BadRequestException('Only https picture addresses can be imported');
    const download = this.deps.download ?? ((u: string) => safeFetchImage(u));
    const got = await download(url);
    const raw = Buffer.from(got.bytes);
    if (!detectImageType(raw)) {
      throw new UnprocessableEntityException(
        'That address is not a PNG, JPEG, WebP or GIF picture',
      );
    }
    let out: { data: Buffer; width: number; height: number };
    try {
      const r = await sharp(raw, { failOn: 'error', limitInputPixels: 80_000_000 })
        .rotate()
        .resize({ width: MAX_IMPORT_WIDTH, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      out = { data: r.data, width: r.info.width, height: r.info.height };
    } catch {
      throw new UnprocessableEntityException('That picture could not be read');
    }
    if (out.width < MIN_WIDTH) {
      throw new UnprocessableEntityException(
        `That picture is too small (under ${MIN_WIDTH} pixels wide)`,
      );
    }
    const name = slugify(clean(input.title, 80)) || 'picture';
    const asset = await this.media.addProcessed(orgId, userId, {
      buffer: out.data,
      filename: `${name}.webp`,
      mimeType: 'image/webp',
    });
    return { asset, width: out.width, height: out.height };
  }
}
