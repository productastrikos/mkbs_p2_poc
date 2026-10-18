/** @type {import('tailwindcss').Config} */
// Tailwind colours point at the CSS variables in src/theme/theme.css, so
// utilities such as `text-success`, `bg-surface` or `border-primary`
// follow the active theme. Change colours in theme.css, not here.
const token = (name) => `var(--${name})`;

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary:   { DEFAULT: token('color-primary'), soft: token('color-primary-soft') },
        accent:    { DEFAULT: token('color-accent'),  soft: token('color-accent-soft') },
        success:   { DEFAULT: token('color-success'), soft: token('color-success-soft') },
        warning:   { DEFAULT: token('color-warning'), soft: token('color-warning-soft') },
        danger:    { DEFAULT: token('color-danger'),  soft: token('color-danger-soft') },
        info:      { DEFAULT: token('color-info'),    soft: token('color-info-soft') },
        neutral:   { DEFAULT: token('color-neutral'), soft: token('color-neutral-soft') },
        page:      token('color-bg'),
        surface:   { DEFAULT: token('color-surface'), raised: token('color-surface-raised') },
        line:      { DEFAULT: token('color-border'),  strong: token('color-border-strong') },
        fg:        { DEFAULT: token('color-text'), muted: token('color-text-muted'), faint: token('color-text-faint') },
      },
      borderColor: {
        DEFAULT: token('color-border'),
      },
      fontFamily: {
        sans: token('font-sans'),
      },
    },
  },
  plugins: [],
};
