import type { Config } from 'tailwindcss';

/** Tokens live as CSS variables in src/styles.css; Tailwind only maps names onto them. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: 'var(--page)',
        surface: 'var(--surface)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        clay: 'var(--clay)',
        ochre: 'var(--ochre)',
        sisal: 'var(--sisal)',
        leaf: 'var(--leaf)',
        earth: 'var(--earth)',
        paprika: 'var(--paprika)',
        sec: 'var(--sec)',
        'sec-ink': 'var(--sec-ink)',
        'sec-tint': 'var(--sec-tint)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        body: 'var(--font-body)',
      },
      maxWidth: { page: '1180px' },
    },
  },
  plugins: [],
} satisfies Config;
