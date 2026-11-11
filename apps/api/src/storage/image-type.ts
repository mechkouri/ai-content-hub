export type ImageType = { mime: string; ext: string };

/** Detects the real image type from magic bytes. SVG is deliberately unsupported (script risk). */
export function detectImageType(buf: Buffer): ImageType | null {
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  if (buf.length >= 6 && ['GIF87a', 'GIF89a'].includes(buf.toString('ascii', 0, 6))) {
    return { mime: 'image/gif', ext: 'gif' };
  }
  return null;
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base
    .replace(/[^\w .-]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 100)
    .trim();
  return cleaned || 'file';
}
