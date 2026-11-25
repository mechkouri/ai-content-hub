/** Longest description search results show in full. */
const MAX = 160;

/**
 * Shortens a too long meta description without cutting a word in half: whole sentences when they still say
 * enough, otherwise up to the last word that fits.
 */
export function fitMeta(text: string, max = MAX): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const sentences = clean.match(/[^.!?؟]+[.!?؟]+(?=\s|$)/g) ?? [];
  let out = '';
  for (const s of sentences) {
    if ((out + s).trim().length > max) break;
    out += s;
  }
  if (out.trim().length >= 70) return out.trim();
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[,;:،\s]+$/, '')}…`;
}
