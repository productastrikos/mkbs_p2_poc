/* Generates the 500 historical ambulance trips (simulated pilot runs) by
 * driving the real simulation engine headless with the v0 heuristic models.
 *
 *   node scripts/generate-trips.mjs
 *
 * Writes public/data/trips.json and public/data/gps-fixes.json. */
import fs from 'node:fs';
import path from 'node:path';
import { loadData, DATA_DIR } from './lib/node-data.mjs';
import { SimEngine } from '../src/evp/engine/simulation.js';
import { PhysicsEta, RouteMovement, ANOMALY_FEATURES } from '../src/evp/ml/models.js';
import { Rng } from '../src/evp/rng.js';
import { TZ_OFFSET_MS } from '../src/evp/traffic.js';

const N_TRIPS = 500;
const PERIOD_START = Date.UTC(2026, 3, 15) - TZ_OFFSET_MS; // 15 Apr 2026 00:00 Kuching
const PERIOD_DAYS = 183;                                   // to 14 Oct 2026
const data = loadData();
const rng = new Rng(2027);

// Ambulance demand by local hour (relative weights).
const HOUR_W = [3, 2, 2, 1.5, 1.5, 2, 3.5, 5, 6, 6, 6, 6.5, 6, 6, 6, 6, 6.5, 7, 7, 6, 5.5, 5, 4, 3.5];
const HOSP_W = { SGH: 0.5, BMC: 0.18, KPJ: 0.14, TMC: 0.18 };
const OWN_HOSPITAL = { 'Borneo Medical Centre': 'BMC', 'Timberland Medical Centre': 'TMC', 'KPJ Kuching': 'KPJ' };

function tripPlan(i) {
  const day = Math.floor(rng.next() * PERIOD_DAYS);
  const hour = rng.weighted(HOUR_W.map((w, h) => [h, w]));
  const start = PERIOD_START + day * 86400000 + hour * 3600000 + Math.floor(rng.next() * 3600000);
  const amb = rng.pick(data.ambulances);
  const toHospital = rng.chance(0.62);
  const priority = rng.weighted({ Critical: 0.24, Urgent: 0.5, 'Non-urgent': 0.26 });
  const afternoon = hour >= 13 && hour <= 19;
  const rain = rng.chance(afternoon ? 0.34 : 0.14);
  if (toHospital) {
    const own = OWN_HOSPITAL[amb.operator];
    const hospital = own && rng.chance(0.75) ? own : rng.weighted(HOSP_W);
    const place = rng.pick(data.places);
    return { i, start, amb, status: 'TO_HOSPITAL', priority, rain, originNode: place.node, originName: place.name, destination: { type: 'hospital', id: hospital } };
  }
  const base = data.bases.find((b) => b.id === amb.base);
  const place = rng.pick(data.places);
  return { i, start, amb, status: 'TO_PATIENT', priority, rain, originNode: base.node, originName: base.name, destination: { type: 'place', id: place.id } };
}

const plans = Array.from({ length: N_TRIPS }, (_, i) => tripPlan(i)).sort((a, b) => a.start - b.start);
const trips = [];
const fixRows = [];
const t0 = Date.now();
let i = 0;
while (trips.length < N_TRIPS && i < plans.length) {
  const plan = plans[i++];
  const engine = new SimEngine({
    data, models: { eta: PhysicsEta, movement: RouteMovement, anomaly: null },
    seed: 1000 + plan.i, startMs: plan.start - 300 * 1000, recordFixes: fixRows.length < 12000, mode: 'history',
  });
  engine.rain = plan.rain;
  for (let k = 0; k < 600; k++) engine.step(0.5); // warm up signal cycles and queues
  const records = [];
  engine.onTripComplete = (r) => records.push(r);
  let trip;
  try {
    trip = engine.startTrip({ id: `H-${String(trips.length + 1).padStart(4, '0')}`, vehicleId: plan.amb.id, status: plan.status, priority: plan.priority, destination: plan.destination, originNode: plan.originNode, originName: plan.originName, allowDeviation: true });
  } catch (e) { continue; }
  // ~8% of trips overlap with a second ambulance through a shared junction.
  let second = null;
  if (rng.chance(0.08) && trip.crossings.length) {
    const target = rng.pick(trip.crossings).j;
    for (let tries = 0; tries < 40 && !second; tries++) {
      const other = tripPlan(plan.i + 10000 + tries);
      if (other.amb.id === plan.amb.id) continue;
      const path2 = engine.net.route(other.originNode, engine.hospitalsById.get(other.destination.id)?.node ?? engine.placesById.get(other.destination.id).node);
      if (!path2) continue;
      const r2 = engine._buildRoute(path2);
      if (!r2.crossings.some((c) => c.junctionId === target)) continue;
      second = { ...other, start: plan.start };
    }
  }
  let secondStarted = !second;
  const secondDelay = rng.float(0, 60);
  for (let k = 0; k < 16000 && records.length < (second ? 2 : 1); k++) {
    engine.step(0.25);
    if (!secondStarted && engine.t - trip.t0 >= secondDelay) {
      secondStarted = true;
      try {
        engine.startTrip({ id: `H-${String(trips.length + 2).padStart(4, '0')}`, vehicleId: second.amb.id, status: second.status, priority: second.priority, destination: second.destination, originNode: second.originNode, originName: second.originName, allowDeviation: true });
      } catch (e) { second = null; }
    }
  }
  records.forEach((r) => {
    if (trips.length >= N_TRIPS) return;
    r.id = `H-${String(trips.length + 1).padStart(4, '0')}`;
    trips.push(r);
  });
  if (engine.recordFixes) fixRows.push(...engine.fixLog.filter((_, k) => k % 2 === 0));
  if (trips.length % 50 === 0 || trips.length === N_TRIPS) process.stdout.write(`\r  ${trips.length} trips…`);
}
console.log(`\nSimulated ${trips.length} trips in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// Compact for storage: 4 s trace, no per-prediction logs for history.
const compact = trips.map((r) => ({
  ...r,
  trace: r.trace.filter((_, k) => k % 2 === 0),
  junctions: r.junctions.map(({ preds, ...c }) => c),
  events: undefined,
}));
const sum = (f) => compact.reduce((s, r) => s + f(r), 0);
const stats = {
  trips: compact.length,
  avgSaved: Math.round((sum((r) => r.saved) / compact.length) * 10) / 10,
  preempted: sum((r) => r.junctions.filter((c) => c.preempted).length),
  crossings: sum((r) => r.junctions.length),
  conflicts: sum((r) => r.junctions.filter((c) => c.conflict).length),
  deviations: sum((r) => (r.deviation ? 1 : 0)),
};
console.log(stats);

fs.writeFileSync(path.join(DATA_DIR, 'trips.json'), JSON.stringify({
  note: 'Simulated pilot trips on the real Kuching South road network (v0 heuristic ETA and route-based movement models). Not real patient data.',
  period: { from: '2026-04-15', to: '2026-10-14' },
  stats,
  trips: compact,
}));
const rows = rng.shuffle(fixRows).slice(0, 8000);
fs.writeFileSync(path.join(DATA_DIR, 'gps-fixes.json'), JSON.stringify({ features: ANOMALY_FEATURES, rows }));
for (const f of ['trips.json', 'gps-fixes.json']) console.log(`  wrote ${f} (${(fs.statSync(path.join(DATA_DIR, f)).size / 1024).toFixed(0)} KB)`);
