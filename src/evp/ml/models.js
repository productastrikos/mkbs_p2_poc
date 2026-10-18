/* The three learned models in the EVP pipeline, plus the simple "v0"
   heuristics used before any trip history existed.

   1. EtaModel       gradient-boosted trees → ETA (s) to a junction stop line,
                     with an 80% interval from a second model of |error|.
   2. MovementModel  softmax regression → P(Left/Straight/Right/U-turn).
   3. AnomalyModel   isolation forest over GPS-fix features. */
import { GBRT } from './gbrt.js';
import { Softmax } from './softmax.js';
import { IsolationForest } from './isolationForest.js';
import { localParts } from '../traffic.js';
import { MOVES } from '../junctions.js';

/* ─── 1. Junction ETA ─────────────────────────────────────── */
export const ETA_FEATURES = [
  { key: 'distance', label: 'Distance to stop line (m)' },
  { key: 'speed', label: 'Current speed (m/s)' },
  { key: 'accel', label: 'Acceleration (m/s²)' },
  { key: 'hour', label: 'Hour of day' },
  { key: 'dow', label: 'Day of week' },
  { key: 'rain', label: 'Rain (yes/no)' },
  { key: 'congestion', label: 'Junction congestion (0–1)' },
  { key: 'lanes', label: 'Approach lanes' },
  { key: 'toHospital', label: 'Status: to hospital' },
  { key: 'naive', label: 'Distance ÷ speed (derived)' },
];

export function etaVector({ distance, speed, accel, hour, dow, rain, congestion, lanes, status }) {
  const naive = Math.min(400, distance / Math.max(speed, 3));
  return [distance, speed, Math.max(-5, Math.min(5, accel)), hour, dow, rain ? 1 : 0, congestion, lanes, status === 'TO_HOSPITAL' ? 1 : 0, naive];
}

/** Training rows from completed trips (history or live). */
export function etaSamples(trips, { maxPerTrip = 120 } = {}) {
  const X = []; const y = []; const tripIdx = [];
  trips.forEach((trip, ti) => {
    let rows = [];
    trip.junctions.forEach((c) => {
      if (c.arrival == null) return;
      for (let i = 1; i < trip.trace.length; i++) {
        const [t, d, v10] = trip.trace[i];
        const dist = c.dStop - d;
        if (t >= c.arrival || dist < 15 || dist > 900) continue;
        const [tp, , vp10] = trip.trace[i - 1];
        const lp = localParts(trip.start + t * 1000);
        rows.push([etaVector({
          distance: dist, speed: v10 / 10, accel: (v10 - vp10) / 10 / Math.max(1, t - tp),
          hour: lp.hourFloat, dow: lp.dow, rain: trip.rain, congestion: c.cg, lanes: c.lanes, status: trip.status,
        }), c.arrival - t]);
      }
    });
    if (rows.length > maxPerTrip) rows = rows.filter((_, i) => i % Math.ceil(rows.length / maxPerTrip) === 0);
    rows.forEach(([x, label]) => { X.push(x); y.push(label); tripIdx.push(ti); });
  });
  return { X, y, tripIdx };
}

export class EtaModel {
  constructor() { this.version = 0; this.meta = null; }

  async train(trips, { async = true, onProgress, version } = {}) {
    const t0 = Date.now();
    const { X, y, tripIdx } = etaSamples(trips);
    // Hold out ~15% of trips (not samples) for an honest error estimate.
    const hold = (i) => (tripIdx[i] * 2654435761) % 100 < 15;
    const tr = []; const te = [];
    X.forEach((_, i) => (hold(i) ? te : tr).push(i));
    const main = new GBRT({ nTrees: 110, depth: 4, lr: 0.12, minLeaf: 25, subsample: 0.6 });
    await main.fit(tr.map((i) => X[i]), tr.map((i) => y[i]), { async, onProgress: (p) => onProgress?.(p * 0.8) });
    // Second model: expected absolute error, fitted on the held-out trips.
    const absErr = te.map((i) => Math.abs(y[i] - main.predict(X[i])));
    const errModel = new GBRT({ nTrees: 40, depth: 3, lr: 0.15, minLeaf: 30, subsample: 0.8, seed: 3 });
    await errModel.fit(te.map((i) => X[i]), absErr, { async });
    // Calibrate the band multiplier so 80% of held-out errors fall inside it.
    const ratios = te.map((i, q) => absErr[q] / Math.max(1, errModel.predict(X[i]))).sort((a, b) => a - b);
    const k = ratios[Math.floor(ratios.length * 0.8)] || 1.5;
    const mae = absErr.reduce((s, v) => s + v, 0) / Math.max(1, absErr.length);
    const byHorizon = [[0, 15], [15, 30], [30, 60], [60, 120], [120, 1e9]].map(([lo, hi]) => {
      const idx = te.map((i, q) => [y[i], absErr[q]]).filter(([lab]) => lab >= lo && lab < hi);
      return { range: hi > 1e8 ? `${lo}+ s` : `${lo}–${hi} s`, mae: idx.length ? idx.reduce((s, [, e]) => s + e, 0) / idx.length : null, n: idx.length };
    });
    this.main = main; this.err = errModel; this.k = k;
    this.version = version ?? this.version + 1;
    this.meta = {
      version: this.version, trainedAt: Date.now(), trainMs: Date.now() - t0,
      samples: tr.length, holdout: te.length, trips: trips.length,
      mae: Math.round(mae * 10) / 10, k: Math.round(k * 100) / 100, byHorizon,
      importance: ETA_FEATURES.map((f, i) => ({ ...f, value: main.importance[i] || 0 })).sort((a, b) => b.value - a.value),
    };
    onProgress?.(1);
    return this.meta;
  }

