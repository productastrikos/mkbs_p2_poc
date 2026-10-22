/* Headless acceptance checks for the prototype's "done when" criteria.
 *
 *   node scripts/acceptance.mjs
 *
 * Trains the models on the historical trips exactly as the browser does,
 * then drives the engine through each scenario and asserts the outcome. */
import fs from 'node:fs';
import path from 'node:path';
import { loadData, readJson, DATA_DIR } from './lib/node-data.mjs';
import { SimEngine } from '../src/evp/engine/simulation.js';
import { FleetOps } from '../src/evp/engine/operations.js';
import { EtaModel, MovementModel, AnomalyModel, RouteMovement } from '../src/evp/ml/models.js';
import * as S from '../src/evp/engine/scenarios.js';
import { ALERT_TYPES } from '../src/evp/engine/guard.js';
import { phaseCovering, phaseServes } from '../src/evp/junctions.js';
import { buildAnalytics } from '../src/evp/analytics.js';
import { offlineTripReport } from '../src/evp/reports.js';
import { Rng } from '../src/evp/rng.js';

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
  const jumps = e.alerts.filter((x) => x.type === ALERT_TYPES.SPEED_JUMP);
  check('One spoofed fix raises one alert (the jump back is not a second alert)', jumps.length === 1 && jumps[0].count === 1, `${jumps.length} alert(s), count ${jumps[0]?.count}`);
  const blocked0 = e.guard.stats.requestsBlocked;
  S.unregistered(e);
  const u = e.alerts.find((x) => x.type === ALERT_TYPES.UNREGISTERED);
  check('Unregistered vehicle request blocked', Boolean(u) && /blocked/i.test(u.action), u?.detail);
  S.misuse(e);
  runUntil(e, () => e.alerts.some((x) => x.type === ALERT_TYPES.REPEATED_OUTSIDE_TRIP), 60);
  const noTrip = e.alerts.filter((x) => x.type === ALERT_TYPES.NO_TRIP);
  check('Repeated requests outside a trip flagged and quarantined', e.alerts.some((x) => x.type === ALERT_TYPES.REPEATED_OUTSIDE_TRIP) && e.guard.quarantined.has('AMB-16'),
    `${noTrip.length} "No active trip" alert (${noTrip[0]?.count}×) then "Repeated requests"`);
  check('Blocked-request counter matches the requests actually blocked', e.guard.stats.requestsBlocked - blocked0 === 4, `${e.guard.stats.requestsBlocked - blocked0} (1 unregistered + 3 outside a trip)`);
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
  const recs = [];
  e.onTripComplete = (r) => recs.push(r);
  const veh = e.vehicles.get(trip.vehicleId);
  e.endTrip(trip.id, 'Ended by operator');
  const ended = e.events.find((ev) => ev.vehicleId === trip.vehicleId && /ended before reaching/.test(ev.text));
  check('Trip ended by the operator is not logged as an arrival', recs[0]?.arrived === false && Boolean(ended) && !e.events.some((ev) => ev.vehicleId === trip.vehicleId && / arrived at /.test(ev.text)) && !veh.location.includes(trip.destination.name), `${ended?.text}; unit now at "${veh.location}"`);
}

/* 4b. A green held for the wrong movement is corrected at the stop line. */
{
  const e = fresh(15);
  const res = S.sghRun(e, { priority: 'Urgent' });
  const trip = e.trips.get(res.tripIds[0]);
  e.models.movement = RouteMovement; // trusts the planned route only, like the v0 system
  const target = trip.crossings.map((c) => {
    const j = e.junctionsById.get(c.j);
    const alt = Object.keys(j.movements[c.arm]).find((m) => m !== c.move && m !== 'U' && !phaseServes(phaseCovering(j, c.arm, [m]), c.arm, c.move));
    return alt ? { c, alt } : null;
  }).find(Boolean);
  target.c.pmv = target.alt; // the navigation route says one thing, the crew does another
  const recs = [];
  e.onTripComplete = (r) => recs.push(r);
  runUntil(e, () => recs.length > 0);
  const jc = recs[0]?.junctions.find((c) => c.j === target.c.j);
  check('Wrong-movement green corrected at the stop line (no full-cycle wait)', Boolean(jc?.lineCorrected) && jc.phaseServesMove && jc.wait < 40,
    `${target.c.j}: requested for ${target.alt}, ambulance went ${target.c.move}; corrected to ${jc?.phase}, waited ${jc?.wait} s (no-EVP ${jc?.baseWait} s)`);
}

