/* Small shared helpers. */

/* Tone names used across the app → theme tokens (theme.css). 'primary' is
   the brand accent (selected / active), 'accent' the AI / advisory hue,
   'neutral' inactive. Returns CSS var() strings for inline styles. */
const TONE_COLOR = { primary: 'accent', accent: 'advisory-soft', neutral: 'text-faint', success: 'success', warning: 'warning', danger: 'danger', info: 'info' };
const TONE_BG = { primary: 'accent-bg', accent: 'violet-bg', neutral: 'surface-raised', success: 'success-bg', warning: 'warning-bg', danger: 'danger-bg', info: 'info-bg' };
export const toneToken = (tone) => TONE_COLOR[tone] || tone;
export const toneColor = (tone) => `var(--app-${toneToken(tone)})`;
export const toneBg = (tone) => `var(--app-${TONE_BG[tone] || `${tone}-bg`})`;

// Health status used by stat cards, charts and KPI details.
// `tone` maps to the colour classes in theme/theme.css (.tone-*).
export const STATUS = {
  normal:   { label: 'Normal',   tone: 'success' },
  warning:  { label: 'Warning',  tone: 'warning' },
  critical: { label: 'Critical', tone: 'danger'  },
};

/**
 * Status for a value against thresholds.
 *   thresholds = { good, warn }
 *   inverted = false: higher is better (>= good is normal, >= warn is warning)
 *   inverted = true:  lower is better  (<= good is normal, <= warn is warning)
 */
export function getStatus(value, thresholds, inverted = false) {
  if (!thresholds) return 'normal';
  const v = parseFloat(value) || 0;
  const { good, warn } = thresholds;
  if (!inverted) return v >= good ? 'normal' : v >= warn ? 'warning' : 'critical';
  return v <= good ? 'normal' : v <= warn ? 'warning' : 'critical';
}

// Tone for a 0–100 utilisation-style value (higher is worse).
export function loadTone(pct, warnAt = 60, dangerAt = 85) {
  return pct > dangerAt ? 'danger' : pct > warnAt ? 'warning' : 'success';
}

export function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export const titleCase = (s = '') => s.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
