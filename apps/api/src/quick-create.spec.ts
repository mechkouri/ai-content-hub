// eslint-disable-next-line @typescript-eslint/no-var-requires
const lib = require('../../web/src/lib/quick-create') as {
  createDrafts: (
    kinds: string[],
    generate: (kind: string) => Promise<string>,
    onProgress?: (done: number) => void,
  ) => Promise<{
    made: { kind: string; id: string }[];
    failed: { kind: string; error: unknown }[];
  }>;
  matchesSearch: (title: string, query: string) => boolean;
};

describe('createDrafts', () => {
  it('makes one draft per platform, one at a time, in the order chosen', async () => {
    const calls: string[] = [];
    let running = 0;
    const out = await lib.createDrafts(['INSTAGRAM', 'FACEBOOK'], async (k) => {
      expect(++running).toBe(1);
      calls.push(k);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return `id-${k}`;
    });
    expect(calls).toEqual(['INSTAGRAM', 'FACEBOOK']);
    expect(out.made.map((m) => m.id)).toEqual(['id-INSTAGRAM', 'id-FACEBOOK']);
    expect(out.failed).toEqual([]);
  });

  it('keeps going after one failure and reports it', async () => {
    const progress: number[] = [];
    const out = await lib.createDrafts(
      ['ARTICLE', 'LINKEDIN'],
      async (k) => {
        if (k === 'ARTICLE') throw new Error('provider busy');
        return 'x';
      },
      (n) => progress.push(n),
    );
    expect(out.failed.map((f) => f.kind)).toEqual(['ARTICLE']);
    expect(out.made).toEqual([{ kind: 'LINKEDIN', id: 'x' }]);
    expect(progress).toEqual([1, 2]);
  });
});

describe('matchesSearch', () => {
  it('ignores case and accents, and needs every word', () => {
    expect(lib.matchesSearch('Été : Offre Spéciale', 'ete offre')).toBe(true);
    expect(lib.matchesSearch('Été : Offre Spéciale', 'offre hiver')).toBe(false);
    expect(lib.matchesSearch('Anything', '   ')).toBe(true);
  });

  it('finds Arabic titles with or without vowel marks and hamza forms', () => {
    expect(lib.matchesSearch('إِعْلان التوظيف', 'اعلان')).toBe(true);
  });
});
