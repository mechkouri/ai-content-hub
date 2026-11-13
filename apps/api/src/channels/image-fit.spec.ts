import sharp from 'sharp';
import { fitForInstagram, IG_PICTURE } from './image-convert';

const solid = (w: number, h: number, fmt: 'png' | 'jpeg' | 'webp' = 'png', alpha = 1) =>
  sharp({
    create: { width: w, height: h, channels: 4, background: { r: 255, g: 0, b: 0, alpha } },
  })
    [fmt]()
    .toBuffer();

const info = async (b: Buffer) => {
  const m = await sharp(b).metadata();
  return { format: m.format, w: m.width!, h: m.height!, ratio: m.width! / m.height! };
};
const pixel = async (b: Buffer, x: number, y: number) => {
  const { data, info: i } = await sharp(b).raw().toBuffer({ resolveWithObject: true });
  const o = (y * i.width + x) * i.channels;
  return [data[o], data[o + 1], data[o + 2]];
};
const inRules = (i: { w: number; ratio: number }) => {
  expect(i.w).toBeGreaterThanOrEqual(IG_PICTURE.minWidth);
  expect(i.w).toBeLessThanOrEqual(IG_PICTURE.maxWidth);
  expect(i.ratio).toBeGreaterThanOrEqual(IG_PICTURE.minRatio);
  expect(i.ratio).toBeLessThanOrEqual(IG_PICTURE.maxRatio);
};

describe('fitting a picture for Instagram', () => {
  it('returns a good JPEG exactly as it is, without re-compressing it', async () => {
    const jpg = await solid(1080, 1080, 'jpeg');
    expect(await fitForInstagram(jpg, 'image/jpeg')).toBe(jpg);
  });

  it('converts a PNG that is otherwise fine, keeping its size', async () => {
    const out = await fitForInstagram(await solid(1000, 800), 'image/png');
    expect(await info(out)).toMatchObject({ format: 'jpeg', w: 1000, h: 800 });
  });

  it('pads a too-wide picture with white bars instead of cutting it', async () => {
    const out = await fitForInstagram(await solid(2400, 400), 'image/png');
    const i = await info(out);
    inRules(i);
    expect(i.w).toBe(1440);
    const [r] = await pixel(out, 720, Math.floor(i.h / 2));
    expect(r).toBeGreaterThan(200); // red picture in the middle
    const top = await pixel(out, 720, 2);
    expect(Math.min(...top)).toBeGreaterThan(240); // white bar above it
  });

  it('pads a too-tall picture on the sides, and stays within the maximum width', async () => {
    const out = await fitForInstagram(await solid(400, 2000), 'image/png');
    const i = await info(out);
    inRules(i);
    const side = await pixel(out, 1, Math.floor(i.h / 2));
    expect(Math.min(...side)).toBeGreaterThan(240);
    const mid = await pixel(out, Math.floor(i.w / 2), Math.floor(i.h / 2));
    expect(mid[0]).toBeGreaterThan(200);
    expect(mid[1]).toBeLessThan(60);
  });

  it('shrinks a huge picture and enlarges a tiny one into the allowed width', async () => {
    inRules(await info(await fitForInstagram(await solid(3000, 3000), 'image/png')));
    const small = await info(await fitForInstagram(await solid(100, 100), 'image/png'));
    inRules(small);
    expect(small.w).toBe(IG_PICTURE.minWidth);
  });

  it('turns transparent areas white and fits WebP too', async () => {
    const out = await fitForInstagram(await solid(600, 600, 'webp', 0), 'image/webp');
    const [r, g, b] = await pixel(out, 10, 10);
    expect(Math.min(r, g, b)).toBeGreaterThan(240);
  });

  it('applies the camera orientation before judging the shape', async () => {
    // 1200x400 data flagged "rotated 90 degrees" is really a tall 400x1200 picture.
    const sideways = await sharp({
      create: { width: 1200, height: 400, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const i = await info(await fitForInstagram(sideways, 'image/jpeg'));
    inRules(i);
    expect(i.h).toBeGreaterThan(i.w * 0.9); // tall result, not a wide one
  });

  it('rejects data that is not a picture', async () => {
    await expect(fitForInstagram(Buffer.from('nope'), 'image/png')).rejects.toThrow();
  });
});
