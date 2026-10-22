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
export const OVERRIDE_TEXT = {
  MAX_HOLD: '45 s maximum hold reached; released to SCATS',
  CANCEL_STOP: 'request cancelled: ambulance stopped > 20 s',
  CANCEL_DIVERT: 'request cancelled: ambulance left the route > 20 s',
  BLOCKED: 'request blocked by the authorisation guard',
  PHASE_CORRECTION: 'phase corrected: the ambulance took a different movement than predicted',
  QUARANTINE: 'request cancelled: vehicle quarantined by anomaly guard',
};
const fmtDur = (s) => `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;

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
    outcome: trip.arrived === false ? `Ended before arrival (${trip.endReason})` : 'Arrived at destination',
    distanceKm: Math.round(trip.length / 100) / 10,
    durationS: Math.round(trip.duration),
    noEvpBaselineS: Math.round(trip.baseline),
    secondsSaved: Math.round(trip.saved),
    conflictingMovementsAvoided: trip.conflictsAvoided,
    conflictingMovementsDefinition: 'junctions where the ambulance would have met a red without EVP but passed without stopping',
    fuelSavedL: trip.fuelSavedL,
    junctions: trip.junctions.map((c) => {
      const j = jById.get(c.j);
      return {
        id: c.j, name: j?.name, scatsSite: j?.scatsSite, approach: `${c.arm} (${j?.arms.find((a) => a.id === c.arm)?.road || 'unnamed road'})`,
        movement: MOVE_LABEL[c.move], preempted: c.preempted, phase: c.phase, phaseRule: c.phaseRule,
        greenBeforeArrivalS: c.greenLead, waitS: c.wait, noEvpWaitS: c.baseWait, savedS: Math.round((c.baseWait - c.wait) * 10) / 10,
        pedestrianProtectionS: c.pedProtect || 0,
        conflict: c.yieldTo ? `yes: yielded to ${c.yieldTo}` : c.priorityOver ? `yes: had priority over ${c.priorityOver}` : 'no',
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
  const leads = p.junctions.filter((c) => c.preempted).map((c) => c.greenBeforeArrivalS).filter((x) => x != null);
  const conflicts = p.junctions.filter((c) => c.conflict !== 'no');
  const lead = (x) => (x == null ? 'n/a' : x >= 0 ? `${x} s before` : `${Math.abs(x)} s after`);
  const lines = [
    `# Post-trip report: ${p.tripId}`,
    '',
    `**${p.ambulance.id}** (${p.ambulance.operator || 'operator n/a'}) · ${p.priority} · ${p.status} · ${p.started} · ${p.weather}`,
    '',
    '## Summary',
    `- Route: ${p.from} → ${p.to}, ${p.distanceKm} km in ${fmtDur(p.durationS)}${trip.arrived === false ? ` (${p.outcome.toLowerCase()})` : ''}.`,
    p.junctions.length
      ? `- ${pre} of ${p.junctions.length} EVP junctions pre-empted${leads.length ? `; at pre-empted junctions the green came on an average of ${(leads.reduce((s, x) => s + x, 0) / leads.length).toFixed(1)} s before arrival (target 15 s)` : ''}.`
      : '- The route crossed none of the 22 EVP junctions, so no greens were requested.',
    `- Time saved against the no-EVP baseline: **${p.secondsSaved} s** (${fmtDur(p.durationS)} with EVP vs ${fmtDur(p.noEvpBaselineS)} without).`,
    `- Red-light stops avoided (conflicting movements): ${p.conflictingMovementsAvoided}. Fuel saved: ${p.fuelSavedL} L.`,
    '',
    ...(p.junctions.length ? [
      '## Junctions',
      '| Junction | Movement | Phase | Green vs arrival | Wait (EVP / no EVP) |',
      '|---|---|---|---|---|',
      ...p.junctions.map((c) => `| ${c.id} ${c.name} | ${c.movement} from ${c.approach} | ${c.phase || 'none'}${c.preempted ? '' : ' (not pre-empted)'} | ${lead(c.greenBeforeArrivalS)} | ${c.waitS} s / ${c.noEvpWaitS} s |`),
      '',
    ] : []),
    '## Safety',
    overrides.length ? overrides.map((c) => `- ${c.id}: ${c.safetyOverride}.`).join('\n') : '- No safety overrides. Every transition used 3 s amber and 2 s all-red, and no hold reached 45 s.',
    ped.length ? ped.map((c) => `- ${c.id}: transition waited ${c.pedestrianProtectionS} s for a pedestrian crossing to finish.`).join('\n') : '- No pedestrian crossing had to be protected.',
    conflicts.length ? conflicts.map((c) => `- ${c.id}: priority conflict, ${c.conflict.replace(/^yes: /, '')}.`).join('\n') : '- No priority conflicts with other ambulances.',
    p.anomalies.length ? `- Anomaly guard: ${[...new Set(p.anomalies.map((a) => a.type))].join(', ')}.` : '- No GPS or authorisation anomalies.',
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
  const partial = digest.period && m && (digest.period.to.slice(0, 7) === m.month || digest.period.from.slice(0, 7) === m.month);
  const cb = digest.costBenefit;
  return [
    `# GreenLight EVP monthly summary: ${monthLabel(m.month)}`,
    `**For:** ${audience} · ${focus}`,
    '',
    '## Key figures',
    `- Trips: ${mt?.trips ?? 0}${partial ? ' (part month: pilot data ends or starts within it)' : ''}; average trip ${fmtDur(mt?.avgDuration ?? 0)} with EVP against a no-EVP baseline of ${fmtDur(mt?.avgBaseline ?? 0)}.`,
    `- Average time saved per trip: **${mt?.avgSaved ?? 'n/a'} s**; ${mt?.preempted ?? 0} junction crossings pre-empted.`,
    `- Pilot to date: ${digest.kpis.trips} trips, ${digest.kpis.preemptedPct}% of junction crossings pre-empted, ${digest.kpis.conflictingMovementsAvoided} red-light stops avoided, ${digest.kpis.priorityConflictsResolved} priority conflicts resolved.`,
    '',
    '## Junctions with most no-EVP delay this month',
    ...(topJ.length
      ? topJ.map((j) => `- ${j.id} ${j.name}: ${j.crossings} crossings, ${j.baselineWaitS} s of red-light waiting without EVP cut to ${j.residualWaitS} s with EVP.`)
      : ['- No junction crossings recorded this month.']),
    '',
    '## Rollout priority (top 5)',
    ...digest.rolloutTop10.slice(0, 5).map((r) => `${r.rank}. ${r.id} ${r.name} (${r.phase})`),
    '',
    '## Cost and benefit',
    `- Budget RM${(cb.budgetRM / 1e6).toFixed(1)}M (2027–2030); estimated benefit RM${(cb.benefitPerYearRM / 1e6).toFixed(2)}M a year at full rollout, RM${(cb.cumulativeBenefitBy2030RM / 1e6).toFixed(2)}M cumulative by 2030 (${cb.benefitToBudgetRatio}× the budget). ${cb.paybackYear ? `Pays back in ${cb.paybackYear}.` : 'Does not pay back by 2030 under the current assumptions.'}`,
    '',
    '## Security (live session)',
    `- ${digest.security.alerts} alert(s) in this session${Object.keys(digest.security.byType).length ? `: ${Object.entries(digest.security.byType).map(([k, v]) => `${k} ×${v}`).join(', ')}` : ''}; ${digest.security.open} still open${digest.security.quarantinedUnits.length ? `; quarantined: ${digest.security.quarantinedUnits.join(', ')}` : ''}.`,
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
  if (/rollout|first|phase 1|which \d+ junctions/.test(q)) {
    const n = Math.min(10, Number((q.match(/\b(\d{1,2})\b/) || [])[1]) || 8);
    const top = d.rolloutTop10.slice(0, n);
    return [
      `Top ${top.length} for the rollout (score = 0.55 × delay exposure + 0.45 × collision risk):`,
      ...top.map((r) => `${r.rank}. **${r.id} ${r.name}** (${r.phase}): delay score ${r.delayScore}, risk score ${r.riskScore}; ${r.collisions} ambulance collision(s), ${r.nearMisses} near misses on record.`),
    ].join('\n');
  }
  if (/conflict/.test(q)) {
    return `${d.kpis.priorityConflictsResolved} priority conflict(s) between ambulances were resolved in the pilot data. The rule: the higher patient priority goes first (Critical > Urgent > Non-urgent), then the nearer ETA; an ambulance within 4 s of the stop line is never overtaken. The other ambulance is shown "HOLD: yielding" and gets its green once the junction is released. Separately, ${d.kpis.conflictingMovementsAvoided} red-light stops (conflicting movements) were avoided.`;
  }
  if (/alert|spoof|security|block|quarantin/.test(q)) {
    const s = d.security;
    if (!s.alerts) return 'No security alerts in this live session. Use Alerts & Security → "Test the guard" to try a GPS spoof, an unregistered vehicle or misuse.';
    return `${s.alerts} security alert(s) in this live session${Object.keys(s.byType).length ? `: ${Object.entries(s.byType).map(([k, v]) => `${k} ×${v}`).join(', ')}` : ''}. ${s.open} still open.${s.quarantinedUnits.length ? ` Quarantined (EVP suspended until an operator reinstates them): ${s.quarantinedUnits.join(', ')}.` : ' No unit is quarantined.'} Every flagged request was blocked; spoofing and repeated misuse quarantine the unit and release any green it held.`;
  }
  if (/cost|budget|benefit|payback|pay back/.test(q)) {
    const cb = d.costBenefit;
    return `Against the RM2.0M budget (2027–2030), estimated benefits are RM${(cb.benefitPerYearRM / 1e6).toFixed(2)}M a year at full rollout and RM${(cb.cumulativeBenefitBy2030RM / 1e6).toFixed(2)}M cumulative by 2030 (${cb.benefitToBudgetRatio}× the budget). ${cb.paybackYear ? `It pays back in ${cb.paybackYear}` : 'It does not pay back by 2030'} under the current assumptions; these leave out the clinical value of faster arrival. Edit them on Analytics → Cost / benefit.`;
  }
  return `Across ${d.kpis.trips} pilot trips EVP saved ${d.kpis.avgSecondsSavedPerTrip} s per trip on average (${d.kpis.reductionPct}% of the no-EVP trip time). Ask about a junction, hospital, month, conflicts, security or cost-benefit. (Offline mode: connect an LLM for open questions.)`;
}