/* 4c. Fleet operations: a call runs the whole cycle and the unit ends up back at base. */
{
  const e = fresh(16);
  const rng = new Rng(4);
  const ops = new FleetOps(e, { random: () => rng.next(), enabled: false });
  const m = ops.dispatch({ placeId: e.data.places[3].id, priority: 'Urgent' });
  const stages = [];
  const recs = [];
  e.onTripComplete = (r) => recs.push(r);
  runUntil(e, () => { ops.update(); if (stages[stages.length - 1] !== m.stage) stages.push(m.stage); return !ops.missions.has(m.id); }, 7200);
  const veh = e.vehicles.get(m.vehicleId);
  check('Fleet cycle: dispatch → on scene → … → back at base', !ops.missions.has(m.id) && veh.atBase && !veh.trip && stages.includes('ON_SCENE') && stages.includes('RETURNING'), `${m.id} ${m.vehicleId}: ${stages.join(' → ')}; ${recs.length} EVP trip record(s)`);
  check('Return-to-base drive sends no EVP requests', recs.every((r) => r.status !== 'RETURNING') && e.guard.stats.requestsBlocked === 0);
}

/* 4d. Normal fleet operation raises no security alerts (no false quarantines). */
{
  const e = fresh(21);
  const rng = new Rng(9);
  const ops = new FleetOps(e, { random: () => rng.next(), maxActive: 6 });
  for (let k = 0; k < 4; k++) ops.dispatch();
  const end = e.t + 3 * 3600;
  while (e.t < end) { e.step(0.1); ops.update(); }
  check('3 h of normal fleet operation: no false security alerts', e.alerts.length === 0 && e.guard.quarantined.size === 0,
    `${ops.calls} calls, ${e.guard.stats.fixesChecked} GPS fixes checked, ${e.alerts.length} alert(s)`);
}

/* 5. CCTV: exactly one camera on every signalised approach, no clip repeated
   within a junction, every clip on disk and credited under an open licence. */
{
  const pub = path.join(DATA_DIR, '..');
  const cams = data.cameras;
  const clips = data.cctvClips;
  const arms = data.junctions.flatMap((j) => j.arms.map((a) => ({ j: j.id, arm: a.id })));
  const uncovered = arms.filter((a) => cams.filter((c) => c.junctionId === a.j && c.arm === a.arm).length !== 1);
  const misplaced = cams.filter((c) => !arms.some((a) => a.j === c.junctionId && a.arm === c.arm));
  const orphan = cams.filter((c) => !clips.some((k) => k.id === c.clip));
  const repeated = data.junctions.filter((j) => { const used = data.camerasByJ.get(j.id).map((c) => c.clip); return new Set(used).size !== used.length; });
  const missing = clips.filter((k) => !fs.existsSync(path.join(pub, k.src)) || !fs.existsSync(path.join(pub, k.poster)));
  const LICENCE = /^(CC0|CC BY(-SA)? [\d.]+|Public domain|Coverr License)$/;
  const SOURCE = /^https:\/\/(commons\.wikimedia\.org\/wiki\/File:|coverr\.co\/videos\/)/;
  const uncredited = clips.filter((k) => !k.footage?.author || !SOURCE.test(k.footage?.sourceUrl || '') || !LICENCE.test(k.footage?.licence || '') || !k.footage?.licenceUrl);
  const unique = new Set(cams.map((c) => c.id)).size === cams.length;
  check('CCTV: one camera per signalised approach, clips distinct per junction, on disk and openly licensed',
    cams.length === arms.length && unique && !uncovered.length && !misplaced.length && !orphan.length && !repeated.length && !missing.length && !uncredited.length,
    `${cams.length} cameras on ${arms.length} approaches of ${data.junctions.length} junctions, ${clips.length} clips (${clips.filter((k) => k.mirrored).length} mirrored for left-hand traffic)`
      + `${[...uncovered.map((a) => `${a.j}/${a.arm}`), ...misplaced.map((c) => c.id), ...orphan.map((c) => c.id), ...repeated.map((j) => `${j.id} repeats a clip`), ...missing.map((k) => k.src), ...uncredited.map((k) => k.id)].map((x) => ` FAIL ${x}`).join('')}`);
}

/* 6. Analytics and report. */
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
