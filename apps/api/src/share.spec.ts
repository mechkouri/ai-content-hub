// eslint-disable-next-line @typescript-eslint/no-var-requires
const share = require('../../web/src/lib/share') as {
  WHATSAPP_MAX: number;
  whatsappUrl: (t: string) => string;
};

const textOf = (url: string) => new URL(url).searchParams.get('text') as string;

describe('whatsappUrl', () => {
  it('keeps the whole post, including line breaks, hashtags, links and Arabic', () => {
    const post = 'عرض خاص 🎉\nOpen & free? #sale https://a.example/x?y=1';
    const url = share.whatsappUrl(`  ${post}  `);
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(textOf(url)).toBe(post);
  });

  it('shortens very long text without breaking an emoji', () => {
    const out = textOf(share.whatsappUrl('🎉'.repeat(share.WHATSAPP_MAX + 10)));
    expect(Array.from(out)).toHaveLength(share.WHATSAPP_MAX);
    expect(out.endsWith('…')).toBe(true);
  });
});
