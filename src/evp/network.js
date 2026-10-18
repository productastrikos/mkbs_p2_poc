/* Road network: a directed graph built from OpenStreetMap ways (see
   scripts/build-data.mjs), with fastest-path routing and a spatial index for
   "is this GPS fix on a road?" checks. */
import { project, pointSegment, Polyline, distance } from './geo.js';

export const ROAD_CLASSES = ['trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'link'];

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const { k, v } = this;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const { k, v } = this;
    const topV = v[0];
    const lastK = k.pop();
    const lastV = v.pop();
    if (k.length) {
      let i = 0;
      const n = k.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lastK) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lastK; v[i] = lastV;
    }
    return topV;
  }
}

const CELL = 120; // metres, spatial grid cell size

export class RoadNetwork {
  /**
   * json = {
   *   nodes: [lat0, lng0, lat1, lng1, …],
   *   names: ['Jalan Rock', …],
   *   links: [[a, b, lengthM, speedKph, classIdx, nameIdx, oneway, geomCount, flags], …],
   *          flags bit 0 = grade-separated (flyover, viaduct, underpass)
   *   geom:  [lat, lng, …]   interior points of each link, in link order
   * }
   */
  constructor(json) {
    this.names = json.names;
    const n = json.nodes.length / 2;
    this.nodes = new Array(n);
    for (let i = 0; i < n; i++) this.nodes[i] = [json.nodes[2 * i], json.nodes[2 * i + 1]];

    this.edges = [];
    this.out = Array.from({ length: n }, () => []);
    this.in = Array.from({ length: n }, () => []);
    let g = 0;
    for (const [a, b, len, speed, cls, name, oneway, count, flags = 0] of json.links) {
      const interior = [];
      for (let j = 0; j < count; j++, g++) interior.push([json.geom[2 * g], json.geom[2 * g + 1]]);
      const geom = [this.nodes[a], ...interior, this.nodes[b]];
      const elevated = Boolean(flags & 1);
      this._addEdge(a, b, len, speed, cls, name, geom, elevated);
      if (!oneway) this._addEdge(b, a, len, speed, cls, name, geom.slice().reverse(), elevated);
    }
    this._buildGrid();
  }

  _addEdge(from, to, len, speed, cls, name, geom, elevated) {
    const id = this.edges.length;
    const e = { id, from, to, len, speed, cls: ROAD_CLASSES[cls], name: this.names[name] || '', geom, elevated, time: len / (speed / 3.6) };
    this.edges.push(e);
    this.out[from].push(id);
    this.in[to].push(id);
  }

  _buildGrid() {
    this.grid = new Map();
    const seen = new Set();
    this.edges.forEach((e) => {
      // Both directions share geometry; index each road segment once.
      const key = e.from < e.to ? `${e.from}-${e.to}-${e.len}` : `${e.to}-${e.from}-${e.len}`;
      if (seen.has(key)) return;
      seen.add(key);
      const xy = e.geom.map(([la, ln]) => project(la, ln));
      for (let i = 0; i < xy.length - 1; i++) {
        const [ax, ay] = xy[i];
        const [bx, by] = xy[i + 1];
        const x0 = Math.floor(Math.min(ax, bx) / CELL);
        const x1 = Math.floor(Math.max(ax, bx) / CELL);
        const y0 = Math.floor(Math.min(ay, by) / CELL);
        const y1 = Math.floor(Math.max(ay, by) / CELL);
        for (let cx = x0; cx <= x1; cx++) {
          for (let cy = y0; cy <= y1; cy++) {
            const k = `${cx},${cy}`;
            if (!this.grid.has(k)) this.grid.set(k, []);
            this.grid.get(k).push([ax, ay, bx, by, e.id]);
          }
        }
      }
    });
  }

