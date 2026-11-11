import { Injectable } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { detectImageType } from '../storage/image-type';
import { ImageProvider, ImageRequest, ImageResult, ProviderError } from './ai.types';
import { classifyHttpError, fetchWithTimeout } from './ai.util';

export const FLUX_MODEL = '@cf/black-forest-labs/flux-1-schnell';

/**
 * Cloudflare Workers AI (FLUX.1 schnell). Two ways to reach it:
 *  - a self-hosted Worker (POST {url}/generate with {prompt, steps}, returns an image), or
 *  - the Cloudflare REST API (account id + API token), returning base64 JSON.
 * NOTE: past the free daily allocation a paid Workers plan is billed by Cloudflare itself, so
 * use a free-plan account or keep AI_DAILY_IMAGE_LIMIT low.
 */
@Injectable()
export class CloudflareImageProvider implements ImageProvider {
  readonly id = 'cloudflare';

  isConfigured() {
    const e = loadEnv();
    return Boolean(
      (e.CLOUDFLARE_IMAGE_WORKER_URL && e.CLOUDFLARE_IMAGE_WORKER_TOKEN) ||
      (e.CLOUDFLARE_ACCOUNT_ID && e.CLOUDFLARE_API_TOKEN),
    );
  }

  async generate(req: ImageRequest): Promise<ImageResult> {
    const env = loadEnv();
    const useWorker = Boolean(env.CLOUDFLARE_IMAGE_WORKER_URL && env.CLOUDFLARE_IMAGE_WORKER_TOKEN);
    if (!useWorker && !(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN)) {
      throw new ProviderError('not_configured', 'Cloudflare image generation is not configured');
    }

    const url = useWorker
      ? `${env.CLOUDFLARE_IMAGE_WORKER_URL!.replace(/\/+$/, '')}/generate`
      : `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID!)}/ai/run/${FLUX_MODEL}`;
    const token = useWorker ? env.CLOUDFLARE_IMAGE_WORKER_TOKEN! : env.CLOUDFLARE_API_TOKEN!;

    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: req.prompt, steps: req.steps }),
      },
      env.AI_TIMEOUT_MS,
    );

    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw classifyHttpError(res.status, text, res.headers.get('retry-after'));
    }

    let data: Buffer;
    if (contentType.startsWith('image/')) {
      data = Buffer.from(await res.arrayBuffer());
    } else {
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        errors?: unknown;
        image?: unknown;
        result?: { image?: unknown };
      } | null;
      const b64: unknown = body?.result?.image ?? body?.image;
      if (body?.success === false || typeof b64 !== 'string') {
        throw classifyHttpError(502, JSON.stringify(body?.errors ?? ''));
      }
      data = Buffer.from(b64, 'base64');
    }

    // Never trust the provider's declared type: verify the bytes really are an image.
    const type = detectImageType(data);
    if (!type)
      throw new ProviderError(
        'unavailable',
        'The image provider returned invalid image data',
        true,
      );
    return { data, mimeType: type.mime, model: FLUX_MODEL };
  }
}
