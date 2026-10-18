/* Authorisation & anomaly guard.

   Every OBU message passes through here before the decision engine may act
   on it. Hard rules come first (registry, active trip, patient status, speed
   physics, off-road); the isolation-forest score catches combinations the
   rules miss. A vehicle that fails is quarantined: its pre-emptions are
   released safely and further requests are blocked until an operator
   reinstates it. */
import { distance, angleDiff } from '../geo.js';

export const RULES = {
  maxSpeedKmh: 150,
  offRoadM: 60,
  outsideTripWindowS: 600,
  outsideTripLimit: 3,
};

export const ALERT_TYPES = {
  UNREGISTERED: 'Unregistered vehicle',
  NO_TRIP: 'No active trip',
  NO_PATIENT_STATUS: 'No patient status',
  SPEED_JUMP: 'Impossible speed jump (GPS spoofing)',
  OFF_ROAD: 'Location off road network',
  REPEATED_OUTSIDE_TRIP: 'Repeated requests outside trips',
  ML_ANOMALY: 'AI anomaly score',
  QUARANTINED: 'Vehicle quarantined',
};

export class Guard {
  constructor({ registry, network, anomalyModel, onAlert }) {
    this.registry = new Map(registry.map((a) => [a.obuId, a]));
    this.byVehicle = new Map(registry.map((a) => [a.id, a]));
    this.network = network;
    this.model = anomalyModel;
    this.onAlert = onAlert;
    this.lastFix = new Map();       // obuId → previous fix
    this.outsideTrip = new Map();   // obuId → [t, …] requests without a trip
    this.quarantined = new Map();   // vehicleId → alert id
  }

  isRegistered(obuId) { return this.registry.has(obuId); }

  /** Features for the anomaly model from two consecutive fixes. */
  fixFeatures(prev, fix) {
    const dt = Math.max(0.5, fix.t - prev.t);
    const moved = distance(prev.lat, prev.lng, fix.lat, fix.lng);
    const implied = (moved / dt) * 3.6;
    const offRoad = this.network.distanceToRoad(fix.lat, fix.lng, 300);
    return [
      implied,
      Math.abs(implied - fix.speed * 3.6),
      offRoad,
      Math.abs(angleDiff(prev.heading, fix.heading)) / dt,
      Math.abs(fix.speed - prev.speed) / dt,
    ];
  }

  /**
   * Check a GPS fix. Returns { ok, alerts: [...], features, score }.
   * `trip` is the vehicle's active trip, or null.
   */
  checkFix(fix, trip) {
    const alerts = [];
    const vehicle = this.registry.get(fix.obuId);
    if (!vehicle) {
      alerts.push(this._alert(fix, ALERT_TYPES.UNREGISTERED, `OBU ${fix.obuId} (${fix.plate || 'unknown plate'}) is not in the MBKS ambulance registry`, 'Blocked'));
      return { ok: false, alerts };
    }
    const prev = this.lastFix.get(fix.obuId);
    this.lastFix.set(fix.obuId, fix);
    let features = null;
    let score = null;
    if (prev && fix.t - prev.t < 30) {
      features = this.fixFeatures(prev, fix);
      score = this.model ? this.model.score(features) : null;
      if (features[0] > RULES.maxSpeedKmh) {
        alerts.push(this._alert(fix, ALERT_TYPES.SPEED_JUMP, `Position jumped ${Math.round(distance(prev.lat, prev.lng, fix.lat, fix.lng))} m in ${(fix.t - prev.t).toFixed(1)} s (${Math.round(features[0])} km/h implied, ${Math.round(fix.speed * 3.6)} km/h reported)`, 'Blocked + quarantined', { score, features }));
      } else if (features[2] > RULES.offRoadM) {
        alerts.push(this._alert(fix, ALERT_TYPES.OFF_ROAD, `Fix is ${Math.round(features[2])} m from the nearest road`, 'Blocked + quarantined', { score, features }));
      } else if (score != null && score > this.model.meta.threshold + 0.04) {
        alerts.push(this._alert(fix, ALERT_TYPES.ML_ANOMALY, `Isolation-forest score ${score.toFixed(2)} (threshold ${this.model.meta.threshold.toFixed(2)})`, 'Blocked + quarantined', { score, features }));
      }
    }
    if (alerts.length && trip) this.quarantine(vehicle.id, alerts[0]);
    return { ok: alerts.length === 0 && !this.quarantined.has(vehicle.id), alerts, features, score };
  }

  /**
   * Check a pre-emption request (OBU-initiated or engine-initiated).
   * Returns { ok, reason, alert }.
   */
  checkRequest(req, trip) {
    const vehicle = this.registry.get(req.obuId);
    if (!vehicle) return this._deny(req, ALERT_TYPES.UNREGISTERED, `Request for ${req.junctionId} from unregistered OBU ${req.obuId}`);
    if (this.quarantined.has(vehicle.id)) return { ok: false, reason: ALERT_TYPES.QUARANTINED, silent: true };
    if (!trip || !trip.active) {
      const list = (this.outsideTrip.get(req.obuId) || []).filter((t) => req.t - t < RULES.outsideTripWindowS);
      list.push(req.t);
      this.outsideTrip.set(req.obuId, list);
      if (list.length >= RULES.outsideTripLimit) {
        const res = this._deny(req, ALERT_TYPES.REPEATED_OUTSIDE_TRIP, `${list.length} requests in ${Math.round(RULES.outsideTripWindowS / 60)} min from ${vehicle.id} with no active trip`);
        this.quarantine(vehicle.id, res.alert);
        return res;
      }
      return this._deny(req, ALERT_TYPES.NO_TRIP, `${vehicle.id} requested ${req.junctionId} without pressing START (no active trip)`);
    }
    if (!['TO_PATIENT', 'TO_HOSPITAL'].includes(trip.status)) {
      return this._deny(req, ALERT_TYPES.NO_PATIENT_STATUS, `${vehicle.id} trip ${trip.id} has status "${trip.statusLabel || trip.status || 'none'}": EVP needs To patient or To hospital`);
    }
    return { ok: true };
  }

  quarantine(vehicleId, alert) {
    if (!this.quarantined.has(vehicleId)) this.quarantined.set(vehicleId, alert?.id || true);
  }

  reinstate(vehicleId) { this.quarantined.delete(vehicleId); }

  _deny(req, type, detail) {
    const alert = this._alert(req, type, detail, 'Request blocked');
    return { ok: false, reason: type, alert };
  }

  _alert(src, type, detail, action, extra = {}) {
    const vehicle = this.registry.get(src.obuId);
    const alert = {
      id: `AL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      t: src.t,
      type,
      detail,
      action,
      obuId: src.obuId,
      vehicleId: vehicle?.id || null,
      plate: vehicle?.plate || src.plate || null,
      junctionId: src.junctionId || null,
      lat: src.lat, lng: src.lng,
      status: 'open',
      severity: type === ALERT_TYPES.NO_TRIP || type === ALERT_TYPES.NO_PATIENT_STATUS ? 'warning' : 'danger',
      ...extra,
    };
    this.onAlert?.(alert);
    return alert;
  }
}
