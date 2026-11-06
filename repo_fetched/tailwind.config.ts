import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Muted, scientific palette. Light mode first.
        ink: '#0f172a',
        slate2: '#1e293b',
        muted: '#475569',
        border: '#e2e8f0',
        surface: '#ffffff',
        canvas: '#f8fafc',
        accent: '#2563eb',
        accentDark: '#1d4ed8',
      },
      fontFamily: {
        // System font stack. No webfonts, no Google-font imports.
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
