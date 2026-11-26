/** Fixes for website check findings that need no AI: the person copies the lines into their page. */

const attribute = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const canonicalTag = (url: string) => `<link rel="canonical" href="${attribute(url)}">`;

export const BUSINESS_KINDS = [
  'LocalBusiness',
  'Store',
  'Restaurant',
  'EducationalOrganization',
  'MedicalClinic',
  'RealEstateAgent',
  'ProfessionalService',
] as const;

export interface BusinessDetails {
  type: string;
  name: string;
  url?: string;
  phone?: string;
  street?: string;
  city?: string;
  /** For example "Mo-Fr 09:00-18:00". */
  hours?: string;
}

/** Structured data about the business. Only what was typed goes in: nothing is guessed. */
export function businessSchema(b: BusinessDetails): string {
  const value = (s?: string) => s?.trim() || undefined;
  const street = value(b.street);
  const city = value(b.city);
  const data = {
    '@context': 'https://schema.org',
    '@type': b.type,
    name: value(b.name),
    url: value(b.url),
    telephone: value(b.phone),
    address:
      street || city
        ? { '@type': 'PostalAddress', streetAddress: street, addressLocality: city }
        : undefined,
    openingHours: value(b.hours),
  };
  // "<" is written as < so typed text can never close the script tag
  const body = JSON.stringify(data, null, 2).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">\n${body}\n</script>`;
}
