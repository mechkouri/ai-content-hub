/** Longer than this and WhatsApp (and some browsers) cut the address, so the text is shortened first. */
export const WHATSAPP_MAX = 4000;

/** The address that opens WhatsApp with the text ready to send. The person still picks who gets it. */
export function whatsappUrl(text: string): string {
  const clean = text.trim();
  const chars = Array.from(clean); // never cuts an emoji in half
  const short =
    chars.length > WHATSAPP_MAX ? `${chars.slice(0, WHATSAPP_MAX - 1).join('')}…` : clean;
  return `https://wa.me/?text=${encodeURIComponent(short)}`;
}
