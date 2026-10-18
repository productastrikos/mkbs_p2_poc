/* Report payloads for the LLM, and offline template versions used when no
   LLM is configured. Payloads hold only facts the model may cite. */
import { MOVE_LABEL } from './junctions.js';
import { TZ_OFFSET_MS } from './traffic.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtLocal(ms, withTime = true) {
  const d = new Date(ms + TZ_OFFSET_MS);
  const date = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return withTime ? `${date}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` : date;
}
export const monthLabel = (key) => { const [y, m] = key.split('-'); return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][+m - 1]} ${y}`; };
const OVERRIDE_TEXT = {
  MAX_HOLD: '45 s maximum hold reached; released to SCATS',
  CANCEL_STOP: 'request cancelled: ambulance stopped > 20 s',
  CANCEL_DIVERT: 'request cancelled: ambulance left the route > 20 s',
  BLOCKED: 'request blocked by the authorisation guard',
  PHASE_CORRECTION: 'phase corrected after green',
  QUARANTINE: 'request cancelled: vehicle quarantined by anomaly guard',
};

export function tripReportPayload(trip, { junctions, hospitals, ambulances = [] }) {
  const jById = new Map(junctions.map((j) => [j.id, j]));
  const amb = ambulances.find((a) => a.id === trip.ambulanceId);
  return {
    tripId: trip.id,
    ambulance: { id: trip.ambulanceId, operator: amb?.operator, plate: amb?.plate },
    priority: trip.priority,
    status: trip.status === 'TO_HOSPITAL' ? 'To hospital' : trip.status === 'TO_PATIENT' ? 'To patient' : trip.status,
    from: trip.origin,
    to: trip.destinationName || hospitals.find((h) => h.id === trip.destination)?.name || trip.destination,
    started: fmtLocal(trip.start),
    weather: trip.rain ? 'Rain' : 'Dry',
    distanceKm: Math.round(trip.length / 100) / 10,
    durationS: Math.round(trip.duration),
    noEvpBaselineS: Math.round(trip.baseline),
    secondsSaved: Math.round(trip.saved),
    conflictingMovementsAvoided: trip.conflictsAvoided,
    fuelSavedL: trip.fuelSavedL,
    junctions: trip.junctions.map((c) => {
      const j = jById.get(c.j);
      return {
        id: c.j, name: j?.name, scatsSite: j?.scatsSite, approach: `${c.arm} (${j?.arms.find((a) => a.id === c.arm)?.road || 'unnamed road'})`,
        movement: MOVE_LABEL[c.move], preempted: c.preempted, phase: c.phase, phaseRule: c.phaseRule,
        greenBeforeArrivalS: c.greenLead, waitS: c.wait, noEvpWaitS: c.baseWait, savedS: Math.round((c.baseWait - c.wait) * 10) / 10,
        pedestrianProtectionS: c.pedProtect || 0, conflict: c.conflict ? `yes${c.yieldTo ? ` (yielded to ${c.yieldTo})` : ''}` : 'no',
        safetyOverride: c.override ? OVERRIDE_TEXT[c.override] || c.override : null, etaErrorS: c.etaMae,
      };
    }),
    anomalies: trip.anomalies || [],
    routeDeviation: trip.deviation ? `Took ${MOVE_LABEL[trip.deviation.actual]} instead of planned ${MOVE_LABEL[trip.deviation.planned]} at ${trip.deviation.j}` : null,
    modelVersions: trip.models,
    source: trip.source === 'live' ? 'Live simulation' : 'Historical simulated trip',
  };
}

export function offlineTripReport(trip, ctx) {
  const p = tripReportPayload(trip, ctx);
  const pre = p.junctions.filter((c) => c.preempted).length;
  const overrides = p.junctions.filter((c) => c.safetyOverride);
  const ped = p.junctions.filter((c) => c.pedestrianProtectionS > 0);
  const leads = p.junctions.map((c) => c.greenBeforeArrivalS).filter((x) => x != null);
  const lines = [
    `# Post-trip report: ${p.tripId}`,
    '',
    `**${p.ambulance.id}** (${p.ambulance.operator || 'operator n/a'}) · ${p.priority} · ${p.status} · ${p.started} · ${p.weather}`,
    '',
    '## Summary',
    `- Route: ${p.from} → ${p.to}, ${p.distanceKm} km in ${Math.floor(p.durationS / 60)} min ${p.durationS % 60} s.`,
    `- ${pre} of ${p.junctions.length} EVP junctions pre-empted${leads.length ? `; green came on an average of ${(leads.reduce((s, x) => s + x, 0) / leads.length).toFixed(1)} s before arrival (target 15 s)` : ''}.`,
    `- Estimated time saved against the no-EVP baseline: **${p.secondsSaved} s** (baseline ${p.noEvpBaselineS} s).`,
    `- Conflicting movements avoided: ${p.conflictingMovementsAvoided}. Fuel saved: ${p.fuelSavedL} L.`,
    '',
    '## Junctions',
    '| Junction | Movement | Phase | Green lead | Wait (EVP / baseline) |',
    '|---|---|---|---|---|',
    ...p.junctions.map((c) => `| ${c.id} ${c.name} | ${c.movement} from ${c.approach} | ${c.phase || 'n/a'} | ${c.greenBeforeArrivalS ?? 'n/a'} s | ${c.waitS} s / ${c.noEvpWaitS} s |`),
    '',
    '## Safety',
    overrides.length ? overrides.map((c) => `- ${c.id}: ${c.safetyOverride}.`).join('\n') : '- No safety overrides. All transitions used 3 s amber and 2 s all-red, holds stayed under 45 s.',
    ped.length ? ped.map((c) => `- ${c.id}: transition waited ${c.pedestrianProtectionS} s for a pedestrian crossing to finish.`).join('\n') : '- No pedestrian crossings had to be protected.',
    p.anomalies.length ? `- Anomaly guard: ${p.anomalies.map((a) => a.type).join(', ')}.` : '- No GPS or authorisation anomalies.',
    p.routeDeviation ? `- Route deviation: ${p.routeDeviation}.` : '',
    '',
    '_Generated from the offline template (no LLM configured)._',
  ];
  return lines.filter((l) => l !== '').join('\n').replace(/\n## /g, '\n\n## ').replace(/\n\| Junction/, '\n\n| Junction');
}

