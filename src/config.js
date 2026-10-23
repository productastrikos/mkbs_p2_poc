/* ═══════════════════════════════════════════════════════════════════════
   APP CONFIG: name, logo, council and signed-in user.
   Pages and navigation are set in routes.js; colours in theme/theme.css.
   ═══════════════════════════════════════════════════════════════════════ */

export const APP = {
  name: 'GreenLight EVP',
  subtitle: 'MBKS Command Centre',   // small line under the name in the header
  logo: '/brand/mbks-seal.svg',      // MBKS seal, in /public/brand; null shows the initials mark
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

// The council that runs the console. Its seal is APP.logo.
export const ORG = {
  name: 'Majlis Bandaraya Kuching Selatan',
  nameEn: 'Kuching South City Council',
  short: 'MBKS',
  motto: 'Berkhidmat Untuk Masyarakat',
};

// Signed-in operator (prototype: no authentication).
export const USER = {
  name: 'Duty Operator',
  role: 'MBKS Traffic Command',
};
