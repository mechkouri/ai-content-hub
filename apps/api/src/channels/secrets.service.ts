import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { loadEnv } from '../config/env';

const VERSION = 'v1';

/**
 * Encrypts channel logins before they are stored (AES-256-GCM, a fresh random IV each time).
 * The key lives only in the server environment, so a copy of the database alone reveals nothing.
 */
@Injectable()
export class SecretsService {
  private key(): Buffer {
    const raw = loadEnv().ENCRYPTION_KEY;
    if (!raw) {
      throw new UnprocessableEntityException(
        'Saving channel logins is not set up on the server (missing ENCRYPTION_KEY).',
      );
    }
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new UnprocessableEntityException('The server ENCRYPTION_KEY must be 32 bytes, base64.');
    }
    return key;
  }

  get configured(): boolean {
    try {
      this.key();
      return true;
    } catch {
      return false;
    }
  }

  encrypt(value: Record<string, string>): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return [
      VERSION,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      data.toString('base64'),
    ].join(':');
  }

  /** Throws if the text was altered or was encrypted with a different key. */
  decrypt(stored: string): Record<string, string> {
    const [version, iv, tag, data] = stored.split(':');
    if (version !== VERSION || !iv || !tag || !data) throw new Error('Unreadable stored login');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    const text = Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]);
    return JSON.parse(text.toString('utf8'));
  }
}
