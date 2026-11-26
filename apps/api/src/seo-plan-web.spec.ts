export {};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const lib = require('../../web/src/lib/seo-plan') as {
  planToCsv: (plan: unknown, header: string[]) => string;
  writeArticleLink: (t: string, k: string) => string;
  reportToCsv: (report: unknown, words: unknown) => string;
  writtenArticle: (planned: unknown, pieces: unknown[]) => { id: string } | undefined;
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

describe('planned articles already written', () => {
  const planned = { title: 'Évening French Courses', keyword: 'cours du soir Casablanca' };
  const piece = (over: Record<string, unknown>) => ({
    id: 'p1',
    kind: 'ARTICLE',
    title: 'Something else',
    primaryKeyword: null,
    ...over,
  });

  it('matches the focus keyword or the title, ignoring case and accents', () => {
    expect(
      lib.writtenArticle(planned, [piece({ primaryKeyword: 'Cours du Soir casablanca ' })])?.id,
    ).toBe('p1');
    expect(lib.writtenArticle(planned, [piece({ title: 'evening french courses' })])?.id).toBe(
      'p1',
    );
  });

  it('matches a long keyword that was shortened when the article was created', () => {
    const keyword = 'k'.repeat(100);
    expect(
      lib.writtenArticle({ title: 't', keyword }, [piece({ primaryKeyword: 'k'.repeat(80) })])?.id,
    ).toBe('p1');
  });

  it('ignores social posts, other articles and empty keywords', () => {
    expect(
      lib.writtenArticle(planned, [
        piece({ kind: 'FACEBOOK', primaryKeyword: planned.keyword }),
        piece({ primaryKeyword: 'cours du soir' }),
      ]),
    ).toBeUndefined();
    expect(
      lib.writtenArticle({ title: 'A', keyword: '' }, [piece({ primaryKeyword: '' })]),
    ).toBeUndefined();
  });
});
