import type { Config } from 'tailwindcss';

// Design tokens from the "Synthetix" design system (cobalt blue + slate, hairline borders, soft ambient shadows).
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary: Royal Cobalt. `brand` keeps the name existing screens already use.
        brand: { DEFAULT: '#2563EB', dark: '#1D4ED8', soft: '#EFF6FF', line: '#BFDBFE' },
        // AI assistive actions: Modern Indigo.
        ai: { DEFAULT: '#6366F1', dark: '#4338CA', soft: '#EEF2FF', line: '#C7D2FE' },
        sky: { ai: '#38BDF8' },
        ink: '#0F172A', // Midnight Slate: headings and navigation
        muted: '#64748B', // Slate Muted: secondary text
        line: { DEFAULT: '#E2E8F0', strong: '#CBD5E1' }, // hairline borders
        surface: { DEFAULT: '#F8FAFC', sub: '#F1F5F9' },
        ok: { DEFAULT: '#10B981', soft: '#ECFDF5', ink: '#065F46' },
        warn: { DEFAULT: '#F59E0B', soft: '#FFFBEB', ink: '#92400E' },
        danger: { DEFAULT: '#EF4444', soft: '#FEF2F2', ink: '#991B1B' },
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        label: ['var(--font-label)', 'var(--font-body)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(15,23,42,.04), 0 1px 2px rgba(15,23,42,.02)',
        lift: '0 10px 15px -3px rgba(15,23,42,.06), 0 4px 6px -2px rgba(15,23,42,.03)',
        pop: '0 20px 25px -5px rgba(15,23,42,.08), 0 8px 10px -6px rgba(15,23,42,.04)',
        glow: '0 4px 12px rgba(37,99,235,.2)',
      },
      width: { rail: '260px' },
      spacing: { rail: '260px' },
    },
  },
  plugins: [],
};
export default config;