  predict(f) {
    const x = etaVector(f);
    const eta = Math.max(0, this.main.predict(x));
    const half = Math.max(1.5, this.k * Math.max(0.5, this.err.predict(x)));
    return { eta, lo: Math.max(0, eta - half), hi: eta + half };
  }
}

/** v0: distance over a blend of current and typical speed (used before the model existed). */
export const PhysicsEta = {
  version: 0,
  meta: { version: 0, mae: null },
  predict({ distance, speed, congestion }) {
    const typical = 11 * (1 - 0.35 * congestion);
    const v = Math.max(3, 0.6 * speed + 0.4 * typical);
    const eta = distance / v;
    return { eta, lo: eta * 0.75, hi: eta * 1.3 };
  },
};

/* ─── 2. Movement / phase prediction ─────────────────────── */
const LANE_IDX = { L: 0, C: 1, R: 2 };
export const MOVEMENT_FEATURES = ['planned movement (route)', 'route alternative + cost gap', 'lane position × distance', 'GPS heading offset', 'previous turn', 'distance'];

export function movementVector({ planned, alt, gap, lane, dist, heading, prev }) {
  const x = new Array(28).fill(0);
  const near = 1 - Math.max(0, Math.min(1, (dist - 60) / 240));
  const closeAlt = alt ? Math.exp(-(gap ?? 1) / 0.06) : 0;
  x[MOVES.indexOf(planned)] = 1;                                     // 0–3
  if (alt) x[4 + MOVES.indexOf(alt)] = closeAlt;                     // 4–7
  const li = LANE_IDX[lane] ?? 1;
  x[8 + li] = near;                                                  // 8–10
  x[11 + li] = 1 - near;                                             // 11–13
  x[14 + MOVES.indexOf(planned) * 3 + li] = near;                    // 14–25: lane agrees with plan?
  x[26] = dist < 45 ? Math.max(-2, Math.min(2, (heading || 0) / 15)) : 0;
  x[27] = 1;
  void prev;
  return x;
}

export function movementSamples(trips) {
  const X = []; const y = [];
  trips.forEach((trip) => trip.junctions.forEach((c) => {
    (c.obs || []).forEach(([dist, lane, heading]) => {
      X.push(movementVector({ planned: c.pmv, alt: c.alt, gap: c.gap, lane, dist, heading, prev: c.prev }));
      y.push(c.move);
    });
  }));
  return { X, y };
}

export class MovementModel {
  constructor() { this.version = 0; this.meta = null; }

  train(trips, { version } = {}) {
    const t0 = Date.now();
    const { X, y } = movementSamples(trips);
    const te = []; const tr = [];
    X.forEach((_, i) => ((i * 2654435761) % 100 < 15 ? te : tr).push(i));
    this.model = new Softmax({ classes: MOVES, epochs: 8 }).fit(tr.map((i) => X[i]), tr.map((i) => y[i]));
    let correct = 0; let conf = 0; let logLoss = 0; let lowConf = 0;
    te.forEach((i) => {
      const p = this.model.proba(X[i]);
      const top = p.indexOf(Math.max(...p));
      if (MOVES[top] === y[i]) correct++;
      conf += p[top];
      if (p[top] < 0.8) lowConf++;
      logLoss -= Math.log(Math.max(1e-6, p[MOVES.indexOf(y[i])]));
    });
    this.version = version ?? this.version + 1;
    this.meta = {
      version: this.version, trainedAt: Date.now(), trainMs: Date.now() - t0, samples: tr.length, holdout: te.length,
      accuracy: correct / Math.max(1, te.length), meanConfidence: conf / Math.max(1, te.length),
      logLoss: logLoss / Math.max(1, te.length), lowConfidenceShare: lowConf / Math.max(1, te.length),
    };
    return this.meta;
  }

  /** Probabilities for each movement, masked to movements that exist at this approach. */
  predict(f, available) {
    const mask = available ? MOVES.map((m) => available.includes(m)) : null;
    const p = this.model.proba(movementVector(f), mask);
    return Object.fromEntries(MOVES.map((m, i) => [m, p[i]]));
  }
}

/** v0: trust the navigation route. */
export const RouteMovement = {
  version: 0,
  predict({ planned, alt }, available) {
    const out = Object.fromEntries(MOVES.map((m) => [m, 0]));
    out[planned] = 0.9;
    const rest = alt && alt !== planned ? alt : (available || MOVES).find((m) => m !== planned);
    if (rest) out[rest] = 0.1; else out[planned] = 1;
    return out;
  },
};

/* ─── 3. GPS anomaly model ────────────────────────────────── */
export const ANOMALY_FEATURES = ['Implied speed (km/h)', 'Implied vs reported speed gap (km/h)', 'Distance off road (m)', 'Heading change (deg/s)', 'Acceleration (m/s²)'];

export class AnomalyModel {
  train(rows) {
    const t0 = Date.now();
    this.forest = new IsolationForest({ trees: 100, sample: 256 }).fit(rows);
    this.meta = { trainedAt: Date.now(), trainMs: Date.now() - t0, samples: rows.length, threshold: Math.round(this.forest.threshold * 1000) / 1000 };
    return this.meta;
  }

  score(row) { return this.forest.score(row); }
}
