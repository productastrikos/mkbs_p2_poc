/* Headless acceptance checks for the prototype's "done when" criteria.
 *
 *   node scripts/acceptance.mjs
 *
 * Trains the models on the historical trips exactly as the browser does,
 * then drives the engine through each scenario and asserts the outcome. */
import { loadData, readJson } from './lib/node-data.mjs';
import { SimEngine } from '../src/evp/engine/simulation.js';
import { EtaModel, MovementModel, AnomalyModel } from '../src/evp/ml/models.js';
import * as S from '../src/evp/engine/scenarios.js';
import { ALERT_TYPES } from '../src/evp/engine/guard.js';
import { buildAnalytics } from '../src/evp/analytics.js';
import { offlineTripReport } from '../src/evp/reports.js';

const data = loadData();
const { trips } = readJson('trips');
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };

const eta = new EtaModel();
await eta.train(trips, { async: false });
const movement = new MovementModel();
movement.train(trips);
const anomaly = new AnomalyModel();
anomaly.train(readJson('gps-fixes').rows);
const models = { eta, movement, anomaly };
console.log(`Models: ETA MAE ${eta.meta.mae} s, movement accuracy ${(movement.meta.accuracy * 100).toFixed(1)}%, anomaly threshold ${anomaly.meta.threshold}\n`);

function fresh(seed, hourUtc = 2) {
  const e = new SimEngine({ data, models, seed, startMs: Date.UTC(2026, 9, 15, hourUtc, 0) });
  for (let i = 0; i < 600; i++) e.step(0.5);
  return e;
}
function runUntil(e, done, maxS = 1800) {
  const end = e.t + maxS;
  while (e.t < end && !done()) e.step(0.1);
}

/* 1. SGH run: green ~15 s before arrival, correct direction, amber/all-red, recovery. */
{
  const e = fresh(11);
  const res = S.sghRun(e);
  const recs = [];
  e.onTripComplete = (r) => recs.push(r);
  runUntil(e, () => recs.length > 0);
  runUntil(e, () => [...e.controllers.values()].every((c) => c.mode === 'ADAPTIVE'), 600);
  const r = recs[0];
  const js = r?.junctions || [];
  const leads = js.map((c) => c.greenLead).filter((x) => x != null);
  const meanLead = leads.reduce((s, x) => s + x, 0) / Math.max(1, leads.length);
  check('SGH run completes with route through EVP junctions', Boolean(r) && js.length >= 4, `${res.message}; ${js.length} junctions, ${Math.round(r?.duration)} s, ${Math.round(r?.saved)} s saved`);
  check('Every junction pre-empted (green before arrival)', js.every((c) => c.preempted && c.wait < 1), js.map((c) => `${c.j}:${c.greenLead}s`).join(' '));
  check('Green lead ≈ 15 s', meanLead >= 11 && meanLead <= 19, `mean ${meanLead.toFixed(1)} s`);
  const histories = js.map((c) => e.controllers.get(c.j).history.find((p) => p.vehicleId === r.ambulanceId)).filter(Boolean);
  const dirOk = js.every((c) => {
    const ph = e.junctionsById.get(c.j).phases.find((p) => p.id === c.phase);
    return ph && ph.moves.some(([a, m]) => a === c.arm && m === c.move);
  });
  check('Requested phase serves the actual movement', dirOk, js.map((c) => `${c.j} ${c.arm}-${c.move}→${c.phase}`).join(', '));
  const transitions = histories.filter((p) => !p.alreadyGreen);
  const safe = transitions.every((p) => p.timeline.amberAt != null && p.timeline.allRedAt != null
    && Math.abs(p.timeline.allRedAt - p.timeline.amberAt - 3) < 0.25 && Math.abs(p.timeline.greenAt - p.timeline.allRedAt - 2) < 0.25);
  check('Phase changes use 3 s amber + 2 s all-red', safe, `${transitions.length} transitions checked, ${histories.length - transitions.length} already green (held)`);
  check('Holds ≤ 45 s', histories.every((p) => p.holdS <= 45), histories.map((p) => `${p.holdS}s`).join(' '));
  check('SCATS recovery clears queues then returns to adaptive', histories.every((p) => p.timeline.recoveryStartAt != null && p.timeline.recoveryEndAt != null && p.recovery.queueAtEnd <= p.recovery.normalQueue * 1.35 + 3), histories.map((p) => p.recovery ? `peak ${p.recovery.peakQueue} → last-cycle mean ${p.recovery.queueAtEnd} veh (normal ${p.recovery.normalQueue}) in ${p.recovery.cycles} cycle(s)` : 'none').join(', '));
}

