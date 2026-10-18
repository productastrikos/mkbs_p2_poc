/* AI insights for the header panel, derived from corridor analytics. */
import { MOVE_LABEL } from '../evp/junctions';

const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

export function buildInsights(an, data, history) {
  const out = [];
  const top = an.ranking[0];
  if (top) {
    out.push({
      id: 'INS-ROLLOUT',
      priority: 'high',
      category: 'Rollout',
      title: `Start the 22-junction rollout at ${top.id} ${top.name}`,
      causes: [
        ['Delay', `${top.crossings} ambulance crossings with an average ${top.avgBaseWait.toFixed(0)} s red-light wait without EVP.`],
        ['Risk', `${top.incidents.ambulanceCollisions} reported ambulance collision(s), ${top.incidents.nearMisses} near misses and ${top.incidents.redLightCrossings} red-light crossings on record.`],
        ['Network', `${top.arms} approaches; peak congestion ${(top.peakCongestion * 100).toFixed(0)}%.`],
      ],
      evidence: an.ranking.slice(0, 3).map((r) => `#${r.rank} ${r.id}: delay score ${r.delayScore.toFixed(2)}, risk score ${r.riskScore.toFixed(2)}`),
      recommendations: ['Include the top 8 junctions in Phase 1 (2027)', 'Confirm SCATS phase plans and RSU mounting points with JKR', 'Brief PDRM on the corridor before go-live'],
      impact: `~${Math.round(top.savedMin)} min of ambulance waiting avoided at this junction alone`,
      actions: ['survey', 'notify'],
    });
  }

  const ped = an.junctionStats.slice().sort((a, b) => b.pedProtect - a.pedProtect)[0];
  if (ped && ped.pedProtect > 0) {
    out.push({
      id: 'INS-PED',
      priority: 'medium',
      category: 'Safety',
      title: `${ped.id} often waits for pedestrian clearance before the EVP green`,
      causes: [
        ['Rule', 'A pedestrian walk that has started is never cut short, so the transition waits for clearance.'],
        ['Site', `${ped.pedProtect} of ${ped.crossings} pre-emptions at ${ped.name} were held for a crossing.`],
      ],
      evidence: [`Average green lead at ${ped.id}: ${ped.avgGreenLead.toFixed(1)} s`, `Pre-emption rate ${(ped.preemptRate * 100).toFixed(0)}%`],
      recommendations: ['Keep the advance-approach notice at 60 s so new pedestrian calls are held', 'Ask JKR to review the pedestrian clearance time at this site'],
      impact: 'Fewer late greens without shortening any pedestrian crossing',
      actions: ['task', 'notify'],
    });
  }

  const cross = history.flatMap((t) => t.junctions.map((c) => ({ ...c, rain: t.rain })));
  const wet = avg(cross.filter((c) => c.rain && c.etaMae != null).map((c) => c.etaMae));
  const dry = avg(cross.filter((c) => !c.rain && c.etaMae != null).map((c) => c.etaMae));
  if (wet && dry) {
    out.push({
      id: 'INS-RAIN',
      priority: 'medium',
      category: 'AI model',
      title: `ETA error was ${((wet / dry - 1) * 100).toFixed(0)}% higher in rain under the v0 physics model`,
      causes: [
        ['Cause', 'Rain lowers speeds and raises congestion, which a distance ÷ speed estimate does not capture.'],
        ['Fix', 'The gradient-boosted model uses rain and live congestion as features and retrains after every trip.'],
      ],
      evidence: [`v0 mean ETA error: ${dry.toFixed(1)} s dry, ${wet.toFixed(1)} s in rain`, `Current model holdout MAE: see Analytics → Models & learning`],
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
    out.push({
      id: 'INS-MOVE',
      priority: 'low',
      category: 'Movement prediction',
      title: `Crews often leave the planned route at ${jid}`,
      causes: [
        ['Pattern', `${n} trips took a different movement at ${j?.name}, e.g. ${MOVE_LABEL[sample.actual]} instead of ${MOVE_LABEL[sample.planned]}.`],
        ['Effect', 'Movement probability drops below 0.8 there, so EVP requests a phase covering both movements.'],
      ],
      evidence: [`${devTrips.length} route deviations across ${history.length} trips`],
      recommendations: ['Share the preferred corridor with ambulance crews', 'Review the navigation route weights near this junction'],
      impact: 'Fewer exclusive-phase requests, less disruption to cross traffic',
      actions: ['notify'],
    });
  }
  return out;
}
