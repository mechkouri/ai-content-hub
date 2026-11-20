// eslint-disable-next-line @typescript-eslint/no-var-requires
const ideas = require('../../web/src/lib/business-ideas') as {
  BUSINESS_TYPES: readonly string[];
  businessTable: (
    l: string,
  ) => Record<string, { label: string; ideas: { title: string; text: string }[] }>;
  hasBlanks: (t: string) => boolean;
};

describe('business starting texts', () => {
  for (const locale of ['en', 'fr', 'ar']) {
    it(`covers every business type with fill-in blanks (${locale})`, () => {
      const table = ideas.businessTable(locale);
      for (const type of ideas.BUSINESS_TYPES) {
        expect(table[type].label.length).toBeGreaterThan(2);
        expect(table[type].ideas).toHaveLength(3);
        for (const idea of table[type].ideas) {
          expect(idea.title.length).toBeGreaterThan(2);
          expect(idea.text.length).toBeGreaterThanOrEqual(20);
          expect(ideas.hasBlanks(idea.text)).toBe(true);
        }
      }
    });
  }

  it('the Arabic texts are Arabic and the French ones are not English', () => {
    const ar = ideas.businessTable('ar');
    for (const type of ideas.BUSINESS_TYPES) {
      for (const idea of ar[type].ideas) expect(idea.text).toMatch(/[؀-ۿ]/);
    }
  });

  it('detects blanks only while they remain', () => {
    expect(ideas.hasBlanks('Open on [date]')).toBe(true);
    expect(ideas.hasBlanks('Open on 5 December')).toBe(false);
  });
});
