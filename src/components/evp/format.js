import React from 'react';
import { Badge } from '../ui';
import { APP } from '../../config';

export const PRIORITY_TONE = { Critical: 'danger', Urgent: 'warning', 'Non-urgent': 'info' };
export const STATUS_LABEL = { TO_PATIENT: 'To patient', TO_HOSPITAL: 'To hospital', RETURNING: 'Returning to base', IDLE: 'Available' };
export const MODE_TONE = { ADAPTIVE: 'neutral', PREEMPT: 'primary', RECOVERY: 'warning' };
export const MODE_LABEL = { ADAPTIVE: 'SCATS adaptive', PREEMPT: 'EVP pre-emption', RECOVERY: 'Recovery' };
export const STAGE_LABEL = { GREEN: 'green', AMBER: 'amber', ALLRED: 'all-red' };
export const SIGNAL_VAR = { G: 'var(--signal-green)', A: 'var(--signal-amber)', R: 'var(--signal-red)' };
export const REQUEST_LABEL = {
  SENT: 'Requested', GREEN: 'Green held', YIELDING: 'Yielding', BLOCKED: 'Blocked', RELEASED: 'Released', CANCELLED: 'Cancelled',
};
// Unit states in the live twin (snapshot vehicles[].status).
export const UNIT_STATUS = {
  TO_PATIENT: { label: 'Responding to patient', tone: 'primary', group: 'on an EVP trip' },
  TO_HOSPITAL: { label: 'Conveying to hospital', tone: 'primary', group: 'on an EVP trip' },
  RETURNING: { label: 'Trip without patient status', tone: 'warning', group: 'on an EVP trip' },
  ON_SCENE: { label: 'On scene', tone: 'accent', group: 'on scene or at handover' },
  HANDOVER: { label: 'Hospital handover', tone: 'accent', group: 'on scene or at handover' },
  REPOSITIONING: { label: 'Returning to base (no EVP)', tone: 'neutral', group: 'free' },
  AVAILABLE_AWAY: { label: 'Available, away from base', tone: 'success', group: 'free' },
  AVAILABLE: { label: 'Available at base', tone: 'success', group: 'free' },
};

export function UnitStatusBadge({ status, priority }) {
  const s = UNIT_STATUS[status] || { label: status, tone: 'neutral' };
  const tone = (status === 'TO_PATIENT' || status === 'TO_HOSPITAL') && priority ? PRIORITY_TONE[priority] : s.tone;
  return <Badge tone={tone} dot>{s.label}</Badge>;
}

export function fmtS(s, { short = false } = {}) {
  if (s == null || !Number.isFinite(s)) return '–';
  const v = Math.round(s);
  if (Math.abs(v) < 60) return `${v} s`;
  const m = Math.floor(Math.abs(v) / 60);
  const r = Math.abs(v) % 60;
  return `${v < 0 ? '−' : ''}${m} min${short || !r ? '' : ` ${r} s`}`;
}

export const fmtNum = (n, d = 0) => (n == null || !Number.isFinite(n) ? '–' : n.toLocaleString(APP.locale, { maximumFractionDigits: d, minimumFractionDigits: d }));
export const fmtRM = (n) => `RM${n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : Math.round(n)}`;
export const fmtPct = (x, d = 0) => (x == null ? '–' : `${(x * 100).toFixed(d)}%`);

export function fmtTime(ms, { seconds = true } = {}) {
  return new Date(ms).toLocaleTimeString(APP.locale, { hour12: false, timeZone: APP.timeZone, hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) });
}
export function fmtDate(ms) {
  return new Date(ms).toLocaleString(APP.locale, { timeZone: APP.timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function PriorityBadge({ priority }) {
  if (!priority) return null;
  return <Badge tone={PRIORITY_TONE[priority] || 'neutral'} dot>{priority.toUpperCase()}</Badge>;
}

export function ModeBadge({ mode, recovery }) {
  return <Badge tone={MODE_TONE[mode] || 'neutral'} dot>{MODE_LABEL[mode] || mode}{mode === 'RECOVERY' && recovery ? ` · cycle ${recovery.cycle}/${recovery.of}` : ''}</Badge>;
}

/** Three-lamp signal head for one movement state. */
export function SignalHead({ state, size = 10, vertical = false }) {
  const lamps = ['R', 'A', 'G'];
  return (
    <span className={`inline-flex ${vertical ? 'flex-col' : ''} gap-0.5 p-0.5 rounded-md`} style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} role="img" aria-label={`Signal ${state === 'G' ? 'green' : state === 'A' ? 'amber' : 'red'}`}>
      {lamps.map((l) => (
        <span key={l} className="rounded-full" style={{ width: size, height: size, background: state === l ? SIGNAL_VAR[l] : 'var(--color-surface-raised)', boxShadow: state === l ? `0 0 6px ${SIGNAL_VAR[l]}` : 'none' }} />
      ))}
    </span>
  );
}

export const MOVE_ARROW = { L: '↰', S: '↑', R: '↱', U: '↶' };
