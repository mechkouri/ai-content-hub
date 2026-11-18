import { buildImageBlock, imageAssetIds, imageBlocksIn, parseImageBlock } from '../common/inline';

// The editor's helper for pictures inside the text lives with the web app (pure code, no React). It must read and
// write exactly the syntax the API reads, so both are tested together here.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const web = require('../../../web/src/lib/article-images') as {
  splitBody: (
    v: string,
  ) => (
    | { type: 'text'; text: string }
    | { type: 'image'; alt: string; assetId: string; caption: string }
  )[];
  joinBody: (s: any[]) => string;
  writePicture: (b: { alt: string; assetId: string; caption: string }) => string;
  parsePicture: (p: string) => { alt: string; assetId: string; caption: string } | null;
  altFromFilename: (n: string) => string;
};

const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const pic = (alt: string, caption = '') => ({ alt, assetId: ID, caption });

describe('picture syntax, written by the editor and read by the API', () => {
  it('round-trips between the two implementations', () => {
    for (const b of [
      pic('A lecture hall'),
      pic('Students', 'Photo: Jane Doe · CC BY 4.0 · flickr'),
      pic('', ''),
    ]) {
      const written = web.writePicture(b);
      expect(written).toBe(buildImageBlock(b));
      expect(web.parsePicture(written)).toEqual(parseImageBlock(written));
      expect(parseImageBlock(written)).toEqual(b);
    }
  });

  it('keeps awkward characters from breaking the syntax', () => {
    // brackets and line breaks in the description become spaces; quotes in the caption become typographic quotes
    const awkward = { alt: 'a [b] c\nd', assetId: ID.toUpperCase(), caption: 'say "hi"\nnow' };
    const w = web.writePicture(awkward);
    expect(w).toBe(`![a  b  c d](media:${ID} "say ”hi” now")`);
    expect(parseImageBlock(w)).toEqual({ alt: 'a  b  c d', assetId: ID, caption: 'say ”hi” now' });
    expect(buildImageBlock(awkward)).toBe(w);
  });

  it('is only a picture when the whole paragraph is the syntax', () => {
    expect(parseImageBlock(`text ![x](media:${ID})`)).toBeNull();
    expect(parseImageBlock(`![x](media:not-a-uuid)`)).toBeNull();
    expect(parseImageBlock(`![x](https://a.example/x.png)`)).toBeNull(); // only the media library, never an outside address
    expect(parseImageBlock(`![x](media:${ID})!`)).toBeNull();
    expect(imageAssetIds(`a ![x](media:${ID}) b ![y](media:${ID.toUpperCase()})`)).toEqual([ID]);
  });
});

describe('splitting a body into text and pictures', () => {
  const text = (t: string) => ({ type: 'text', text: t });
  const image = (alt: string, caption = '') => ({ type: 'image', ...pic(alt, caption) });

  it('separates paragraphs from pictures, in order, and always ends with room to type', () => {
    const body = `First.\n\nSecond.\n\n${web.writePicture(pic('Hall'))}\n\nThird.`;
    expect(web.splitBody(body)).toEqual([
      expect.objectContaining(text('First.\n\nSecond.')),
      expect.objectContaining(image('Hall')),
      expect.objectContaining(text('Third.')),
    ]);
    const endsWithPicture = web.splitBody(`Text.\n\n${web.writePicture(pic('Hall'))}`);
    expect(endsWithPicture.map((s) => s.type)).toEqual(['text', 'image', 'text']);
    expect(endsWithPicture[2]).toMatchObject({ text: '' });
    expect(web.splitBody('').map((s) => s.type)).toEqual(['text']);
    expect(web.splitBody(web.writePicture(pic('Only'))).map((s) => s.type)).toEqual([
      'image',
      'text',
    ]);
  });

  it('puts them back together without losing or inventing anything', () => {
    for (const body of [
      '',
      'Just text.',
      'One.\n\nTwo.',
      `Intro.\n\n${web.writePicture(pic('A', 'Credit'))}\n\nMiddle.\n\n${web.writePicture(pic('B'))}\n\nEnd.`,
      `${web.writePicture(pic('First'))}\n\n${web.writePicture(pic('Second'))}`,
    ]) {
      expect(web.joinBody(web.splitBody(body))).toBe(body);
    }
  });

  it('drops empty runs and trims stray blank lines', () => {
    expect(web.joinBody([text('  \n'), image('A'), text(''), text('Word\n\n')])).toBe(
      `${web.writePicture(pic('A'))}\n\nWord`,
    );
  });

  it('is read the same way by the API', () => {
    const body = `Intro.\n\n${web.writePicture(pic('A', 'Credit'))}\n\nMiddle.\n\n${web.writePicture(pic('B'))}`;
    expect(imageBlocksIn(body).map((b) => b.alt)).toEqual(['A', 'B']);
    expect(web.splitBody(body).filter((s) => s.type === 'image')).toHaveLength(2);
  });

  it('suggests a description from a file name', () => {
    expect(web.altFromFilename('students-on-campus.webp')).toBe('Students on campus');
    expect(web.altFromFilename('IMG_1234.JPG')).toBe('IMG 1234');
    expect(web.altFromFilename('.png')).toBe('');
  });
});
