/* Downloads the OpenStreetMap extracts used to build the mock data.
 *
 *   node scripts/fetch-osm.mjs [--force] [file.json …]
 *
 * Results are cached in scripts/osm-cache/ (OSM data © OpenStreetMap
 * contributors, ODbL). Only needed when regenerating public/data/; the app
 * itself never calls these services. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(here, 'osm-cache');
const FORCE = process.argv.includes('--force');
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const UA = 'GreenLightEVP-prototype/0.1 (MBKS EVP mock-data builder)';
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];

// Kuching South plus a margin so routes to Sarawak General Hospital (just
// outside the MBKS boundary) stay on the network.
const BBOX = '1.470,110.318,1.590,110.428';
const MBKS = 'rel["boundary"="local_authority"]["name"="Majlis Bandaraya Kuching Selatan"]';

const QUERIES = {
  'mbks.json': `[out:json][timeout:90];${MBKS}->.r;.r out geom;.r map_to_area->.a;(node(area.a)["highway"="traffic_signals"];);out;(nwr(area.a)["amenity"="hospital"];);out center tags;`,
  'roads.json': `[out:json][timeout:120];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|unclassified)$"](${BBOX}););out body;>;out skel qt;`,
  'hospitals.json': `[out:json][timeout:60];(nwr["amenity"="hospital"](${BBOX});nwr["healthcare"="hospital"](${BBOX}););out center tags;`,
  'pois.json': `[out:json][timeout:90];${MBKS}->.r;.r map_to_area->.a;(node(area.a)["place"~"^(suburb|neighbourhood|quarter|village|hamlet)$"];nwr(area.a)["amenity"="fire_station"];nwr(area.a)["amenity"~"^(clinic|doctors)$"]["name"~"Klinik Kesihatan",i];nwr(area.a)["landuse"="residential"]["name"~"^Taman",i];);out center tags;`,
  'signal-ways.json': `[out:json][timeout:90];${MBKS}->.r;.r map_to_area->.a;node(area.a)["highway"="traffic_signals"]->.s;way(bn.s)["highway"];out tags geom;`,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith('{')) return text;
      console.warn(`  ${url} → HTTP ${res.status}, retrying`);
    } catch (e) {
      console.warn(`  ${url} → ${e.message}, retrying`);
    }
    await sleep(4000 * (attempt + 1));
  }
  throw new Error('Overpass unavailable');
}

fs.mkdirSync(CACHE, { recursive: true });
for (const [file, query] of Object.entries(QUERIES)) {
  if (ONLY.length && !ONLY.includes(file)) continue;
  const out = path.join(CACHE, file);
  if (!FORCE && fs.existsSync(out)) { console.log(`✓ ${file} (cached)`); continue; }
  console.log(`↓ ${file}`);
  fs.writeFileSync(out, await overpass(query));
  await sleep(2000);
}
console.log('Done. Now run: node scripts/build-data.mjs');
