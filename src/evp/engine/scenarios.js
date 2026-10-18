/* Demo scenarios for the command map and the acceptance checks.
   Each returns { ok, message, tripIds? } and only uses the public engine API. */
import { phaseCovering, MOVE_LABEL } from '../junctions.js';

const POC = (engine) => engine.data.junctions.find((j) => j.poc)?.id;

function idleVehicles(engine, prefer = []) {
  const idle = [...engine.vehicles.values()].filter((v) => !v.trip && !engine.guard.quarantined.has(v.id)).map((v) => v.id);
  return [...prefer.filter((id) => idle.includes(id)), ...idle.filter((id) => !prefer.includes(id))];
}

/** Pickup places ranked by how many EVP junctions their route to `hospitalId` crosses. */
export function rankOrigins(engine, hospitalId) {
  const h = engine.hospitalsById.get(hospitalId);
  const poc = POC(engine);
  return engine.data.places
    .map((p) => {
      const path = engine.net.route(p.node, h.node);
      if (!path) return null;
      const route = engine._buildRoute(path);
      const js = route.crossings.map((c) => c.junctionId);
      return { place: p, junctions: js, length: route.length, score: js.length + (js.includes(poc) ? 3 : 0) - route.length / 8000 };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

/** START on an ambulance bound for Sarawak General Hospital. */
export function sghRun(engine, { vehicleId, priority = 'Critical', originId } = {}) {
  const vid = vehicleId || idleVehicles(engine, ['AMB-11', 'AMB-03', 'AMB-07'])[0];
  if (!vid) return { ok: false, message: 'No idle ambulance available' };
  const origins = rankOrigins(engine, 'SGH');
  const origin = (originId && origins.find((o) => o.place.id === originId)) || origins[0];
  engine.placeVehicle(vid, origin.place.node, origin.place.name);
  const trip = engine.startTrip({ vehicleId: vid, status: 'TO_HOSPITAL', priority, destination: { type: 'hospital', id: 'SGH' }, originName: origin.place.name, crew: 'Demo crew' });
  return { ok: true, tripIds: [trip.id], message: `${vid} picked up a ${priority.toLowerCase()} patient at ${origin.place.name} and pressed START for SGH (${trip.crossings.length} EVP junctions)` };
}

/** Two ambulances converge on one junction from conflicting approaches. */
export function conflict(engine) {
  const poc = POC(engine);
  const order = [poc, ...engine.data.junctions.map((j) => j.id).filter((id) => id !== poc)];
  const vids = idleVehicles(engine, ['AMB-05', 'AMB-13']);
  if (vids.length < 2) return { ok: false, message: 'Need two idle ambulances' };
  for (const jid of order) {
    const j = engine.junctionsById.get(jid);
    const cands = [];
    for (const p of engine.data.places) {
      for (const h of engine.data.hospitals) {
        const path = engine.net.route(p.node, h.node);
        if (!path) continue;
        const route = engine._buildRoute(path);
        const c = route.crossings.find((x) => x.junctionId === jid);
        if (c && c.dStop >= 750) cands.push({ p, h, c });
      }
    }
    for (const a of cands) {
      for (const b of cands) {
        if (a.c.fromArm === b.c.fromArm) continue;
        const pa = phaseCovering(j, a.c.fromArm, [a.c.move]);
        const pb = phaseCovering(j, b.c.fromArm, [b.c.move]);
        if (!pa || !pb || pa.id === pb.id) continue;
        const [urgentV, criticalV] = vids;
        engine.placeVehicle(urgentV, a.p.node, a.p.name);
        engine.placeVehicle(criticalV, b.p.node, b.p.name);
        // The urgent ambulance starts nearer, so "nearest ETA" alone would favour it.
        const t1 = engine.startTrip({ vehicleId: urgentV, status: 'TO_HOSPITAL', priority: 'Urgent', destination: { type: 'hospital', id: a.h.id }, originName: a.p.name, startOffset: a.c.dStop - 560 });
        const t2 = engine.startTrip({ vehicleId: criticalV, status: 'TO_HOSPITAL', priority: 'Critical', destination: { type: 'hospital', id: b.h.id }, originName: b.p.name, startOffset: b.c.dStop - 640 });
        return {
          ok: true, tripIds: [t1.id, t2.id], junctionId: jid,
          message: `${urgentV} (Urgent, ${MOVE_LABEL[a.c.move]} from ${a.c.fromArm}) and ${criticalV} (Critical, ${MOVE_LABEL[b.c.move]} from ${b.c.fromArm}) converge on ${jid} ${j.name}: phases ${pa.id} and ${pb.id} conflict`,
        };
      }
    }
  }
  return { ok: false, message: 'No conflicting approach pair found' };
}

/** Spoofed GPS jump on an active trip (starts one if needed). */
export function spoof(engine) {
  let trip = engine.activeTrips().find((t) => !t.evpSuspended);
  let started = '';
  if (!trip) {
    const res = sghRun(engine, { priority: 'Urgent' });
    if (!res.ok) return res;
    trip = engine.trips.get(res.tripIds[0]);
    started = `${res.message}. `;
  }
  engine.after(10, () => engine.injectSpoof(trip.vehicleId, 1100));
  return { ok: true, tripIds: [trip.id], message: `${started}A spoofed fix (1.1 km jump) will be injected into ${trip.vehicleId}'s GPS stream in 10 s` };
}

export function unregistered(engine) {
  const g = engine.injectUnregistered(POC(engine));
  return { ok: true, message: `Unknown OBU ${g.obuId} (${g.plate}) requested a green at ${g.junctionId}` };
}

export function misuse(engine) {
  const vid = idleVehicles(engine, ['AMB-16'])[0];
  if (!vid) return { ok: false, message: 'No idle ambulance' };
  engine.injectRequestWithoutTrip(vid, 3);
  return { ok: true, message: `${vid} sent 3 pre-emption requests without an active trip` };
}

export function noPatientStatus(engine) {
  const vid = idleVehicles(engine, ['AMB-09'])[0];
  if (!vid) return { ok: false, message: 'No idle ambulance' };
  const origins = rankOrigins(engine, 'SGH');
  engine.placeVehicle(vid, origins[1].place.node, origins[1].place.name);
  const trip = engine.startTrip({ vehicleId: vid, status: 'RETURNING', priority: 'Non-urgent', destination: { type: 'hospital', id: 'SGH' }, originName: origins[1].place.name });
  return { ok: true, tripIds: [trip.id], message: `${vid} started a trip with status "Returning to base": its EVP requests will be blocked` };
}

export const SCENARIOS = [
  { id: 'sgh', label: 'SGH run', icon: 'route', run: sghRun, description: 'Critical patient, START to Sarawak General Hospital' },
  { id: 'conflict', label: 'Two-ambulance conflict', icon: 'alert', run: conflict, description: 'Critical vs Urgent converging on one junction' },
  { id: 'spoof', label: 'GPS spoof', icon: 'shield', run: spoof, description: 'Inject an impossible 1.1 km jump' },
  { id: 'unregistered', label: 'Unregistered vehicle', icon: 'truck', run: unregistered, description: 'Unknown OBU requests a green' },
  { id: 'misuse', label: 'Requests outside trip', icon: 'bell', run: misuse, description: 'Registered OBU, no START pressed' },
  { id: 'nostatus', label: 'No patient status', icon: 'user', run: noPatientStatus, description: 'Trip marked Returning to base' },
];
