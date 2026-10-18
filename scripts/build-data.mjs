/* Builds the static mock data in public/data/ from the OpenStreetMap
 * extracts in scripts/osm-cache/ (run scripts/fetch-osm.mjs first).
 *
 *   node scripts/build-data.mjs
 *
 * Writes: network.json, junctions.json, hospitals.json, places.json,
 *         ambulances.json, boundary.json
 * Then run scripts/generate-trips.mjs for the 500 historical trips. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { distance, bearing, angleDiff, project } from '../src/evp/geo.js';
import { RoadNetwork, ROAD_CLASSES } from '../src/evp/network.js';
import { labelArms, buildPhasePlan, analyseRoute } from '../src/evp/junctions.js';
import { Rng } from '../src/evp/rng.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(here, 'osm-cache');
const OUT = path.join(here, '..', 'public', 'data');
const load = (f) => JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8'));
const save = (f, data) => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, f), JSON.stringify(data));
  console.log(`  wrote ${f} (${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)} KB)`);
};
const r5 = (x) => Math.round(x * 1e5) / 1e5;
const rng = new Rng(20240506); // PoC date at Simpang Tiga / Mendu

/* ─── 1. Road graph ───────────────────────────────────────── */
console.log('Building road graph…');
const roads = load('roads.json');
const mbks = load('mbks.json');
const osmNodes = new Map();
roads.elements.filter((e) => e.type === 'node').forEach((n) => osmNodes.set(n.id, [n.lat, n.lon]));
const ways = roads.elements.filter((e) => e.type === 'way');
const signalIds = new Set(mbks.elements.filter((e) => e.tags?.highway === 'traffic_signals').map((e) => e.id));

const CLASS_OF = (hw) => {
  if (hw.endsWith('_link')) return 5;
  return { motorway: 0, trunk: 0, primary: 1, secondary: 2, tertiary: 3, unclassified: 4 }[hw] ?? 4;
};
const SPEED = [70, 60, 50, 40, 30, 40];

const uses = new Map();
ways.forEach((w) => w.nodes.forEach((id, i) => {
  const isEnd = i === 0 || i === w.nodes.length - 1;
  uses.set(id, (uses.get(id) || 0) + (isEnd ? 2 : 1));
}));
const isKey = (id) => uses.get(id) > 1 || signalIds.has(id);

const rawLinks = []; // [osmA, osmB, interior osm ids, cls, speed, name, oneway, flags]
ways.forEach((w) => {
  const t = w.tags;
  let nodes = w.nodes.filter((id) => osmNodes.has(id));
  let oneway = ['yes', '1', 'true'].includes(t.oneway) || ['roundabout', 'circular'].includes(t.junction) || t.highway.startsWith('motorway') ? 1 : 0;
  if (t.oneway === '-1') { nodes = nodes.slice().reverse(); oneway = 1; }
  const cls = CLASS_OF(t.highway);
  const ms = parseInt(t.maxspeed, 10);
  const speed = Number.isFinite(ms) && ms >= 20 && ms <= 110 ? ms : SPEED[cls];
  // Grade-separated (flyover / viaduct / underpass): never part of an at-grade junction.
  const flags = /Flyover/i.test(t.name || '') || t.bridge === 'viaduct' || (t.tunnel && t.tunnel !== 'no') ? 1 : 0;
  let start = 0;
  for (let i = 1; i < nodes.length; i++) {
    if (isKey(nodes[i]) || i === nodes.length - 1) {
      rawLinks.push([nodes[start], nodes[i], nodes.slice(start + 1, i), cls, speed, t.name || t.ref || '', oneway, flags]);
      start = i;
    }
  }
});

