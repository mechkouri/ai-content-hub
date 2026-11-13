import sharp from 'sharp';

/**
 * Converts a picture (PNG, WebP, GIF, or already JPEG) into a baseline JPEG, which is the only format
 * Instagram accepts. Transparent areas become white, and an animated picture keeps its first frame.
 * Rotation from the camera's orientation tag is applied, so the picture is not turned sideways.
 */
export async function toJpeg(data: Buffer): Promise<Buffer> {
  return sharp(data, { failOn: 'error', limitInputPixels: 80_000_000 })
    .rotate()
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 90 })
    .toBuffer();
}
