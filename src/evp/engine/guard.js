/* Authorisation & anomaly guard.

   Every OBU message passes through here before the decision engine may act
   on it. Hard rules come first (registry, active trip, patient status, speed
   physics, off-road); the isolation-forest score catches combinations the
   rules miss. A vehicle that fails is quarantined: its pre-emptions are
   released safely and further requests are blocked until an operator
   reinstates it.

   A repeat of an open alert (same type, same unit, within 10 min) is
   counted on that alert instead of opening a new one. */
import { distance, angleDiff } from '../geo.js';

export const RULES = {
  maxSpeedKmh: 150,
  offRoadM: 60,
  outsideTripWindowS: 600,
  outsideTripLimit: 3,
  repeatWindowS: 600,
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
  constructor({ registry, network, anomalyModel, onAlert, onRepeat }) {
    this.registry = new Map(registry.map((a) => [a.obuId, a]));
    this.byVehicle = new Map(registry.map((a) => [a.id, a]));
    this.network = network;
    this.model = anomalyModel;
    this.onAlert = onAlert;
    this.onRepeat = onRepeat;
    this.lastFix = new Map();       // obuId → last accepted fix
    this.outsideTrip = new Map();   // obuId → [t, …] requests without a trip
    this.quarantined = new Map();   // vehicleId → alert id
    this.open = [];                 // recent alerts, for folding repeats
    this.mlStreak = new Map();      // obuId → consecutive fixes at or above the ML threshold
    this.stats = { requestsChecked: 0, requestsBlocked: 0, fixesChecked: 0, fixesRejected: 0 };
  }

  /** Isolation-forest score at which a fix counts as anomalous. */
  get mlThreshold() { return this.model?.meta?.alertThreshold ?? Infinity; }
  /** Score at which a single fix raises an alert on its own. */
  get mlSingleThreshold() { return this.model?.meta?.singleFixThreshold ?? Infinity; }

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
    this.stats.fixesChecked++;
    const vehicle = this.registry.get(fix.obuId);
    if (!vehicle) {
      this.stats.fixesRejected++;
      alerts.push(this._alert(fix, ALERT_TYPES.UNREGISTERED, `OBU ${fix.obuId} (${fix.plate || 'unknown plate'}) is not in the MBKS ambulance registry`, 'Blocked'));
      return { ok: false, alerts };
    }
    const prev = this.lastFix.get(fix.obuId);
    let features = null;
    let score = null;
    if (!prev || fix.t - prev.t >= 30) this.mlStreak.set(fix.obuId, 0); // a new stream starts clean
    if (prev && fix.t - prev.t < 30) {
      features = this.fixFeatures(prev, fix);
      score = this.model ? this.model.score(features) : null;
      if (features[0] > RULES.maxSpeedKmh) {
        alerts.push(this._alert(fix, ALERT_TYPES.SPEED_JUMP, `Position jumped ${Math.round(distance(prev.lat, prev.lng, fix.lat, fix.lng))} m in ${(fix.t - prev.t).toFixed(1)} s (${Math.round(features[0])} km/h implied, ${Math.round(fix.speed * 3.6)} km/h reported)`, 'Blocked + quarantined', { score, features }));
      } else if (features[2] > RULES.offRoadM) {
        alerts.push(this._alert(fix, ALERT_TYPES.OFF_ROAD, `Fix is ${Math.round(features[2])} m from the nearest road`, 'Blocked + quarantined', { score, features }));
      } else if (score != null) {
        // A sharp turn or hard stop can score high on one fix; a manipulated
        // stream stays anomalous. Alert on two in a row, or one extreme fix.
        const streak = score >= this.mlThreshold ? (this.mlStreak.get(fix.obuId) || 0) + 1 : 0;
        this.mlStreak.set(fix.obuId, streak);
        if (streak >= (this.model.meta.consecutive || 2) || score >= this.mlSingleThreshold) {
          const why = streak >= 2 ? `${streak} consecutive fixes at or above ${this.mlThreshold.toFixed(3)}` : `single fix above ${this.mlSingleThreshold.toFixed(3)}`;
          alerts.push(this._alert(fix, ALERT_TYPES.ML_ANOMALY, `Isolation-forest score ${score.toFixed(3)}: ${why}`, 'Blocked + quarantined', { score, features }));
        }
      }
    }
    // A rejected fix is never used as the reference for the next one, so a
    // single spoofed position raises one alert, not a second on the way back.
    if (alerts.length) this.stats.fixesRejected++;
    else this.lastFix.set(fix.obuId, fix);
    if (alerts.length && trip) this.quarantine(vehicle.id, alerts[0]);
    return { ok: alerts.length === 0 && !this.quarantined.has(vehicle.id), alerts, features, score };
  }

  /**
   * Check a pre-emption request (OBU-initiated or engine-initiated).
   * Returns { ok, reason, alert }.
   */
  checkRequest(req, trip) {
    this.stats.requestsChecked++;
    const res = this._checkRequest(req, trip);
    if (!res.ok) this.stats.requestsBlocked++;
    return res;
  }

  _checkRequest(req, trip) {
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

  /** Operator reinstatement: lift the quarantine and start the unit's history afresh. */
  reinstate(vehicleId) {
    this.quarantined.delete(vehicleId);
    const obuId = this.byVehicle.get(vehicleId)?.obuId;
    if (obuId) { this.outsideTrip.delete(obuId); this.lastFix.delete(obuId); this.mlStreak.delete(obuId); }
  }

  _deny(req, type, detail) {
    const alert = this._alert(req, type, detail, 'Request blocked');
    return { ok: false, reason: type, alert };
  }

  _alert(src, type, detail, action, extra = {}) {
    const vehicle = this.registry.get(src.obuId);
    this.open = this.open.filter((a) => a.status === 'open' && src.t - a.lastT < RULES.repeatWindowS);
    const repeat = this.open.find((a) => a.type === type && a.obuId === src.obuId);
    if (repeat) {
      repeat.count += 1;
      repeat.lastT = src.t;
      repeat.detail = detail;
      if (src.junctionId && !repeat.junctions.includes(src.junctionId)) repeat.junctions.push(src.junctionId);
      this.onRepeat?.(repeat);
      return repeat;
    }
    const alert = {
      id: `AL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      t: src.t,
      lastT: src.t,
      count: 1,
      type,
      detail,
      action,
      obuId: src.obuId,
      vehicleId: vehicle?.id || null,
      plate: vehicle?.plate || src.plate || null,
      junctionId: src.junctionId || null,
      junctions: src.junctionId ? [src.junctionId] : [],
      lat: src.lat, lng: src.lng,
      status: 'open',
      severity: type === ALERT_TYPES.NO_TRIP || type === ALERT_TYPES.NO_PATIENT_STATUS ? 'warning' : 'danger',
      ...extra,
    };
    this.open.push(alert);
    this.onAlert?.(alert);
    return alert;
  }
}
