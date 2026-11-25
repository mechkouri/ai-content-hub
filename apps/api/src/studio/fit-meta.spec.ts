import { fitMeta } from './fit-meta';

describe('fitMeta', () => {
  it('leaves a short description alone', () => {
    expect(fitMeta('Evening courses in Casablanca.')).toBe('Evening courses in Casablanca.');
  });

  it('keeps whole sentences when they are long enough', () => {
    const first =
      'Join our French evening courses for adults in Casablanca, on Monday and Wednesday.';
    const out = fitMeta(`${first} ${'Groups are small and friendly. '.repeat(6)}`);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.startsWith(first)).toBe(true);
    expect(out.endsWith('.')).toBe(true);
  });

  it('otherwise cuts between words and marks it', () => {
    const out = fitMeta('word '.repeat(60));
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith('word…')).toBe(true);
  });
});
