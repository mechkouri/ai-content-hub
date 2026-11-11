import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#1877f2', dark: '#0f5bd0', soft: '#e7f0fe' },
        surface: '#f0f2f5',
      },
      boxShadow: { card: '0 1px 2px rgba(0,0,0,.08), 0 2px 8px rgba(0,0,0,.04)' },
    },
  },
  plugins: [],
};
export default config;
