/**
 * Writes one draft per chosen platform, one after the other (the free AI allows few requests at a time).
 * A failure for one platform does not lose the others.
 */
export async function createDrafts<K extends string>(
  kinds: K[],
  generate: (kind: K) => Promise<string>,
  onProgress?: (done: number) => void,
): Promise<{ made: { kind: K; id: string }[]; failed: { kind: K; error: unknown }[] }> {
  const made: { kind: K; id: string }[] = [];
  const failed: { kind: K; error: unknown }[] = [];
  for (const kind of kinds) {
    try {
      made.push({ kind, id: await generate(kind) });
    } catch (error) {
      failed.push({ kind, error });
    }
    onProgress?.(made.length + failed.length);
  }
  return { made, failed };
}

/** Lower case, without accents or Arabic vowel marks, so people can type titles loosely. */
const plain = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

/** True when every word of the search appears in the title. */
export function matchesSearch(title: string, query: string): boolean {
  const haystack = plain(title);
  return plain(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}