// Largest strongly connected component (iterative Kosaraju).
const ids = [...new Set(rawLinks.flatMap((l) => [l[0], l[1]]))];
const idx = new Map(ids.map((id, i) => [id, i]));
const fwd = ids.map(() => []);
const rev = ids.map(() => []);
rawLinks.forEach(([a, b, , , , , ow]) => {
  const ia = idx.get(a); const ib = idx.get(b);
  fwd[ia].push(ib); rev[ib].push(ia);
  if (!ow) { fwd[ib].push(ia); rev[ia].push(ib); }
});
const order = [];
const seen = new Uint8Array(ids.length);
for (let s = 0; s < ids.length; s++) {
  if (seen[s]) continue;
  const stack = [[s, 0]];
  seen[s] = 1;
  while (stack.length) {
    const top = stack[stack.length - 1];
    if (top[1] < fwd[top[0]].length) {
      const v = fwd[top[0]][top[1]++];
      if (!seen[v]) { seen[v] = 1; stack.push([v, 0]); }
    } else { order.push(top[0]); stack.pop(); }
  }
}
const comp = new Int32Array(ids.length).fill(-1);
let nComp = 0;
for (let i = order.length - 1; i >= 0; i--) {
  const s = order[i];
  if (comp[s] >= 0) continue;
  const stack = [s];
  comp[s] = nComp;
  while (stack.length) {
    const u = stack.pop();
    rev[u].forEach((v) => { if (comp[v] < 0) { comp[v] = nComp; stack.push(v); } });
  }
  nComp++;
}
const compSize = new Map();
comp.forEach((c) => compSize.set(c, (compSize.get(c) || 0) + 1));
const mainComp = [...compSize.entries()].sort((a, b) => b[1] - a[1])[0][0];

