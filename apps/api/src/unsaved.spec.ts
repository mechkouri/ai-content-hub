export {};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const lib = require('../../web/src/lib/unsaved') as {
  leavesPage: (
    click: Record<string, unknown>,
    link: Record<string, unknown>,
    here: string,
  ) => boolean;
};

describe('leavesPage', () => {
  const here = 'http://app/studio/1';
  const click = { button: 0 };
  const link = (href: string, extra = {}) => ({ href, target: '', download: false, ...extra });

  it('is true for a normal click to another page of the app', () => {
    expect(lib.leavesPage(click, link('http://app/studio'), here)).toBe(true);
    expect(lib.leavesPage(click, link('http://app/studio/2'), here)).toBe(true);
  });

  it('is false when this page stays open', () => {
    expect(lib.leavesPage(click, link('http://app/studio/1#faq'), here)).toBe(false);
    expect(lib.leavesPage(click, link('http://app/x', { target: '_blank' }), here)).toBe(false);
    expect(lib.leavesPage(click, link('blob:http://app/abc', { download: true }), here)).toBe(
      false,
    );
    expect(lib.leavesPage({ button: 0, ctrlKey: true }, link('http://app/x'), here)).toBe(false);
    expect(lib.leavesPage({ button: 1 }, link('http://app/x'), here)).toBe(false);
    // another website: the browser's own warning handles it
    expect(lib.leavesPage(click, link('https://other.example/'), here)).toBe(false);
  });
});
