/* ═══════════════════════════════════════════════════════════════════════
   APP CONFIG: name, logo and signed-in user.
   Pages and navigation are set in routes.js; colours in theme/theme.css.
   ═══════════════════════════════════════════════════════════════════════ */

export const APP = {
  name: 'GreenLight EVP',
  subtitle: 'MBKS Command Centre',   // small line under the name in the header
  logo: '/logo.svg',                 // in /public; null shows the initials mark
  logoInitials: 'GL',
  locale: 'en-MY',
  timeZone: 'Asia/Kuching',

  // Header features. Set to false to hide.
  features: {
    search: true,
    clock: true,
    notifications: true,
    insights: true,                  // AI insights side panel
    themeToggle: true,
  },
};

// Signed-in operator (prototype: no authentication).
export const USER = {
  name: 'Duty Operator',
  role: 'MBKS Traffic Command',
};
