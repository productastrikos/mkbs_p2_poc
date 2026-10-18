/* Traffic context: time of day, congestion profiles, vehicle dynamics and
   the lane-position model. Shared by the live simulation and the historical
   trip generator so the ML models learn from the same physics they predict. */

export const PRIORITIES = ['Critical', 'Urgent', 'Non-urgent'];
export const PRIORITY_RANK = { Critical: 3, Urgent: 2, 'Non-urgent': 1 };
export const STATUS = {
  TO_PATIENT: 'To patient',
  TO_HOSPITAL: 'To hospital',
  RETURNING: 'Returning to base',
};

/* ─── Time (Kuching is UTC+8, no DST) ────────────────────── */
export const TZ_OFFSET_MS = 8 * 3600 * 1000;
export function localParts(ms) {
  const d = new Date(ms + TZ_OFFSET_MS);
  return {
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    dow: (d.getUTCDay() + 6) % 7, // 0 = Monday
    hourFloat: d.getUTCHours() + d.getUTCMinutes() / 60,
    dateKey: d.toISOString().slice(0, 10),
    monthKey: d.toISOString().slice(0, 7),
  };
}
export const DOW_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Junction congestion baseline (0–1) for a local time, interpolated by minute. */
export function profileCongestion(junction, hourFloat, dow, rain) {
  const curve = dow >= 5 ? junction.congestion.weekend : junction.congestion.weekday;
  const h0 = Math.floor(hourFloat) % 24;
  const h1 = (h0 + 1) % 24;
  const f = hourFloat - Math.floor(hourFloat);
  const base = curve[h0] * (1 - f) + curve[h1] * f;
  return Math.min(1, base + (rain ? 0.1 : 0));
}

/* ─── Vehicle dynamics ───────────────────────────────────── */
export const DYN = {
  accel: 1.7,          // m/s², loaded ambulance
  brake: 2.6,          // m/s², planned braking
  hardBrake: 4.5,      // m/s², maximum
  stopGap: 3,          // m before the stop line
  // Speed through the junction box for each movement (m/s).
  junctionSpeed: { S: 10.5, L: 5.5, R: 7, U: 3.5 },
  maxSpeed: 25,        // m/s (90 km/h)
};

const PRIORITY_BOOST = { Critical: 1.18, Urgent: 1.1, 'Non-urgent': 1.0 };

/** Cruise speed (m/s) on a road segment. */
export function cruiseSpeed(speedKph, { priority, congestion, rain, driver }) {
  const v = (speedKph / 3.6) * (PRIORITY_BOOST[priority] || 1) * (1 - 0.42 * congestion) * (rain ? 0.86 : 1) * driver;
  return Math.max(4, Math.min(DYN.maxSpeed, v));
}

/** Highest speed at distance `gap` before a point that must be passed at `vEnd`. */
export function brakingEnvelope(gap, vEnd, decel = DYN.brake) {
  return Math.sqrt(Math.max(0, vEnd * vEnd + 2 * decel * Math.max(0, gap)));
}

/* ─── Lane position & heading model ──────────────────────── */
// Probability of being in the kerbside (L), middle (C) or median (R) lane
// given the movement the driver intends and the distance to the stop line.
// Far out, ambulances hold the median lane to overtake; near the junction
// they move into the lane for their turn.
const LANE_FAR = { S: [0.15, 0.35, 0.5], L: [0.32, 0.36, 0.32], R: [0.12, 0.36, 0.52], U: [0.1, 0.32, 0.58] };
const LANE_NEAR = { S: [0.18, 0.42, 0.4], L: [0.9, 0.08, 0.02], R: [0.02, 0.06, 0.92], U: [0.01, 0.03, 0.96] };
export const LANES = ['L', 'C', 'R'];

export function laneProbs(move, dist) {
  const w = Math.max(0, Math.min(1, (dist - 60) / 240)); // 0 near (≤60 m) → 1 far (≥300 m)
  const far = LANE_FAR[move];
  const near = LANE_NEAR[move];
  return far.map((p, i) => p * w + near[i] * (1 - w));
}

/** Sticky lane choice: keeps the current lane unless the model strongly prefers another. */
export function nextLane(current, move, dist, rng) {
  const p = laneProbs(move, dist);
  if (current && rng.next() < 0.93) {
    const idx = LANES.indexOf(current);
    if (p[idx] > 0.12) return current;
  }
  return rng.weighted(LANES.map((l, i) => [l, p[i]]));
}

/** GPS heading offset (deg) from the approach direction, drifting toward the turn near the stop line. */
export function headingOffset(move, dist, rng) {
  const lean = { S: 0, L: -1, R: 1, U: 1.4 }[move];
  const near = Math.max(0, 1 - dist / 45);
  return lean * near * 22 + rng.normal(0, 3);
}