/* 2. Conflict resolved by priority. */
{
  const e = fresh(12);
  const res = S.conflict(e);
  const recs = [];
  e.onTripComplete = (r) => recs.push(r);
  runUntil(e, () => recs.length >= 2, 1200);
  const jid = res.junctionId;
  const crit = recs.find((r) => r.priority === 'Critical')?.junctions.find((c) => c.j === jid);
  const urg = recs.find((r) => r.priority === 'Urgent')?.junctions.find((c) => c.j === jid);
  const conflictLogged = e.events.some((ev) => /Conflict at/.test(ev.text));
  check('Conflict detected and logged', res.ok && conflictLogged, res.message);
  check('Critical ambulance served first', crit && urg && crit.pass < urg.pass + (recs.find((r) => r.priority === 'Urgent').start - recs.find((r) => r.priority === 'Critical').start) / 1000 && crit.wait < 1, `Critical wait ${crit?.wait}s, Urgent wait ${urg?.wait}s`);
}

/* 3. Spoofed GPS jump and unregistered vehicle blocked + flagged. */
{
  const e = fresh(13);
  S.spoof(e);
  runUntil(e, () => e.alerts.some((a) => a.type === ALERT_TYPES.SPEED_JUMP), 60);
  const a = e.alerts.find((x) => x.type === ALERT_TYPES.SPEED_JUMP);
  check('GPS spoof flagged and vehicle quarantined', Boolean(a) && e.guard.quarantined.has(a.vehicleId), a?.detail);
  runUntil(e, () => false, 30);
  check('No grants held by the quarantined vehicle', ![...e.decision.grants.values()].some((g) => g.vehicleId === a?.vehicleId));
  S.unregistered(e);
  const u = e.alerts.find((x) => x.type === ALERT_TYPES.UNREGISTERED);
  check('Unregistered vehicle request blocked', Boolean(u) && /blocked/i.test(u.action), u?.detail);
  S.misuse(e);
  check('Repeated requests outside a trip flagged', e.alerts.some((x) => x.type === ALERT_TYPES.REPEATED_OUTSIDE_TRIP));
  S.noPatientStatus(e);
  runUntil(e, () => e.alerts.some((x) => x.type === ALERT_TYPES.NO_PATIENT_STATUS), 400);
  check('Request without patient status blocked', e.alerts.some((x) => x.type === ALERT_TYPES.NO_PATIENT_STATUS));
}

/* 4. Stop / divert cancellation. */
{
  const e = fresh(14);
  const res = S.sghRun(e, { priority: 'Urgent' });
  const trip = e.trips.get(res.tripIds[0]);
  runUntil(e, () => trip.crossings.some((c) => c.request === 'SENT' || c.request === 'GREEN'), 400);
  e.stopVehicle(trip.vehicleId, 40);
  runUntil(e, () => trip.crossings.some((c) => c.override === 'CANCEL_STOP'), 60);
  check('Request cancelled when ambulance stops > 20 s', trip.crossings.some((c) => c.override === 'CANCEL_STOP'));
  runUntil(e, () => !trip.active || trip.crossings.some((c) => !c.passed && c.dStop - trip.dEst > 300), 300);
  const ok = e.divert(trip.vehicleId);
  runUntil(e, () => trip.overrides.some((o) => o.code === 'CANCEL_DIVERT') || !trip.active, 200);
  check('Request cancelled / route updated when ambulance diverts > 20 s', ok && trip.overrides.some((o) => o.code === 'CANCEL_DIVERT'));
}

/* 5. Analytics and report. */
{
  const a = buildAnalytics({ trips, junctions: data.junctions, hospitals: data.hospitals });
  check('Analytics: seconds saved per trip', a.kpis.avgSavedS > 0, `${a.kpis.avgSavedS.toFixed(1)} s/trip over ${a.kpis.trips} trips`);
  check('Analytics: 22 junctions ranked', a.ranking.length === 22 && a.ranking[0].rank === 1, a.ranking.slice(0, 3).map((r) => `${r.rank}. ${r.id} ${r.name}`).join(' | '));
  const rep = offlineTripReport(trips[0], { junctions: data.junctions, hospitals: data.hospitals });
  check('Post-trip report (offline template) generated', rep.length > 200, `${rep.length} chars`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
