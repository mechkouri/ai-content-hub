export {};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fixes = require('../../web/src/lib/site-fixes') as {
  canonicalTag: (url: string) => string;
  businessSchema: (b: Record<string, string>) => string;
};

const json = (tag: string) =>
  JSON.parse(
    tag.replace(/^<script type="application\/ld\+json">\n/, '').replace(/\n<\/script>$/, ''),
  );

describe('ready-to-paste website fixes', () => {
  it('writes the canonical line safely', () => {
    expect(fixes.canonicalTag('https://a.example/x?a=1&b="2"')).toBe(
      '<link rel="canonical" href="https://a.example/x?a=1&amp;b=&quot;2&quot;">',
    );
  });

  it('describes the business with only what was typed', () => {
    const out = fixes.businessSchema({
      type: 'Restaurant',
      name: ' Atlas ',
      url: 'https://a.example',
      phone: '0522 00 00 00',
      street: '',
      city: 'Casablanca',
      hours: '',
    });
    expect(json(out)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      name: 'Atlas',
      url: 'https://a.example',
      telephone: '0522 00 00 00',
      address: { '@type': 'PostalAddress', addressLocality: 'Casablanca' },
    });
  });

  it('cannot break out of the script tag', () => {
    const out = fixes.businessSchema({ type: 'LocalBusiness', name: '</script><script>x()' });
    expect(out.match(/<\/script>/g)).toHaveLength(1);
    expect(json(out).name).toBe('</script><script>x()');
  });
});
