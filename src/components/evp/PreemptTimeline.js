import React from 'react';
import { Icon } from '../ui';
import { MAX_HOLD_S } from '../../evp/scats/controller';

/* Request → (pedestrian protection) → amber → all-red → green hold →
   release → recovery, drawn to scale, plus the safety checklist. */

const SEG = [
  { key: 'wait', label: 'Safe-to-switch wait', color: 'var(--color-text-faint)' },
  { key: 'amber', label: 'Amber 3 s', color: 'var(--signal-amber)' },
  { key: 'allred', label: 'All-red 2 s', color: 'var(--signal-red)' },
  { key: 'green', label: 'EVP green (hold)', color: 'var(--signal-green)' },
  { key: 'release', label: 'Release amber + all-red', color: 'var(--signal-amber)' },
  { key: 'recovery', label: 'SCATS recovery', color: 'var(--color-warning)' },
];

export function timelineSegments(p, now) {
  const tl = p.timeline;
  const end = (x) => (x != null ? x : now);
  const segs = [];
  if (tl.amberAt != null || tl.allRedAt != null) {
    const waitEnd = tl.amberAt ?? tl.allRedAt;
    if (waitEnd > tl.requestedAt + 0.2) segs.push({ key: 'wait', from: tl.requestedAt, to: waitEnd });
    if (tl.amberAt != null) segs.push({ key: 'amber', from: tl.amberAt, to: end(tl.allRedAt) });
    if (tl.allRedAt != null) segs.push({ key: 'allred', from: tl.allRedAt, to: end(tl.greenAt) });
  } else if (tl.greenAt == null) {
    segs.push({ key: 'wait', from: tl.requestedAt, to: now });
  }
  if (tl.greenAt != null) segs.push({ key: 'green', from: tl.greenAt, to: end(tl.releasedAt) });
  if (tl.releasedAt != null && tl.greenAt != null) segs.push({ key: 'release', from: tl.releasedAt, to: Math.min(end(tl.recoveryEndAt), tl.releasedAt + 5) });
  if (tl.recoveryStartAt != null) segs.push({ key: 'recovery', from: Math.max(tl.recoveryStartAt + 5, tl.recoveryStartAt), to: end(tl.recoveryEndAt) });
  return segs.filter((s) => s.to > s.from);
}

export default function PreemptTimeline({ p, now, live }) {
  const segs = timelineSegments(p, now);
  if (!segs.length) return null;
  const t0 = segs[0].from;
  const t1 = Math.max(...segs.map((s) => s.to));
  const span = Math.max(1, t1 - t0);
  const tl = p.timeline;
  const rel = (x) => (x == null ? '–' : `+${(x - t0).toFixed(1)} s`);
  const holdS = tl.greenAt != null ? (tl.releasedAt ?? now) - tl.greenAt : null;
  const amberS = tl.amberAt != null && tl.allRedAt != null ? tl.allRedAt - tl.amberAt : null;
  const allRedS = tl.allRedAt != null && tl.greenAt != null ? tl.greenAt - tl.allRedAt : null;

  const checks = [
    { ok: true, text: `Authorised: ${p.vehicleId} registered, active trip, patient status valid` },
    { ok: true, text: p.pedProtect ? `Pedestrian crossing protected: waited ${(tl.safeAt - tl.requestedAt).toFixed(1)} s for clearance` : 'No pedestrian crossing in progress at request time' },
    p.alreadyGreen
      ? { ok: true, text: 'Requested movement was already green: held without a phase change' }
      : { ok: amberS == null || Math.abs(amberS - 3) < 0.3, pending: amberS == null, text: `Amber ${amberS != null ? `${amberS.toFixed(1)} s` : 'pending'} (rule: 3 s)` },
    p.alreadyGreen ? null : { ok: allRedS == null || Math.abs(allRedS - 2) < 0.3, pending: allRedS == null, text: `All-red ${allRedS != null ? `${allRedS.toFixed(1)} s` : 'pending'} (rule: 2 s)` },
    { ok: holdS == null || holdS <= MAX_HOLD_S + 0.2, pending: holdS == null, text: `Hold ${holdS != null ? `${holdS.toFixed(1)} s` : 'not started'} (rule: ≤ ${MAX_HOLD_S} s)${p.maxHoldHit ? ': maximum reached, released to SCATS' : ''}` },
    tl.releasedAt != null ? { ok: true, text: `Released: ${p.releaseReason || 'cleared'}` } : { ok: true, pending: true, text: 'Release when the ambulance clears the junction (auto-cancel if it stops or diverts > 20 s)' },
    { ok: true, pending: tl.recoveryEndAt == null, text: tl.recoveryEndAt != null ? `SCATS adaptive control resumed after ${p.recovery?.cycles ?? '–'} recovery cycle(s)${p.recovery ? `: queue peak ${p.recovery.peakQueue} → ${p.recovery.queueAtEnd} veh (normal ${p.recovery.normalQueue})` : ''}` : 'Recovery cycles in progress' },
  ].filter(Boolean);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[11px] text-fg-faint">
        <span><b className="text-fg">{p.vehicleId}</b> · {p.priority} · phase <b className="text-fg">{p.phaseId}</b>{p.corrected ? ` · corrected ${p.corrected}×` : ''}</span>
        <span>{live ? 'Live' : tl.recoveryStartAt != null && tl.recoveryEndAt == null ? 'Recovering' : 'Completed'} · {span.toFixed(0)} s</span>
      </div>
      <div className="flex h-7 rounded-md overflow-hidden" style={{ gap: 2, background: 'var(--color-surface)' }} role="img" aria-label="Pre-emption timeline">
        {segs.map((s, i) => (
          <div key={i} title={`${SEG.find((x) => x.key === s.key).label}: ${(s.to - s.from).toFixed(1)} s`}
            style={{ flexGrow: s.to - s.from, flexBasis: 0, minWidth: 4, background: SEG.find((x) => x.key === s.key).color, opacity: s.key === 'recovery' ? 0.55 : 0.95 }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-fg-muted">
        {SEG.filter((x) => segs.some((s) => s.key === x.key)).map((x) => (
          <span key={x.key} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: x.color }} />{x.label}</span>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        {[['Request', tl.requestedAt], ['Amber', tl.amberAt], ['Green', tl.greenAt], ['Release', tl.releasedAt]].map(([l, x]) => (
          <div key={l} className="tile py-1.5"><p className="label-caps">{l}</p><p className="font-semibold text-fg tabular-nums">{rel(x)}</p></div>
        ))}
      </div>
      <ul className="space-y-1.5">
        {checks.map((c, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            <span className={`mt-0.5 ${c.pending ? 'text-fg-faint' : c.ok ? 'text-success' : 'text-danger'}`}>
              <Icon name={c.pending ? 'clock' : c.ok ? 'check' : 'alert'} size={14} />
            </span>
            <span className={c.pending ? 'text-fg-faint' : 'text-fg-muted'}>{c.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
