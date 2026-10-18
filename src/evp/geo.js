/* Geometry helpers on a local flat-earth projection. Kuching South spans
   ~12 km, so an equirectangular projection is accurate to well under 1 m. */

const R = 6371008.8;
const RAD = Math.PI / 180;
export const REF_LAT = 1.53;
const COS_REF = Math.cos(REF_LAT * RAD);

/** Metres east/north of (0,0) for a lat/lng pair. */
export function project(lat, lng) {
  return [lng * RAD * R * COS_REF, lat * RAD * R];
}

export function unproject(x, y) {
  return [y / (RAD * R), x / (RAD * R * COS_REF)];
}

export function distance(lat1, lng1, lat2, lng2) {
  const dx = (lng2 - lng1) * RAD * R * COS_REF;
  const dy = (lat2 - lat1) * RAD * R;
  return Math.hypot(dx, dy);
}

/** Compass bearing in degrees (0 = north, 90 = east). */
export function bearing(lat1, lng1, lat2, lng2) {
  const dx = (lng2 - lng1) * COS_REF;
  const dy = lat2 - lat1;
  return (Math.atan2(dx, dy) / RAD + 360) % 360;
}

/** Signed difference b - a in (-180, 180]; positive = clockwise. */
export function angleDiff(a, b) {
  let d = ((b - a) % 360 + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

export const COMPASS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass8 = (deg) => COMPASS_8[Math.round(((deg % 360) + 360) % 360 / 45) % 8];

/** Distance from point p to segment ab, all as [x, y] metres. Returns { d, t }. */
export function pointSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}

/**
 * Polyline with cumulative distances, for position/heading lookups by
 * distance along a route.
 */
export class Polyline {
  constructor(latlngs) {
    this.pts = latlngs;
    this.xy = latlngs.map(([la, ln]) => project(la, ln));
    this.cum = [0];
    for (let i = 1; i < this.xy.length; i++) {
      const [x0, y0] = this.xy[i - 1];
      const [x1, y1] = this.xy[i];
      this.cum.push(this.cum[i - 1] + Math.hypot(x1 - x0, y1 - y0));
    }
    this.length = this.cum[this.cum.length - 1] || 0;
  }

  _index(d) {
    const { cum } = this;
    if (d <= 0) return 0;
    if (d >= this.length) return Math.max(0, cum.length - 2);
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= d) lo = mid; else hi = mid;
    }
    return lo;
  }

  /** [lat, lng] at distance d along the line. */
  at(d) {
    if (this.pts.length === 1) return this.pts[0];
    const i = this._index(d);
    const seg = this.cum[i + 1] - this.cum[i];
    const t = seg > 0 ? Math.max(0, Math.min(1, (d - this.cum[i]) / seg)) : 0;
    const [la0, ln0] = this.pts[i];
    const [la1, ln1] = this.pts[i + 1];
    return [la0 + (la1 - la0) * t, ln0 + (ln1 - ln0) * t];
  }

  /** Heading (deg) of the line around distance d, smoothed over `span` metres. */
  headingAt(d, span = 12) {
    const a = this.at(Math.max(0, d - span / 2));
    const b = this.at(Math.min(this.length, d + span / 2));
    if (a[0] === b[0] && a[1] === b[1]) return 0;
    return bearing(a[0], a[1], b[0], b[1]);
  }

  /** Bearing between two distances along the line. */
  bearingBetween(d0, d1) {
    const a = this.at(Math.max(0, d0));
    const b = this.at(Math.min(this.length, d1));
    return bearing(a[0], a[1], b[0], b[1]);
  }

  /** Nearest point on the line to (lat, lng): { d (along), off (metres away) }. */
  locate(lat, lng, fromD = 0, toD = Infinity) {
    const [px, py] = project(lat, lng);
    let best = { d: 0, off: Infinity };
    const start = this._index(Math.max(0, fromD));
    for (let i = start; i < this.xy.length - 1; i++) {
      if (this.cum[i] > toD) break;
      const [ax, ay] = this.xy[i];
      const [bx, by] = this.xy[i + 1];
      const { d, t } = pointSegment(px, py, ax, ay, bx, by);
      if (d < best.off) best = { d: this.cum[i] + t * (this.cum[i + 1] - this.cum[i]), off: d };
    }
    return best;
  }

  /** Sub-polyline [d0, d1] as lat/lng points. */
  slice(d0, d1) {
    const out = [this.at(d0)];
    for (let i = 0; i < this.cum.length; i++) {
      if (this.cum[i] > d0 && this.cum[i] < d1) out.push(this.pts[i]);
    }
    out.push(this.at(d1));
    return out;
  }
}
