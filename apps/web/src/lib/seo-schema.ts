// Structured data (JSON-LD) for an article, ready to paste into a page. Plain data in, plain data out, so it
// is tested from the API's test suite like the other pure web helpers.

interface ArticleLike {
  h1: string;
  metaDescription: string;
  sections: { heading: string }[];
  faq: { question: string; answer: string }[];
  structuredData: { type: string };
}

/**
 * The article itself and, when it has a FAQ, a FAQPage. Only what is known is included: no publish date
 * (it is set when the post goes live) and no address (the site decides the final one).
 */
export function articleJsonLd(
  a: ArticleLike,
  ctx: { siteName: string; language: string },
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const org = ctx.siteName.trim() ? { '@type': 'Organization', name: ctx.siteName.trim() } : null;
  out.push({
    '@context': 'https://schema.org',
    '@type': a.structuredData.type === 'NewsArticle' ? 'NewsArticle' : 'Article',
    headline: a.h1.slice(0, 110),
    description: a.metaDescription,
    inLanguage: ctx.language,
    ...(a.sections.length ? { articleSection: a.sections.map((s) => s.heading) } : {}),
    ...(org ? { author: org, publisher: org } : {}),
  });
  const faq = a.faq.filter((f) => f.question.trim() && f.answer.trim());
  if (faq.length) {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    });
  }
  return out;
}

/** A script tag per object, as a search engine expects to find it. */
export function jsonLdScripts(objects: Record<string, unknown>[]): string {
  return objects
    .map(
      (o) =>
        // "</" inside a string would end the script early; escape it.
        `<script type="application/ld+json">\n${JSON.stringify(o, null, 2).replace(/<\//g, '<\\/')}\n</script>`,
    )
    .join('\n');
}
