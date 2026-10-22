/* AI insights for the header panel.
   buildInsights: recommendations from corridor analytics (pilot data).
   liveAdvisories: what needs the duty operator now, from the running twin.
   Each insight is only produced when the data supports it, and its wording
   follows the numbers (no fixed claims). */
import { MOVE_LABEL } from '../evp/junctions';
import { fmtLocal } from '../evp/reports';

const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const pct = (x) => `${Math.round(x * 100)}%`;

export function buildInsights(an, data, history, modelInfo) {
  const out = [];
  const period = an.period ? `${fmtLocal(an.period.from, false)} – ${fmtLocal(an.period.to, false)}` : 'the pilot period';
  const top = an.ranking[0];
  if (top) {
    out.push({
      id: 'INS-ROLLOUT',
      priority: 'high',
      category: 'Rollout',
      title: `Start the 22-junction rollout at ${top.id} ${top.name}`,
      junctionId: top.id,
      causes: [
        ['Delay', `${top.crossings} ambulance crossings in the pilot data (${top.perMonth.toFixed(0)} a month) with an average ${top.avgBaseWait.toFixed(0)} s red-light wait without EVP.`],
        ['Risk', `${top.incidents.ambulanceCollisions} reported ambulance collision(s), ${top.incidents.nearMisses} near misses and ${top.incidents.redLightCrossings} red-light crossings on record.`],
        ['Network', `${top.arms} approaches; peak weekday congestion ${pct(top.peakCongestion)}.`],
      ],
      evidence: an.ranking.slice(0, 3).map((r) => `#${r.rank} ${r.id}: delay score ${r.delayScore.toFixed(2)}, risk score ${r.riskScore.toFixed(2)}, combined ${r.score.toFixed(2)}`),
      recommendations: [`Include the top 8 junctions (${an.ranking.slice(0, 8).map((r) => r.id).join(', ')}) in Phase 1 (2027)`, 'Confirm SCATS phase plans and RSU mounting points with JKR', 'Brief PDRM on the corridor before go-live'],
      impact: `About ${Math.round(top.savedMin)} min of ambulance red-light waiting avoided at ${top.id} over ${period}`,
      actions: ['survey', 'notify'],
    });
  }

  const ped = an.junctionStats.filter((s) => s.pedProtect > 0).sort((a, b) => b.pedProtect / Math.max(1, b.preempted) - a.pedProtect / Math.max(1, a.preempted))[0];
  if (ped && ped.preempted) {
    const share = ped.pedProtect / ped.preempted;
    out.push({
      id: 'INS-PED',
      priority: share >= 0.2 ? 'medium' : 'low',
      category: 'Safety',
      title: `${ped.id}: ${ped.pedProtect} of ${ped.preempted} EVP greens waited for a pedestrian crossing to finish`,
      junctionId: ped.id,
      causes: [
        ['Rule', 'A pedestrian walk that has started is never cut short, so the transition waits for clearance.'],
        ['Site', `${pct(share)} of pre-emptions at ${ped.name} were held for a crossing, the highest share of the 22 junctions (${an.kpis.pedProtect} across the corridor).`],
      ],
      evidence: [`Average green lead at ${ped.id}: ${ped.avgGreenLead.toFixed(1)} s (target 15 s)`, `Pre-empted ${pct(ped.preemptRate)} of ${ped.crossings} crossings`],
      recommendations: ['Keep the advance-approach notice at 60 s so new pedestrian calls are held', 'Ask JKR to review the pedestrian clearance time at this site'],
      impact: 'Fewer late greens without shortening any pedestrian crossing',
      actions: ['task', 'notify'],
    });
  }

  // v0 (physics) ETA error, dry vs rain, from the historical trips.
  const cross = history.flatMap((t) => t.junctions.map((c) => ({ ...c, rain: t.rain })));
  const wetXs = cross.filter((c) => c.rain && c.etaMae != null).map((c) => c.etaMae);
  const dryXs = cross.filter((c) => !c.rain && c.etaMae != null).map((c) => c.etaMae);
  const wet = avg(wetXs);
  const dry = avg(dryXs);
  if (wetXs.length >= 30 && dryXs.length >= 30) {
    const diff = wet / dry - 1;
    const current = modelInfo?.eta?.mae;
    out.push({
      id: 'INS-RAIN',
      priority: diff > 0.1 ? 'medium' : 'low',
      category: 'AI model',
      title: Math.abs(diff) < 0.05
        ? `Rain barely changed ETA error under the v0 physics model (${(diff * 100).toFixed(0)}%)`
        : `ETA error was ${Math.abs(diff * 100).toFixed(0)}% ${diff > 0 ? 'higher' : 'lower'} in rain under the v0 physics model`,
      causes: [
        ['Data', `${wetXs.length} wet-weather and ${dryXs.length} dry junction approaches in the pilot history.`],
        ['Model', diff > 0
          ? 'Rain lowers speeds and raises congestion, which a distance ÷ speed estimate does not capture.'
          : 'The v0 estimate blends current and typical speed; rain slows ambulances more evenly, so its error did not grow.'],
        ['Now', 'The gradient-boosted model uses rain and live congestion as features and retrains after every live trip.'],
      ],
      evidence: [`v0 mean ETA error: ${dry.toFixed(1)} s dry, ${wet.toFixed(1)} s in rain`, current != null ? `Current model (v${modelInfo.eta.version}) hold-out error: ${current} s` : 'Current model hold-out error: see Analytics → Models & learning'],
      recommendations: ['Keep collecting wet-weather trips (Kuching afternoon storms)', 'Review the rain feature importance monthly'],
      impact: 'Tighter ETA bands → greens closer to the 15 s target',
      actions: ['task'],
    });
  }

  const devTrips = history.filter((t) => t.deviation);
  if (devTrips.length) {
    const byJ = {};
    devTrips.forEach((t) => { byJ[t.deviation.j] = (byJ[t.deviation.j] || 0) + 1; });
    const [jid, n] = Object.entries(byJ).sort((a, b) => b[1] - a[1])[0];
    const j = data.junctions.find((x) => x.id === jid);
    const sample = devTrips.find((t) => t.deviation.j === jid).deviation;
    const stats = an.junctionStats.find((s) => s.id === jid);
    out.push({
      id: 'INS-MOVE',
      priority: 'low',
      category: 'Movement prediction',
      title: `Crews most often leave the planned route at ${jid} ${j?.name || ''}`.trim(),
      junctionId: jid,
      causes: [
        ['Pattern', `${n} of ${devTrips.length} route deviations in the pilot history were at ${jid}, e.g. ${MOVE_LABEL[sample.actual]} instead of the planned ${MOVE_LABEL[sample.planned]}.`],
        ['Effect', `When the alternative route costs about the same, movement confidence can fall below 0.8 and EVP requests a phase covering both movements.${stats?.phaseCorrections ? ` ${stats.phaseCorrections} green(s) at ${jid} had to be corrected at the stop line.` : ''}`],
      ],
      evidence: [`${devTrips.length} route deviations across ${history.length} trips`, `${an.kpis.phaseCorrections} stop-line phase corrections corridor-wide`],
      recommendations: ['Share the preferred corridor with ambulance crews', 'Review the navigation route weights near this junction'],
      impact: 'Fewer exclusive-phase requests, less disruption to cross traffic',
      actions: ['notify'],
    });
  }
  return out;
}

