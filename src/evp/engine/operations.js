/* Fleet operations for the live twin: the emergency-call cycle a real
   ambulance fleet runs, so units are busy, on scene, at hospitals and on the
   way back to base the way they would be on the day.

     call → nearest free unit dispatched (EVP, To patient)
          → on scene 4–9 min
          → conveyed to hospital (EVP, To hospital)   or treated on scene
          → handover 6–12 min
          → drives back to base (no EVP, signals run normally)

   Call volume follows the same assumption as the cost-benefit model
   (20 ambulances × 4 emergency trips a day) shaped by time of day. Units the
   operator or the tablet sends on a job leave this cycle; a unit left idle
   away from base returns to base after 10 minutes. */
import { distance } from '../geo.js';
import { localParts } from '../traffic.js';

export const CALLS_PER_DAY = 80;
// Relative call volume by local hour (same profile as the historical trip generator).
const HOUR_W = [3, 2, 2, 1.5, 1.5, 2, 3.5, 5, 6, 6, 6, 6.5, 6, 6, 6, 6, 6.5, 7, 7, 6, 5.5, 5, 4, 3.5];
const HOUR_SUM = HOUR_W.reduce((s, w) => s + w, 0);
const PRIORITY_W = [['Critical', 0.24], ['Urgent', 0.5], ['Non-urgent', 0.26]];
const ON_SCENE_S = [240, 540];
const HANDOVER_S = [360, 720];
const CONVEY_P = 0.72;
const AWAY_RETURN_S = 600;

export const MISSION_STAGE = {
  TO_PATIENT: 'Responding',
  ON_SCENE: 'On scene',
  TO_HOSPITAL: 'Conveying',
  HANDOVER: 'Hospital handover',
  RETURNING: 'Returning to base',
};

export class FleetOps {
  constructor(engine, { random = Math.random, maxActive = 4, enabled = true } = {}) {
    this.e = engine;
    this.random = random;
    this.maxActive = maxActive;
    this.enabled = enabled;
    this.missions = new Map();   // id → mission
    this.reserved = new Set();   // units signed in on a tablet: never auto-dispatched
    this.awaySince = new Map();  // vehicleId → t idle away from base
    this.seq = 0;
    this.calls = 0;
    this.unserved = 0;
    this.lastT = engine.t;
    engine.onTripStart.push((trip) => this._onTripStart(trip));
    engine.onTripEnd.push((trip, record, reason) => this._onTripEnd(trip, record, reason));
  }

  /** Expected emergency calls per hour at this moment. */
  callRate() {
    const h = localParts(this.e.now).hour;
    return (CALLS_PER_DAY * HOUR_W[h]) / HOUR_SUM;
  }

  active() { return [...this.missions.values()]; }

  reserve(vehicleId) { if (vehicleId) this.reserved.add(vehicleId); }
  release(vehicleId) { this.reserved.delete(vehicleId); }

  /** Advance timers and draw new calls for the simulated time since the last update. */
  update() {
    const { e } = this;
    const dt = Math.max(0, e.t - this.lastT);
    this.lastT = e.t;
    if (this.enabled && dt > 0) {
      const expected = (this.callRate() * dt) / 3600;
      const busy = this.active().filter((m) => m.stage !== 'RETURNING').length;
      if (this.random() < expected && busy < this.maxActive) this.dispatch();
    }
    for (const m of this.missions.values()) {
      if (m.until != null && e.t >= m.until) {
        m.until = null;
        if (m.stage === 'ON_SCENE') this._leaveScene(m);
        else if (m.stage === 'HANDOVER') this._returnToBase(m, 'handover complete');
      }
    }
    if (this.enabled) this._returnIdleUnits();
  }

  /** A new emergency call; the nearest free unit responds. Returns the mission or null. */
  dispatch({ placeId, priority } = {}) {
    const { e } = this;
    const places = e.data.places;
    const place = (placeId && places.find((p) => p.id === placeId)) || places[Math.floor(this.random() * places.length)];
    const pri = priority || this._weighted(PRIORITY_W);
    this.calls++;
    const units = e.availableVehicles().filter((v) => !this.reserved.has(v.id) && !v.missionId);
    if (!units.length) {
      this.unserved++;
      e.log('warning', `Emergency call (${pri}) at ${place.name}: no free unit in the pilot fleet; referred to the state call centre`, { kind: 'dispatch' });
      return null;
    }
    units.sort((a, b) => distance(a.lat, a.lng, place.lat, place.lng) - distance(b.lat, b.lng, place.lat, place.lng));
    for (const veh of units.slice(0, 4)) {
      const id = `CALL-${String(++this.seq).padStart(4, '0')}`;
      const m = { id, vehicleId: veh.id, place, priority: pri, stage: 'TO_PATIENT', until: null, tripId: null, receivedAt: e.t, hospital: null };
      this.missions.set(id, m);
      veh.missionId = id;
      try {
        const trip = e.startTrip({ vehicleId: veh.id, status: 'TO_PATIENT', priority: pri, destination: { type: 'place', id: place.id }, originName: veh.location, source: 'ops' });
        m.tripId = trip.id;
        const km = distance(veh.lat, veh.lng, place.lat, place.lng) / 1000;
        e.log('info', `${id}: ${pri} call at ${place.name}. ${veh.id} (${veh.amb.callsign}) dispatched from ${veh.location}, ${km.toFixed(1)} km away`, { vehicleId: veh.id, tripId: trip.id, kind: 'dispatch' });
        return m;
      } catch (err) {
        this.missions.delete(id);
        veh.missionId = null;
        this.seq--;
      }
    }
    this.unserved++;
    return null;
  }

