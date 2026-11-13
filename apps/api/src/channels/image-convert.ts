import sharp from 'sharp';

/** What Instagram accepts for a feed picture: JPEG, 320 to 1440 pixels wide, ratio 4:5 up to 1.91:1. */
export const IG_PICTURE = { minWidth: 320, maxWidth: 1440, minRatio: 0.8, maxRatio: 1.91 } as const;

/** Turns a picture into what Instagram accepts. */
export type PictureFitter = (data: Buffer, mimeType: string) => Promise<Buffer>;

/**
 * Makes a picture acceptable to Instagram without cutting anything off:
 * - converted to JPEG (transparent areas become white; an animated picture keeps its first frame),
 * - turned upright according to the camera's orientation tag,
 * - scaled into 320 to 1440 pixels wide,
 * - padded with white bars when it is too wide or too tall (the picture itself is never cropped).
 * A picture that already fits is returned unchanged, so a good JPEG is never re-compressed.
 */
export const fitForInstagram: PictureFitter = async (data, mimeType) => {
  const meta = await sharp(data, { failOn: 'error', limitInputPixels: 80_000_000 }).metadata();
  if (!meta.width || !meta.height) throw new Error('Unreadable picture');
  const turned = (meta.orientation ?? 1) >= 5; // 5 to 8 swap width and height
  const w = turned ? meta.height : meta.width;
  const h = turned ? meta.width : meta.height;
  const ratio = w / h;
  const fits =
    mimeType === 'image/jpeg' &&
    (meta.orientation ?? 1) === 1 &&
    w >= IG_PICTURE.minWidth &&
    w <= IG_PICTURE.maxWidth &&
    ratio >= IG_PICTURE.minRatio &&
    ratio <= IG_PICTURE.maxRatio;
  if (fits) return data;

  const scale =
    w > IG_PICTURE.maxWidth
      ? IG_PICTURE.maxWidth / w
      : w < IG_PICTURE.minWidth
        ? IG_PICTURE.minWidth / w
        : 1;
  let nw = Math.max(1, Math.round(w * scale));
  let nh = Math.max(1, Math.round(h * scale));
  // Pad to the nearest allowed shape.
  let outW = nw;
  let outH = nh;
  if (nw / nh > IG_PICTURE.maxRatio) outH = Math.ceil(nw / IG_PICTURE.maxRatio);
  else if (nw / nh < IG_PICTURE.minRatio) outW = Math.ceil(nh * IG_PICTURE.minRatio);
  // Padding a tall picture can make it wider than Instagram allows: shrink everything together.
  if (outW > IG_PICTURE.maxWidth) {
    const s2 = IG_PICTURE.maxWidth / outW;
    nw = Math.max(1, Math.floor(nw * s2));
    nh = Math.max(1, Math.floor(nh * s2));
    outH = Math.floor(outH * s2);
    outW = IG_PICTURE.maxWidth;
    nh = Math.min(nh, outH);
  }
  const padX = outW - nw;
  const padY = outH - nh;

  return sharp(data, { failOn: 'error', limitInputPixels: 80_000_000 })
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize(nw, nh, { fit: 'fill' })
    .extend({
      top: Math.floor(padY / 2),
      bottom: Math.ceil(padY / 2),
      left: Math.floor(padX / 2),
      right: Math.ceil(padX / 2),
      background: '#ffffff',
    })
    .jpeg({ quality: 90 })
    .toBuffer();
};
