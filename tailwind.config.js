/** @type {import('tailwindcss').Config} */
// Framework bridge for the Astrikos theme (ASTRIKOS-UI-THEME §5.2).
// Colours point at the --app-* variables in src/theme/theme.css, so they
// follow the active theme. Change colours there, not here.
//
// The stock ramps are re-pointed at the brand, so a stray `bg-slate-800` or
// `text-purple-400` lands on-palette instead of reintroducing blue-grey.
const graphite = { 50:'#F7F7FA',100:'#E8E6F2',200:'#D6D6D6',300:'#B4B4B4',400:'#8E8E8E',500:'#6E6E6E',600:'#4A4A4A',700:'#333333',800:'#242424',900:'#1A1A1A',950:'#121212' };
const periwinkle = { 50:'#F2F0FF',100:'#E4DFFF',200:'#D9D3FF',300:'#C8BEFF',400:'#BCB0FF',500:'#A597FF',600:'#7B5FE0',700:'#6849CC',800:'#5B3FB8',900:'#463091',950:'#2A1C5C' };
const brandGreen = { 50:'#E8FBF0',100:'#C6F5DA',200:'#94EBBB',300:'#6EE7A4',400:'#34D47C',500:'#0EBC53',600:'#0BA648',700:'#098A3C',800:'#076B2F',900:'#054F23',950:'#032E14' };
const brandRed = { 50:'#FDEEEE',100:'#F9D5D5',200:'#F2B4B4',300:'#EFA8A8',400:'#E86A6A',500:'#D43434',600:'#BE2E2E',700:'#A82828',800:'#8A2020',900:'#6B1919',950:'#3F0F0F' };
const brandAmber = { 50:'#FEF7EA',100:'#FCEBCB',200:'#F8D89B',300:'#F5C87A',400:'#F0B65C',500:'#E8A33D',600:'#C4882F',700:'#A87226',800:'#87591D',900:'#664215',950:'#3D270C' };
const brandOrange = { 50:'#FEF3EB',100:'#FCE2CE',200:'#F8C79F',300:'#F5B681',400:'#F2A365',500:'#EE8B3D',600:'#CC7430',700:'#A85E27',800:'#854A1F',900:'#633717',950:'#3B210E' };
const brandAzure = { 50:'#EFF4FF',100:'#DAE5FF',200:'#BFD2FF',300:'#A6C4FF',400:'#8AAEFF',500:'#6E9BFF',600:'#5C87F0',700:'#4A72D6',800:'#3A5CAD',900:'#2B4483',950:'#1A294F' };
const brandTeal = { 50:'#E9FBF8',100:'#C9F4ED',200:'#A3ECE0',300:'#8FE9DA',400:'#6FD9C8',500:'#4FC9BA',600:'#2F9E91',700:'#25837A',800:'#1D6660',900:'#154B47',950:'#0C2C2A' };

const v = (name) => `var(--app-${name})`;

