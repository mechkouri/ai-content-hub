import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { dirname, resolve, sep } from 'path';
import { loadEnv } from '../config/env';

/** Object storage abstraction. Local disk for development; an S3/R2 adapter replaces it in production. */
export interface StorageProvider {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export const STORAGE = Symbol('STORAGE');

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor() {
    // Relative paths are anchored at the repo root so every entry point agrees.
    this.root = resolve(__dirname, '../../../..', loadEnv().STORAGE_DIR);
  }

  private pathFor(key: string): string {
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new Error('Invalid storage key');
    return full;
  }

  async put(key: string, data: Buffer) {
    const path = this.pathFor(key);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, data);
  }

  get(key: string) {
    return fs.readFile(this.pathFor(key));
  }

  async delete(key: string) {
    await fs.rm(this.pathFor(key), { force: true });
  }
}
