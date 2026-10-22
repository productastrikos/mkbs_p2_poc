import L from 'leaflet';
import { SIGNAL_VAR, MOVE_ARROW } from './format';

/* Leaflet DivIcons for the command map. Icons are cached by a state key so
   unchanged markers are not re-created on every snapshot. Colours are theme
   tokens (CSS variables), so markers follow light/dark mode. */

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) {
    if (cache.size > 800) cache.clear();
    cache.set(key, make());
  }
  return cache.get(key);
}

const PRIORITY_COLOR = { Critical: 'var(--color-danger)', Urgent: 'var(--color-warning)', 'Non-urgent': 'var(--color-info)' };
const MODE_FILL = { ADAPTIVE: 'var(--color-surface-raised)', PREEMPT: 'var(--color-primary)', RECOVERY: 'var(--color-warning)' };

function spoke(bearing, len, color, width = 4) {
  const a = (bearing * Math.PI) / 180;
  const x = 22 + Math.sin(a) * len;
  const y = 22 - Math.cos(a) * len;
  return `<line x1="22" y1="22" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" style="stroke: ${color}" stroke-width="${width}" stroke-linecap="round"/>`;
}

function arrowPath(junction, arm, move) {
  const a = junction.arms.find((x) => x.id === arm);
  const b = junction.arms.find((x) => x.id === junction.movements[arm]?.[move]);
  if (!a || !b) return '';
  const p = (bearing, d) => { const r = (bearing * Math.PI) / 180; return [22 + Math.sin(r) * d, 22 - Math.cos(r) * d]; };
  const [x0, y0] = p(a.bearing, 19);
  const [x1, y1] = p(b.bearing, 19);
  return `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} Q22 22 ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" style="stroke: var(--color-accent)" stroke-width="3.5" stroke-linecap="round" marker-end="url(#m)"/>`;
}

/**
 * junction  static junction record
 * st        controller snapshot (mode, arms states, …)
 * ap        approaching ambulance info { arm, move, p, label } or null
 */
export function junctionIcon(junction, st, ap, selected) {
  const arms = st?.arms || {};
  const mode = st?.mode || 'ADAPTIVE';
  const key = `j|${junction.id}|${mode}|${Object.values(arms).join('')}|${ap ? `${ap.arm}${ap.move}${ap.label}` : ''}|${selected ? 1 : 0}`;
  return cached(key, () => {
    const spokes = junction.arms.map((a) => spoke(a.bearing, 15, SIGNAL_VAR[arms[a.id] || 'R'])).join('');
    const ring = mode === 'PREEMPT' ? '<circle cx="22" cy="22" r="20" fill="none" style="stroke: var(--color-primary)" stroke-width="2.5" class="evp-pulse"/>'
      : mode === 'RECOVERY' ? '<circle cx="22" cy="22" r="20" fill="none" style="stroke: var(--color-warning)" stroke-width="2" stroke-dasharray="3 3"/>' : '';
    const sel = selected ? '<circle cx="22" cy="22" r="21" fill="none" style="stroke: var(--color-text)" stroke-width="2"/>' : '';
    const arrow = ap ? arrowPath(junction, ap.arm, ap.move) : '';
    const html = `
      <div class="jn-icon">
        <svg width="44" height="44" viewBox="0 0 44 44">
          <defs><marker id="m" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10z" style="fill: var(--color-accent)"/></marker></defs>
          ${ring}${sel}
          <circle cx="22" cy="22" r="13" style="fill: var(--color-surface)" fill-opacity="0.88"/>
          ${spokes}
          <circle cx="22" cy="22" r="6" style="fill: ${MODE_FILL[mode]}; stroke: var(--color-text)" stroke-width="1.5"/>
          ${arrow}
        </svg>
        <span class="jn-label">${junction.id}${junction.poc ? ' ★' : ''}</span>
        ${ap ? `<span class="jn-ap">${ap.label}</span>` : ''}
      </div>`;
    return L.divIcon({ html, className: 'evp-divicon', iconSize: [44, 44], iconAnchor: [22, 22] });
  });
}

export function ambulanceIcon({ id, heading, priority, quarantined, selected, idle, status }) {
  const h = Math.round(heading / 5) * 5;
  const busy = status === 'ON_SCENE' || status === 'HANDOVER';
  const key = `a|${id}|${h}|${priority}|${quarantined ? 1 : 0}|${selected ? 1 : 0}|${idle ? 1 : 0}|${status}`;
  return cached(key, () => {
    if (idle) {
      const ring = quarantined ? 'var(--color-danger)' : busy ? 'var(--color-accent)' : 'var(--color-surface)';
      return L.divIcon({ html: `<div class="amb-idle" title="${id}" style="border-color: ${ring}"></div>`, className: 'evp-divicon', iconSize: [10, 10], iconAnchor: [5, 5] });
    }
    // Driving back to base: no EVP, so neutral rather than a priority colour.
    const color = quarantined || status === 'REPOSITIONING' ? 'var(--color-neutral)' : PRIORITY_COLOR[priority] || 'var(--color-info)';
    const html = `
      <div class="amb-icon ${selected ? 'is-selected' : ''}">
        <svg width="34" height="34" viewBox="0 0 34 34" style="transform: rotate(${h}deg)">
          <circle cx="17" cy="17" r="13" style="fill: ${color}; stroke: ${selected ? 'var(--color-text)' : 'var(--color-surface)'}" stroke-width="2.5"/>
          <path d="M17 6 L23 19 L17 16 L11 19 Z" fill="#ffffff"/>
        </svg>
        <span class="amb-label">${id}${quarantined ? ' ⛔' : ''}</span>
      </div>`;
    return L.divIcon({ html, className: 'evp-divicon amb-marker', iconSize: [34, 34], iconAnchor: [17, 17] });
  });
}

export function hospitalIcon(h) {
  return cached(`h|${h.id}`, () => L.divIcon({
    html: `<div class="hosp-icon"><span>H</span><b>${h.short}</b></div>`,
    className: 'evp-divicon', iconSize: [26, 26], iconAnchor: [13, 13],
  }));
}

export function ghostIcon(g) {
  return cached(`g|${g.obuId}`, () => L.divIcon({
    html: `<div class="ghost-icon">?</div><span class="amb-label ghost-label">${g.plate}</span>`,
    className: 'evp-divicon', iconSize: [28, 28], iconAnchor: [14, 14],
  }));
}

export const moveGlyph = (m) => MOVE_ARROW[m] || m;