  /* ─── Stage transitions ─────────────────────────────────── */
  _leaveScene(m) {
    const { e } = this;
    const veh = e.vehicles.get(m.vehicleId);
    if (this.random() > CONVEY_P) {
      e.log('info', `${m.id}: patient treated on scene by ${m.vehicleId}; no conveyance`, { vehicleId: m.vehicleId, kind: 'dispatch' });
      this._returnToBase(m, 'treated on scene');
      return;
    }
    const hospital = this._chooseHospital(m);
    // Priority is reassessed on scene; a stabilised patient may go down a level.
    const pri = m.priority === 'Critical' || this.random() < 0.7 ? m.priority : m.priority === 'Urgent' ? 'Non-urgent' : m.priority;
    veh.busy = null;
    try {
      const trip = e.startTrip({ vehicleId: m.vehicleId, status: 'TO_HOSPITAL', priority: pri, destination: { type: 'hospital', id: hospital.id }, originName: m.place.name, source: 'ops' });
      Object.assign(m, { stage: 'TO_HOSPITAL', tripId: trip.id, hospital: hospital.id, priority: pri });
    } catch (err) {
      this._returnToBase(m, 'no route to hospital');
    }
  }

  _chooseHospital(m) {
    const { hospitals } = this.e.data;
    const sgh = hospitals.find((h) => h.id === 'SGH');
    if (sgh && this.random() < (m.priority === 'Critical' ? 0.75 : 0.45)) return sgh;
    return hospitals.slice().sort((a, b) => distance(a.lat, a.lng, m.place.lat, m.place.lng) - distance(b.lat, b.lng, m.place.lat, m.place.lng))[0];
  }

  _returnToBase(m, why) {
    const { e } = this;
    const veh = e.vehicles.get(m.vehicleId);
    veh.busy = null;
    m.stage = 'RETURNING';
    m.until = null;
    try {
      const trip = e.startTrip({ vehicleId: m.vehicleId, status: 'RETURNING', priority: 'Non-urgent', destination: { type: 'place', id: veh.amb.base }, evp: false, source: 'ops' });
      m.tripId = trip.id;
      void why;
    } catch (err) {
      this._close(m); // already at base
    }
  }

  _close(m) {
    const veh = this.e.vehicles.get(m.vehicleId);
    if (veh && veh.missionId === m.id) { veh.missionId = null; veh.busy = null; }
    this.missions.delete(m.id);
  }

  _missionFor(vehicleId) {
    const veh = this.e.vehicles.get(vehicleId);
    return veh?.missionId ? this.missions.get(veh.missionId) : null;
  }

  _onTripStart(trip) {
    this.awaySince.delete(trip.vehicleId);
    if (trip.source === 'ops') return;
    // The operator or the crew gave this unit another job: it leaves the call cycle.
    const m = this._missionFor(trip.vehicleId);
    if (m) {
      this.e.log('info', `${m.id}: ${trip.vehicleId} re-tasked by ${trip.source === 'scenario' ? 'a demo scenario' : 'the crew'}; call cycle closed`, { vehicleId: trip.vehicleId, kind: 'dispatch' });
      this._close(m);
    }
  }

  _onTripEnd(trip, record, reason) {
    const m = this._missionFor(trip.vehicleId);
    if (!m || m.tripId !== trip.id) return;
    const veh = this.e.vehicles.get(trip.vehicleId);
    const arrived = reason === 'Arrived at destination';
    if (reason === 'Re-tasked') return; // _onTripStart closes the mission
    if (!arrived) {
      // Ended early by the operator or crew: the unit heads back to base.
      if (m.stage === 'RETURNING') { this._close(m); return; }
      this.e.after(60, () => { if (this.missions.has(m.id) && !veh.trip) this._returnToBase(m, 'trip ended early'); });
      m.stage = 'HANDOVER';
      return;
    }
    if (m.stage === 'TO_PATIENT') {
      m.stage = 'ON_SCENE';
      veh.busy = 'ON_SCENE';
      m.until = this.e.t + this._between(ON_SCENE_S);
    } else if (m.stage === 'TO_HOSPITAL') {
      m.stage = 'HANDOVER';
      veh.busy = 'HANDOVER';
      m.until = this.e.t + this._between(HANDOVER_S);
    } else if (m.stage === 'RETURNING') {
      this._close(m);
    }
  }

  /** Units the operator sent somewhere drive back to base once they have been idle for a while. */
  _returnIdleUnits() {
    const { e } = this;
    for (const veh of e.vehicles.values()) {
      if (veh.trip || veh.missionId || veh.busy || veh.atBase || this.reserved.has(veh.id) || e.guard.quarantined.has(veh.id)) {
        this.awaySince.delete(veh.id);
        continue;
      }
      if (!this.awaySince.has(veh.id)) { this.awaySince.set(veh.id, e.t); continue; }
      if (e.t - this.awaySince.get(veh.id) < AWAY_RETURN_S) continue;
      this.awaySince.delete(veh.id);
      try {
        e.startTrip({ vehicleId: veh.id, status: 'RETURNING', priority: 'Non-urgent', destination: { type: 'place', id: veh.amb.base }, evp: false, source: 'ops' });
      } catch (err) { veh.atBase = true; }
    }
  }

  summary() {
    return {
      enabled: this.enabled, calls: this.calls, unserved: this.unserved, ratePerHour: Math.round(this.callRate() * 10) / 10,
      missions: this.active().map((m) => ({ id: m.id, vehicleId: m.vehicleId, stage: m.stage, stageLabel: MISSION_STAGE[m.stage], place: m.place.name, priority: m.priority, hospital: m.hospital, until: m.until })),
    };
  }

  _between([lo, hi]) { return lo + this.random() * (hi - lo); }

  _weighted(pairs) {
    let r = this.random();
    for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; }
    return pairs[pairs.length - 1][0];
  }
}