module.exports = {
  content: ['./public/index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    // One radius family (§4.2): 6 / 8 / 9 / 10 / 12 / 14 / 999. Replaces the
    // stock scale so off-family values cannot be reached. `swatch` is the
    // 2px chart-legend swatch radius from §10.
    borderRadius: {
      none: '0', swatch: '2px', xs: '6px', sm: '8px', DEFAULT: '8px', md: '9px',
      lg: '10px', brand: '10px', xl: '12px', panel: '14px', full: '999px',
    },
    extend: {
      colors: {
        /* Brand tokens — preferred for new code */
        astrikos: {
          ink:'#353248', carbon:'#2F2E33', steel:'#565559', mist:'#E8E6F2', paper:'#F7F7FA',
          lilac:'#D9D3FF', periwinkle:'#A597FF', iris:'#8B82C3', slate:'#7D7A91',
          go:'#0EBC53', stop:'#D43434',
        },
        /* Live CSS-variable aliases — these follow the active theme */
        app: {
          bg: v('bg'), panel: v('panel'), surface: v('surface'),
          'surface-soft': v('surface-soft'), 'surface-raised': v('surface-raised'),
          elevated: v('bg-elevated'), border: v('border'),
          'border-strong': v('border-strong'), text: v('text'),
          muted: v('text-muted'), faint: v('text-faint'),
          accent: v('accent'), success: v('success'),
          warning: v('warning'), danger: v('danger'), info: v('info'),
        },
        /* Short aliases the components already use (text-fg, bg-surface…).
           primary = the brand accent (selected / active), accent = AI. */
        fg:      { DEFAULT: v('text'), muted: v('text-muted'), faint: v('text-faint') },
        surface: { DEFAULT: v('surface'), soft: v('surface-soft'), raised: v('surface-raised'), elevated: v('bg-elevated') },
        line:    { DEFAULT: v('border'), soft: v('border-soft'), strong: v('border-strong') },
        page:    v('bg'),
        primary: { DEFAULT: v('accent'), soft: v('accent-bg') },
        accent:  { DEFAULT: v('accent'), soft: v('accent-bg') },
        success: { DEFAULT: v('success'), soft: v('success-bg') },
        warning: { DEFAULT: v('warning'), soft: v('warning-bg') },
        danger:  { DEFAULT: v('danger'), soft: v('danger-bg') },
        info:    { DEFAULT: v('info'), soft: v('info-bg') },
        /* Stock ramps, re-pointed at the brand */
        slate: graphite, gray: graphite, zinc: graphite, neutral: graphite, stone: graphite,
        purple: periwinkle, violet: periwinkle, indigo: periwinkle, fuchsia: periwinkle, pink: periwinkle,
        green: brandGreen, emerald: brandGreen, lime: brandGreen,
        red: brandRed, rose: brandRed,
        amber: brandAmber, yellow: brandAmber, orange: brandOrange,
        blue: brandAzure, sky: brandAzure,
        teal: brandTeal, cyan: brandTeal,
      },
      borderColor: {
        DEFAULT: v('border'),
      },
      fontFamily: {
        display: ['"Lexend Deca"', 'system-ui', 'sans-serif'],
        sans: ['Lato', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        'brand-h1':    ['4rem',     { lineHeight:'1.05', letterSpacing:'-0.03em', fontWeight:'700' }],
        'brand-h2':    ['2rem',     { lineHeight:'1.15', letterSpacing:'-0.02em', fontWeight:'700' }],
        'brand-h3':    ['1.25rem',  { lineHeight:'1.25', letterSpacing:'-0.01em', fontWeight:'700' }],
        'brand-h4':    ['0.75rem',  { lineHeight:'1.35', letterSpacing:'0.02em',  fontWeight:'700' }],
        'brand-body':  ['1rem',     { lineHeight:'1.6' }],
        'brand-body2': ['0.875rem', { lineHeight:'1.55' }],
        'brand-tiny':  ['0.625rem', { lineHeight:'1.4', letterSpacing:'0.04em' }],
      },
      boxShadow: {
        'app-xs':'var(--app-shadow-xs)', 'app-sm':'var(--app-shadow-sm)',
        'app-md':'var(--app-shadow-md)', 'app-lg':'var(--app-shadow-lg)',
        'app-edge':'var(--app-edge-light)',
      },
      backgroundImage: {
        'astrikos-chrome':'linear-gradient(135deg,#F7F7FA 0%,#C9C4DC 18%,#8E89A6 38%,#F2F0F7 52%,#9B95B4 68%,#5B5770 86%,#B4AFC8 100%)',
        'astrikos-ink':'linear-gradient(160deg,#353248 0%,#221E31 55%,#17141F 100%)',
      },
      keyframes: { 'astrikos-sheen': { '0%':{ backgroundPosition:'0% 50%' }, '100%':{ backgroundPosition:'200% 50%' } } },
    },
  },
  plugins: [],
};
