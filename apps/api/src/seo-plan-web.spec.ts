export {};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const lib = require('../../web/src/lib/seo-plan') as {
  planToCsv: (plan: unknown, header: string[]) => string;
  writeArticleLink: (t: string, k: string) => string;
  reportToCsv: (report: unknown, words: unknown) => string;
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

describe('website check export', () => {
  it('lists every problem on every page, including repeated titles', () => {
    const csv = lib.reportToCsv(
      {
        problems: [{ id: 'meta', impact: 1, pages: ['https://a/1', 'https://a/2'] }],
        duplicateTitles: [{ title: '=1+1', pages: ['https://a/3'] }],
      },
      {
        header: ['p', 'problem', 'page'],
        problem: (id: string) => `name-${id}`,
        impact: (n: number) => `level-${n}`,
        sameTitle: 'Same title:',
      },
    );
    expect(csv.split('\r\n')).toEqual([
      '\uFEFF"p","problem","page"',
      '"level-1","name-meta","https://a/1"',
      '"level-1","name-meta","https://a/2"',
      '"level-2","Same title: =1+1","https://a/3"',
    ]);
  });
});