const keep = ids.filter((id) => comp[idx.get(id)] === mainComp);
const nodeIndex = new Map(keep.map((id, i) => [id, i]));
const names = [];
const nameIdx = new Map();
const nameId = (n) => { if (!nameIdx.has(n)) { nameIdx.set(n, names.length); names.push(n); } return nameIdx.get(n); };
const network = { nodes: [], names, links: [], geom: [] };
keep.forEach((id) => { const [la, ln] = osmNodes.get(id); network.nodes.push(r5(la), r5(ln)); });
rawLinks.forEach(([a, b, interior, cls, speed, name, oneway, flags]) => {
  if (!nodeIndex.has(a) || !nodeIndex.has(b)) return;
  const pts = [a, ...interior, b].map((id) => osmNodes.get(id));
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += distance(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  if (len < 0.5) return;
  network.links.push([nodeIndex.get(a), nodeIndex.get(b), Math.round(len * 10) / 10, speed, cls, nameId(name), oneway, interior.length, flags]);
  interior.forEach((id) => { const [la, ln] = osmNodes.get(id); network.geom.push(r5(la), r5(ln)); });
});
console.log(`  ${keep.length} nodes, ${network.links.length} links (largest SCC of ${ids.length})`);
const net = new RoadNetwork(network);

/* ─── 2. Signalised junction candidates ───────────────────── */
console.log('Clustering signals into junctions…');
const signals = mbks.elements.filter((e) => e.tags?.highway === 'traffic_signals' && nodeIndex.has(e.id));
const clusters = [];
signals.forEach((s) => {
  const c = clusters.find((cl) => cl.some((x) => distance(x.lat, x.lon, s.lat, s.lon) < 70));
  if (c) c.push(s); else clusters.push([s]);
});
// Every named way touching a signal node (including residential side
// roads that are not in the routing graph), used for junction names.
const signalWays = load('signal-ways.json').elements.filter((w) => w.tags?.name && w.geometry);
const HW_RANK = ['trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential'];
function namesNear(lat, lng, radius) {
  return signalWays
    .filter((w) => w.geometry.some((p) => distance(lat, lng, p.lat, p.lon) <= radius + 15))
    .map((w) => ({ name: w.tags.name, rank: HW_RANK.indexOf(w.tags.highway.replace('_link', '')) }))
    .sort((a, b) => (a.rank < 0 ? 9 : a.rank) - (b.rank < 0 ? 9 : b.rank));
}

const LANES = [3, 3, 2, 2, 1, 1];
const undirected = net.nodes.map(() => []);
net.edges.forEach((e) => { undirected[e.from].push(e); });

function findArms(center, nodeIds, radius) {
  const [cLat, cLng] = center;
  const hits = [];
  const visited = new Set();
  const queue = nodeIds.map((n) => ({ n, travelled: 0 }));
  nodeIds.forEach((n) => visited.add(n));
  while (queue.length) {
    const { n, travelled } = queue.shift();
    for (const e of [...undirected[n], ...net.in[n].map((id) => net.edges[id])]) {
      const other = e.from === n ? e.to : e.from;
      if (e.cls === 'link' || e.elevated) continue;
      const geom = e.from === n ? e.geom : e.geom.slice().reverse();
      let acc = travelled;
      let done = false;
      for (let i = 1; i < geom.length; i++) {
        acc += distance(geom[i - 1][0], geom[i - 1][1], geom[i][0], geom[i][1]);
        const dc = distance(cLat, cLng, geom[i][0], geom[i][1]);
        if (dc >= radius + 35) {
          hits.push({ bearing: bearing(cLat, cLng, geom[i][0], geom[i][1]), name: e.name, cls: e.cls });
          done = true;
          break;
        }
        if (acc > 220) { done = true; break; }
      }
      if (!done && !visited.has(other)) { visited.add(other); queue.push({ n: other, travelled: acc }); }
    }
  }
  // Merge hits by bearing (dual carriageways give two nearby bearings).
  const groups = [];
  hits.sort((a, b) => a.bearing - b.bearing).forEach((h) => {
    const g = groups.find((x) => Math.abs(angleDiff(x.bearing, h.bearing)) < 32);
    if (g) { g.items.push(h); g.bearing = g.items[0].bearing + angleDiff(g.items[0].bearing, h.bearing) / 2; } else groups.push({ bearing: h.bearing, items: [h] });
  });
  return groups.map((g) => {
    const counts = {};
    g.items.forEach((h) => { if (h.name) counts[h.name] = (counts[h.name] || 0) + 1; });
    const name = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const cls = g.items.map((h) => h.cls).sort((a, b) => ROAD_CLASSES.indexOf(a) - ROAD_CLASSES.indexOf(b))[0];
    return { bearing: Math.round(((g.bearing % 360) + 360) % 360), road: name, cls, lanes: LANES[ROAD_CLASSES.indexOf(cls)] };
  });
}

const candidates = clusters.map((cl, i) => {
  const lat = cl.reduce((s, x) => s + x.lat, 0) / cl.length;
  const lng = cl.reduce((s, x) => s + x.lon, 0) / cl.length;
  const spread = Math.max(...cl.map((x) => distance(lat, lng, x.lat, x.lon)));
  const radius = Math.min(45, Math.max(14, spread + 10));
  const nodeIds = new Set(cl.map((x) => nodeIndex.get(x.id)));
  net.nodes.forEach(([la, ln], n) => {
    const atGrade = net.out[n].some((id) => !net.edges[id].elevated);
    if (atGrade && distance(lat, lng, la, ln) <= radius) nodeIds.add(n);
  });
  const arms = labelArms(findArms([lat, lng], [...nodeIds], radius));
  // Unnamed arms take the name of a nearby signal-adjacent way in that direction.
  arms.forEach((a) => {
    if (a.road) return;
    const w = signalWays.find((sw) => sw.geometry.some((p) => {
      const d = distance(lat, lng, p.lat, p.lon);
      return d > radius * 0.5 && d < radius + 60 && Math.abs(angleDiff(a.bearing, bearing(lat, lng, p.lat, p.lon))) < 30;
    }));
    if (w) a.road = w.tags.name;
  });
  return { key: i, lat, lng, radius, nodeIds: [...nodeIds], arms, signalCount: cl.length };
}).filter((c) => c.arms.length >= 3 && c.arms.length <= 5);
console.log(`  ${clusters.length} clusters, ${candidates.length} with 3–5 arms`);

/* ─── 3. Hospitals, places, bases ─────────────────────────── */
const hospitalsOsm = load('hospitals.json').elements;
const pois = load('pois.json').elements;
const posOf = (e) => (e.center ? [e.center.lat, e.center.lon] : [e.lat, e.lon]);
const findOsm = (list, re) => list.find((e) => re.test(e.tags?.name || ''));

const HOSPITALS = [
  { id: 'SGH', name: 'Sarawak General Hospital', short: 'SGH', osm: findOsm(hospitalsOsm, /Hospital Umum Sarawak/), type: 'Government (KKM)', emergency: true },
  { id: 'BMC', name: 'Borneo Medical Centre', short: 'BMC', osm: findOsm(hospitalsOsm, /Borneo Medical/), type: 'Private', emergency: true },
  // Not mapped in OpenStreetMap: placed on Jalan Stutong and flagged as approximate.
  { id: 'KPJ', name: 'KPJ Kuching Specialist Hospital', short: 'KPJ', pos: [1.5058, 110.3793], approx: true, type: 'Private', emergency: true },
  { id: 'TMC', name: 'Timberland Medical Centre', short: 'TMC', osm: findOsm(hospitalsOsm, /Timberland/), type: 'Private', emergency: true },
];
// Snap to street level: skip nodes that only touch flyovers or slip roads.
const streetLevel = (n) => net.out[n].some((id) => !/Flyover/i.test(net.edges[id].name) && net.edges[id].cls !== 'link');
const snap = (lat, lng) => {
  let n = -1;
  let best = Infinity;
  net.nodes.forEach(([la, ln], i) => {
    if (!net.out[i].length || !net.in[i].length || !streetLevel(i)) return;
    const d = distance(lat, lng, la, ln);
    if (d < best) { best = d; n = i; }
  });
  return { node: n, snapM: Math.round(distance(lat, lng, ...net.nodes[n])) };
};
const hospitals = HOSPITALS.map((h) => {
  const [lat, lng] = h.pos || posOf(h.osm);
  const s = snap(lat, lng);
  return { id: h.id, name: h.name, short: h.short, type: h.type, lat: r5(lat), lng: r5(lng), node: s.node, approx: Boolean(h.approx), osmId: h.osm?.id || null };
});
hospitals.forEach((h) => console.log(`  hospital ${h.short}: node ${h.node} (${snap(h.lat, h.lng).snapM} m from entrance)`));

const places = pois
  .filter((e) => e.tags?.place || (e.tags?.landuse === 'residential' && /^Taman/i.test(e.tags.name || '')))
  .filter((e) => e.tags?.name && !/Kuarters|Meteorologi/i.test(e.tags.name))
  .map((e) => { const [lat, lng] = posOf(e); const s = snap(lat, lng); return { name: e.tags.name, lat: r5(lat), lng: r5(lng), ...s }; })
  .filter((p) => p.snapM < 450)
  .filter((p, i, arr) => arr.findIndex((q) => q.name === p.name) === i)
  .map((p, i) => ({ id: `P${String(i + 1).padStart(2, '0')}`, name: p.name, lat: p.lat, lng: p.lng, node: p.node }));
console.log(`  ${places.length} pickup places`);

const BASES = [
  { id: 'B-SGH', name: 'SGH Emergency & Trauma Dept', operator: 'JKNS / KKM', hospital: 'SGH' },
  { id: 'B-KKTP', name: 'Klinik Kesihatan Tanah Putih', operator: 'JKNS / KKM', osm: findOsm(pois, /Tanah Putih/) },
  { id: 'B-KKSK', name: 'Klinik Kesihatan Sekama', operator: 'JKNS / KKM', osm: findOsm(pois, /Sekama/) },
  { id: 'B-BTL', name: 'Batu Lintang Fire & Rescue Station', operator: 'BOMBA (EMRS)', osm: findOsm(pois, /Batu Lintang Fire/) },
  { id: 'B-KFS', name: 'Kuching Fire Station', operator: 'BOMBA (EMRS)', osm: findOsm(pois, /^Kuching Fire Station/) },
  { id: 'B-BMC', name: 'BMC ambulance bay', operator: 'Borneo Medical Centre', hospital: 'BMC' },
  { id: 'B-TMC', name: 'TMC ambulance bay', operator: 'Timberland Medical Centre', hospital: 'TMC' },
  { id: 'B-KPJ', name: 'KPJ ambulance bay', operator: 'KPJ Kuching', hospital: 'KPJ' },
].map((b) => {
  if (b.hospital) { const h = hospitals.find((x) => x.id === b.hospital); return { ...b, lat: h.lat, lng: h.lng, node: h.node }; }
  const [lat, lng] = posOf(b.osm);
  return { id: b.id, name: b.name, operator: b.operator, lat: r5(lat), lng: r5(lng), node: snap(lat, lng).node };
});

/* ─── 4. Choose the 22 junctions by ambulance-corridor coverage ── */
console.log('Ranking junctions by ambulance corridor coverage…');
const routeCover = new Map();
const pairs = [];
places.forEach((p) => hospitals.forEach((h) => pairs.push([p.node, h.node, 1.0])));
BASES.forEach((b) => places.forEach((p) => pairs.push([b.node, p.node, 0.5])));
pairs.forEach(([a, b, w]) => {
  const r = net.route(a, b);
  if (!r || !r.edges.length) return;
  const { line, spans } = net.buildPolyline(r.edges);
  analyseRoute(r, line, spans, candidates.map((c) => ({ ...c, id: c.key, stopOffset: c.radius }))).forEach((x) => {
    routeCover.set(x.junctionId, (routeCover.get(x.junctionId) || 0) + w);
  });
});

const isPoc = (c) => {
  const roads = c.arms.map((a) => a.road).join(' ');
  return /Mendu/.test(roads) && /Simpang Tiga/.test(roads);
};
const ranked = candidates
  .map((c) => ({ ...c, cover: routeCover.get(c.key) || 0 }))
  .sort((a, b) => (isPoc(b) - isPoc(a)) || b.cover - a.cover);
const chosen = ranked.slice(0, 22);
chosen.forEach((c) => console.log(`  ${c.cover.toFixed(1).padStart(6)}  ${c.arms.map((a) => `${a.id}:${a.road || '?'}`).join(' | ')}`));
console.log(`  next best not chosen: ${ranked.slice(22, 26).map((c) => `${c.cover.toFixed(1)} ${c.arms.map((a) => a.road).join('/')}`).join(' ; ')}`);

/* ─── 5. Junction records ─────────────────────────────────── */
function junctionName(c) {
  const seenNames = [];
  c.arms.slice().sort((a, b) => ROAD_CLASSES.indexOf(a.cls) - ROAD_CLASSES.indexOf(b.cls)).forEach((a) => {
    if (a.road && !seenNames.includes(a.road)) seenNames.push(a.road);
  });
  // Side roads that are not in the routing graph (residential) still name the junction.
  namesNear(c.lat, c.lng, c.radius).forEach(({ name }) => {
    if (seenNames.length < 2 && !seenNames.includes(name)) seenNames.push(name);
  });
  return seenNames.slice(0, 3).join(' / ') || 'Unnamed junction';
}

// Hourly congestion shape (0–1): AM peak, lunch, PM peak, small late peak.
const BASE_CURVE = [0.12, 0.08, 0.06, 0.06, 0.08, 0.18, 0.42, 0.78, 0.86, 0.6, 0.5, 0.55, 0.66, 0.6, 0.52, 0.56, 0.7, 0.88, 0.84, 0.62, 0.48, 0.38, 0.26, 0.18];
const WEEKEND_CURVE = [0.16, 0.12, 0.08, 0.06, 0.06, 0.1, 0.18, 0.3, 0.42, 0.52, 0.6, 0.66, 0.68, 0.64, 0.6, 0.6, 0.64, 0.68, 0.66, 0.6, 0.52, 0.42, 0.3, 0.22];

const junctions = chosen
  .sort((a, b) => b.cover - a.cover)
  .map((c, i) => {
    const id = `J${String(i + 1).padStart(2, '0')}`;
    const plan = buildPhasePlan(c.arms);
    const poc = isPoc(c);
    const totalLanes = c.arms.reduce((s, a) => s + a.lanes, 0);
    const busy = Math.min(1, 0.55 + c.cover / (ranked[0].cover * 2) + rng.float(-0.08, 0.08));
    const scale = (curve) => curve.map((v) => Math.round(Math.min(0.97, v * busy * rng.float(0.92, 1.08) + (poc ? 0.04 : 0)) * 100) / 100);
    const crossing = Math.max(...c.arms.map((a) => a.lanes)) * 2 * 3.5 + 2;
    const totalW = plan.phases.reduce((s, p) => s + p.weight, 0);
    return {
      id,
      name: junctionName(c),
      scatsSite: `KS-${101 + i}`,
      lat: r5(c.lat),
      lng: r5(c.lng),
      radius: Math.round(c.radius),
      stopOffset: Math.round(c.radius),
      nodeIds: c.nodeIds,
      arms: c.arms,
      phases: plan.phases.map(({ weight, ...p }) => ({ ...p, split: weight ? Math.round((weight / totalW) * 100) / 100 : 0 })),
      sequence: plan.sequence,
      movements: plan.moves,
      timing: { amber: 3, allRed: 2, minGreen: 6, maxGreen: 70, pedWalk: 7, pedClear: Math.round(crossing / 1.2), cycleMin: 80, cycleMax: 150 },
      lanes: totalLanes,
      congestion: { weekday: scale(BASE_CURVE), weekend: scale(WEEKEND_CURVE) },
      // Reported collision / near-miss history (mock) used in rollout ranking.
      incidents: { ambulanceCollisions: 0, nearMisses: rng.int(1, 6) + Math.round(c.cover / 40), redLightCrossings: rng.int(8, 30) + Math.round(c.cover / 8) },
      corridorCoverage: Math.round(c.cover),
      poc,
    };
  });
// Five reported ambulance collisions since 2021, spread over busy junctions.
[0, 1, 0, 3, 6].forEach((k) => { junctions[k].incidents.ambulanceCollisions += 1; });
const poc = junctions.find((j) => j.poc);
console.log(`  PoC junction: ${poc?.id} ${poc?.name}`);

/* ─── 6. Ambulances ───────────────────────────────────────── */
const FLEET = [
  ['B-SGH', 6, 'JKNS / KKM', 'Type B ambulance'], ['B-KKTP', 2, 'JKNS / KKM', 'Type B ambulance'], ['B-KKSK', 2, 'JKNS / KKM', 'Type B ambulance'],
  ['B-BTL', 2, 'BOMBA EMRS', 'EMRS unit'], ['B-KFS', 2, 'BOMBA EMRS', 'EMRS unit'],
  ['B-BMC', 2, 'Borneo Medical Centre', 'Type B ambulance'], ['B-TMC', 2, 'Timberland Medical Centre', 'Type B ambulance'], ['B-KPJ', 2, 'KPJ Kuching', 'Type B ambulance'],
];
const ambulances = [];
FLEET.forEach(([base, count, operator, type]) => {
  for (let k = 0; k < count; k++) {
    const n = ambulances.length + 1;
    ambulances.push({
      id: `AMB-${String(n).padStart(2, '0')}`,
      callsign: `${base.replace('B-', '')}-${k + 1}`,
      plate: `QAA ${2100 + n * 7} ${String.fromCharCode(65 + (n % 6))}`,
      obuId: `OBU-KS-${(0x3a00 + n * 17).toString(16).toUpperCase()}`,
      operator,
      type,
      base,
      registered: '2026-06-02',
    });
  }
});

/* ─── 7. MBKS boundary (outline for the map) ──────────────── */
const rel = mbks.elements.find((e) => e.type === 'relation');
const outer = rel.members.filter((m) => m.role === 'outer' && m.geometry).map((m) => m.geometry.map((p) => [r5(p.lat), r5(p.lon)]));
// Stitch member ways into rings.
const rings = [];
const segs = outer.slice();
while (segs.length) {
  let ring = segs.shift();
  let grew = true;
  while (grew) {
    grew = false;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const end = ring[ring.length - 1];
      const same = (a, b) => a[0] === b[0] && a[1] === b[1];
      if (same(end, s[0])) ring = ring.concat(s.slice(1));
      else if (same(end, s[s.length - 1])) ring = ring.concat(s.slice().reverse().slice(1));
      else continue;
      segs.splice(i, 1); grew = true; break;
    }
  }
  rings.push(ring);
}
const thin = (ring) => ring.filter((_, i) => i % 3 === 0 || i === ring.length - 1);

/* ─── Write ───────────────────────────────────────────────── */
console.log('Writing public/data…');
const ATTR = 'Road network, junction locations and place names © OpenStreetMap contributors (ODbL). Signal timings, congestion and incidents are simulated.';
save('network.json', { attribution: ATTR, ...network });
save('junctions.json', { attribution: ATTR, junctions });
save('hospitals.json', { hospitals });
save('places.json', { places, bases: BASES.map(({ osm, hospital, ...b }) => b) });
save('ambulances.json', { ambulances });
save('boundary.json', { name: 'Majlis Bandaraya Kuching Selatan', areaKm2: 61.53, rings: rings.map(thin) });
console.log('Done.');
void project;