/** Operator advisories from the live twin (refreshed with the simulation). */
export function liveAdvisories(snap) {
  if (!snap) return [];
  const out = [];
  const open = snap.alerts.filter((a) => a.status === 'open');
  const high = open.filter((a) => a.severity === 'danger');
  snap.quarantined.forEach((vid) => {
    const alert = snap.alerts.find((a) => a.vehicleId === vid && a.status !== 'resolved');
    const trip = snap.trips.find((t) => t.vehicleId === vid);
    out.push({
      id: `LIVE-Q-${vid}`,
      priority: 'critical',
      category: 'Live · Security',
      title: `${vid} is quarantined: EVP suspended until an operator reviews it`,
      causes: [
        ['Trigger', alert ? `${alert.type}: ${alert.detail}` : 'Anomaly guard'],
        ['Now', trip ? `On ${trip.id} to ${trip.destination.short}; signals run normally for this unit.` : 'Not on a trip.'],
      ],
      evidence: [`${open.filter((a) => a.vehicleId === vid).length} open alert(s) for ${vid}`],
      recommendations: ['Call the crew to confirm position and OBU status', 'Reinstate only after the cause is explained'],
      link: { to: '/security', label: 'Review on Alerts & Security' },
      actions: [],
    });
  });
  if (high.length && !snap.quarantined.length) {
    out.push({
      id: 'LIVE-ALERTS',
      priority: 'high',
      category: 'Live · Security',
      title: `${high.length} high-severity security alert(s) not yet acknowledged`,
      causes: high.slice(0, 3).map((a) => [a.vehicleId || a.obuId, `${a.type}${a.count > 1 ? ` (×${a.count})` : ''}`]),
      evidence: [`${open.length} open alert(s) in total`],
      recommendations: ['Acknowledge each alert once reviewed; resolve it when no follow-up is needed'],
      link: { to: '/security', label: 'Open the alert queue' },
      actions: [],
    });
  }
  snap.trips.filter((t) => t.evpSuspended && !snap.quarantined.includes(t.vehicleId)).forEach((t) => {
    out.push({
      id: `LIVE-S-${t.id}`,
      priority: 'high',
      category: 'Live · Trip',
      title: `${t.vehicleId} (${t.priority}) is driving without EVP after an anomaly`,
      causes: [['Trip', `${t.id} to ${t.destination.short}, ${(t.remaining / 1000).toFixed(1)} km left`]],
      evidence: ['The guard suspended EVP on this trip'],
      recommendations: ['Confirm the unit by radio', 'Reinstate on Alerts & Security if the fix was a false alarm'],
      link: { to: '/security', label: 'Review on Alerts & Security' },
      actions: [],
    });
  });
  const longRecovery = Object.entries(snap.junctions).filter(([, s]) => s.mode === 'RECOVERY' && s.recovery && s.totalQueue > (s.normalQueue || 0) * 1.8 + 10);
  longRecovery.slice(0, 2).forEach(([jid, s]) => {
    out.push({
      id: `LIVE-R-${jid}`,
      priority: 'medium',
      category: 'Live · Signals',
      title: `${jid} is still clearing queues after a pre-emption`,
      causes: [['Queue', `${s.totalQueue} vehicles queued against a normal ${s.normalQueue ?? '–'}; recovery cycle ${s.recovery.cycle} of ${s.recovery.of}.`]],
      evidence: ['SCATS recovery sizes greens to the queues built up during the hold'],
      recommendations: ['Watch for a second ambulance on this corridor; a new request would extend the disruption'],
      link: { to: `/junctions/${jid}`, label: `Open ${jid}` },
      actions: [],
    });
  });
  return out;
}