export function offlineMonthlySummary(digest, audience) {
  const m = digest.month;
  const mt = digest.monthly.find((x) => x.month === m?.month);
  const focus = {
    JKR: 'Signal operations: pre-emption performance, SCATS recovery and the rollout order.',
    JKNS: 'Ambulance response: time saved per trip and by hospital.',
    PDRM: 'Road safety: conflicting movements avoided, priority conflicts and security alerts.',
  }[audience] || '';
  const topJ = (m?.junctions || []).slice(0, 3);
  return [
    `# GreenLight EVP monthly summary: ${monthLabel(m.month)}`,
    `**For:** ${audience} · ${focus}`,
    '',
    '## Key figures',
    `- Trips: ${mt?.trips ?? 0}; average trip ${mt?.avgDuration ?? 'n/a'} s against a no-EVP baseline of ${mt?.avgBaseline ?? 'n/a'} s.`,
    `- Average time saved per trip: **${mt?.avgSaved ?? 'n/a'} s**.`,
    `- All-time: ${digest.kpis.trips} trips, ${digest.kpis.preemptedPct}% of junction crossings pre-empted, ${digest.kpis.conflictingMovementsAvoided} conflicting movements avoided.`,
    '',
    '## Junctions with most baseline delay this month',
    ...topJ.map((j) => `- ${j.id} ${j.name}: ${j.baselineWaitS} s of red-light waiting avoided over ${j.crossings} crossings (residual ${j.residualWaitS} s).`),
    '',
    '## Rollout priority (top 5)',
    ...digest.rolloutTop10.slice(0, 5).map((r) => `${r.rank}. ${r.id} ${r.name} (${r.phase})`),
    '',
    '## Security',
    `- ${digest.security.alerts} alerts this session${Object.keys(digest.security.byType).length ? `: ${Object.entries(digest.security.byType).map(([k, v]) => `${k} ×${v}`).join(', ')}` : ''}.`,
    '',
    '_Generated from the offline template (no LLM configured)._',
  ].join('\n');
}

/** Rule-based answers when no LLM is available. */
export function offlineAnswer(question, d) {
  const q = question.toLowerCase();
  const hosp = d.byHospital.find((h) => q.includes(h.id.toLowerCase()) || q.includes(h.name.toLowerCase()));
  if (hosp && /sav|time|faster/.test(q)) {
    return `For trips to ${hosp.name} (${hosp.id}), EVP saved an average of ${hosp.avgSaved} s per trip over ${hosp.trips} trips: ${hosp.totalSavedMin} minutes in total against the no-EVP baseline.`;
  }
  if (/delay|worst|most/.test(q) && /junction/.test(q)) {
    const list = /month/.test(q) && d.month?.junctions?.length ? d.month.junctions : d.junctionsAllTime.slice().sort((a, b) => b.avgBaselineWaitS * b.crossings - a.avgBaselineWaitS * a.crossings).map((j) => ({ ...j, baselineWaitS: Math.round(j.avgBaselineWaitS * j.crossings) }));
    const top = list[0];
    return top
      ? `${top.id} ${top.name} caused the most red-light delay${/month/.test(q) && d.month ? ` in ${monthLabel(d.month.month)}` : ''}: ${top.baselineWaitS} s of waiting over ${top.crossings} ambulance crossings without EVP${top.residualWaitS != null ? `, cut to ${top.residualWaitS} s with EVP` : ''}.`
      : 'No junction crossings recorded for that period.';
  }
  if (/rollout|priorit|first/.test(q)) return `Rollout order (top 5): ${d.rolloutTop10.slice(0, 5).map((r) => `${r.rank}. ${r.id} ${r.name}`).join('; ')}.`;
  if (/conflict/.test(q)) return `${d.kpis.priorityConflictsResolved} priority conflicts were resolved and ${d.kpis.conflictingMovementsAvoided} conflicting movements avoided.`;
  if (/alert|spoof|security|block/.test(q)) return `${d.security.alerts} security alerts this session${Object.keys(d.security.byType).length ? `: ${Object.entries(d.security.byType).map(([k, v]) => `${k} ×${v}`).join(', ')}` : ''}.`;
  if (/cost|budget|benefit|payback/.test(q)) return `Against the RM2.0M budget, estimated benefits are RM${(d.costBenefit.benefitPerYearRM / 1e6).toFixed(2)}M per year at full rollout; payback in ${d.costBenefit.paybackYear || 'after 2030'} under the current assumptions.`;
  return `Across ${d.kpis.trips} trips EVP saved ${d.kpis.avgSecondsSavedPerTrip} s per trip on average (${d.kpis.reductionPct}% of baseline trip time). Ask about a junction, hospital, month, conflicts, security or cost-benefit. (Offline mode: connect an LLM for open questions.)`;
}
