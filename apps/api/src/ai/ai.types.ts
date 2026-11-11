export type ProviderErrorKind =
  | 'quota' // provider's free allowance is exhausted
  | 'rate_limit'
  | 'timeout'
  | 'auth'
  | 'invalid'
  | 'unavailable'
  | 'not_configured'
  | 'not_free';

export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly retryable = false,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number;
  supportsJson: boolean;
}

export interface TextRequest {
  system?: string;
  prompt: string;
  model: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}
export interface TextResult {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}
export interface TextProvider {
  readonly id: string;
  isConfigured(): boolean;
  /** Throws ProviderError('not_free') unless the model is verifiably free. Fails closed. */
  assertFree(model: string): Promise<void>;
  listFreeModels(): Promise<ModelInfo[]>;
  generate(req: TextRequest): Promise<TextResult>;
}

export interface ImageRequest {
  prompt: string;
  steps: number;
}
export interface ImageResult {
  data: Buffer;
  mimeType: string;
  model: string;
}
export interface ImageProvider {
  readonly id: string;
  isConfigured(): boolean;
  generate(req: ImageRequest): Promise<ImageResult>;
}

export const TEXT_PROVIDERS = Symbol('TEXT_PROVIDERS');
export const IMAGE_PROVIDERS = Symbol('IMAGE_PROVIDERS');