  /** Distance in metres from (lat, lng) to the nearest road, capped at `max`. */
  distanceToRoad(lat, lng, max = 400) {
    const [px, py] = project(lat, lng);
    const r = Math.ceil(max / CELL);
    const cx = Math.floor(px / CELL);
    const cy = Math.floor(py / CELL);
    let best = max;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const segs = this.grid.get(`${cx + dx},${cy + dy}`);
        if (!segs) continue;
        for (const [ax, ay, bx, by] of segs) {
          const { d } = pointSegment(px, py, ax, ay, bx, by);
          if (d < best) best = d;
        }
      }
    }
    return best;
  }

  /** Nearest graph node with at least one outgoing and incoming edge. */
  nearestNode(lat, lng) {
    let best = -1;
    let bestD = Infinity;
    this.nodes.forEach(([la, ln], i) => {
      if (!this.out[i].length || !this.in[i].length) return;
      const d = distance(lat, lng, la, ln);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  /** Fastest path. Returns { nodes, edges, length, time } or null. */
  route(from, to, { penalty } = {}) {
    if (from === to) return { nodes: [from], edges: [], length: 0, time: 0 };
    const n = this.nodes.length;
    const dist = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const heap = new MinHeap();
    dist[from] = 0;
    heap.push(0, from);
    while (heap.size) {
      const u = heap.pop();
      if (u === to) break;
      const du = dist[u];
      for (const eid of this.out[u]) {
        const e = this.edges[eid];
        const w = e.time + (penalty ? penalty(e) : 0);
        const nd = du + w;
        if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = eid; heap.push(nd, e.to); }
      }
    }
    if (dist[to] === Infinity) return null;
    const edges = [];
    for (let v = to; v !== from; v = this.edges[prev[v]].from) edges.push(prev[v]);
    edges.reverse();
    return this.pathFromEdges(edges);
  }

  /** Travel time (s) from every node to `to` (reverse Dijkstra). */
  costsTo(to) {
    const n = this.nodes.length;
    const dist = new Float64Array(n).fill(Infinity);
    const heap = new MinHeap();
    dist[to] = 0;
    heap.push(0, to);
    while (heap.size) {
      const u = heap.pop();
      const du = dist[u];
      for (const eid of this.in[u]) {
        const e = this.edges[eid];
        const nd = du + e.time;
        if (nd < dist[e.from]) { dist[e.from] = nd; heap.push(nd, e.from); }
      }
    }
    return dist;
  }

  pathFromEdges(edges) {
    const nodes = edges.length ? [this.edges[edges[0]].from, ...edges.map((id) => this.edges[id].to)] : [];
    return {
      nodes,
      edges,
      length: edges.reduce((s, id) => s + this.edges[id].len, 0),
      time: edges.reduce((s, id) => s + this.edges[id].time, 0),
    };
  }

  /** Edge ids for a node path (picks the shortest parallel edge). */
  edgesForNodes(nodes) {
    const out = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      let best = null;
      for (const eid of this.out[nodes[i]]) {
        const e = this.edges[eid];
        if (e.to === nodes[i + 1] && (!best || e.len < best.len)) best = e;
      }
      if (!best) return null;
      out.push(best.id);
    }
    return out;
  }

  /**
   * Polyline for an edge path, plus per-edge spans along it:
   * spans[i] = { edge, d0, d1 } so speed limits and names can be looked up by distance.
   */
  buildPolyline(edgeIds) {
    const pts = [];
    edgeIds.forEach((id, i) => {
      const g = this.edges[id].geom;
      pts.push(...(i === 0 ? g : g.slice(1)));
    });
    const line = new Polyline(pts.length ? pts : [[0, 0]]);
    const spans = [];
    let idx = 0;
    edgeIds.forEach((id) => {
      const g = this.edges[id].geom;
      const d0 = line.cum[idx];
      idx += g.length - 1;
      spans.push({ edge: this.edges[id], d0, d1: line.cum[idx] });
    });
    return { line, spans };
  }
}

/** The edge span covering distance d (binary search over spans). */
export function spanAt(spans, d) {
  let lo = 0;
  let hi = spans.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (spans[mid].d0 <= d) lo = mid; else hi = mid - 1;
  }
  return spans[lo];
}
