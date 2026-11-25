export {};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const lib = require('../../web/src/lib/seo-plan') as {
  planToCsv: (plan: unknown, header: string[]) => string;
  writeArticleLink: (t: string, k: string) => string;
};

describe('seo plan export', () => {
  const plan = {
    articles: [
      {
        priority: 1,
        title: '=HYPERLINK("x")',
        keyword: 'خبز "طازج"',
        intent: 'local',
        outline: ['a', 'b'],
      },
    ],
    clusters: [{ name: 'Bread', intent: 'local', keywords: ['@cmd'] }],
  };

  it('cannot run spreadsheet formulas and keeps quotes and Arabic', () => {
    const csv = lib.planToCsv(plan, ['p', 't', 'k', 'i', 'o']);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(`"'@cmd"`);
    expect(csv).toContain('"خبز ""طازج"""');
  });

  it('builds a link that keeps the topic and keyword intact', () => {
    const url = new URL(lib.writeArticleLink('A & B?', 'x=y'), 'http://h');
    expect(url.searchParams.get('topic')).toBe('A & B?');
    expect(url.searchParams.get('keyword')).toBe('x=y');
  });
});
