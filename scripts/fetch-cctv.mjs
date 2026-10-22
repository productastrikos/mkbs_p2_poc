/* Downloads the stand-in CCTV footage and builds the camera manifest.
 *
 *   node scripts/fetch-cctv.mjs [--force]
 *
 * MBKS junction cameras are not available to this prototype. Every
 * signalised approach of the 22 junctions gets a camera, and each camera
 * plays a clip from a small library of openly licensed traffic footage
 * shot the way junction CCTV is: from a fixed, elevated point (a pole,
 * gantry, footbridge or building) looking down on the road. Sources are
 * Wikimedia Commons (CC BY / CC BY-SA / CC0 / public domain) and Coverr
 * (Coverr License: free to use and modify, no attribution required; we
 * credit it anyway).
 *
 * Every clip is trimmed to a steady single shot, cropped to 16:9, scaled to
 * 640×360 at 15 fps, given a CCTV look (muted colour, a little contrast,
 * sensor noise, lens vignette), stripped of audio and cross-faded at the
 * loop point. Clips filmed in right-hand-traffic countries are mirrored so
 * vehicles keep left as they do in Kuching (clips with legible signs are
 * left as filmed). The manifest (public/data/cameras.json)
 * records author, licence, source and every change so the app can credit
 * each clip.
 *
 * Needs ffmpeg on the PATH (or FFMPEG=/path/to/ffmpeg). Source files are
 * cached in the OS temp folder; the app itself never calls these sites. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const OUT_DIR = path.join(ROOT, 'public', 'cctv');
const MANIFEST = path.join(ROOT, 'public', 'data', 'cameras.json');
const JUNCTIONS = path.join(ROOT, 'public', 'data', 'junctions.json');
const CACHE = path.join(os.tmpdir(), 'greenlight-cctv');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FORCE = process.argv.includes('--force');
const UA = 'GreenLightEVP-prototype/0.1 (MBKS EVP mock-data builder)';
const API = 'https://commons.wikimedia.org/w/api.php';

const W = 640;
const H = 360;
const FPS = 15;
const FADE_S = 1;

/* The footage library. `kind` says what the camera sees and decides which
   approaches can use the clip (by the approach's OSM road class):
     junction    an intersection or crossing seen from above (any road)
     street      an urban street from a pole or building (primary and minor roads)
     arterial    a divided multi-lane road from a footbridge (trunk and primary)
     expressway  a motorway from a gantry or bridge (trunk roads only)
   `mirror` flips a right-hand-traffic clip so traffic keeps left.
   `ptz` marks a clip that pans (a PTZ camera on tour: no loop cross-fade).
   Order matters: earlier clips are preferred when usage is tied, so the
   clearest junction views come first. */
const CLIPS = [
  { id: 'bengaluru-banashankari-a', provider: 'commons', kind: 'junction', file: 'Banashankari traffic circle, Banashankari, Bangalore (2024) 02.ogg', start: 19, end: 29.3, place: 'Banashankari, Bengaluru, India' },
  { id: 'bengaluru-bda-junction', provider: 'commons', kind: 'junction', file: 'Top view of BDA link road junction, Banashankari 6th stage, Bengaluru (2026).webm', start: 0, end: 30, place: 'Banashankari 6th Stage, Bengaluru, India' },
  { id: 'coverr-road-traffic', provider: 'coverr', kind: 'junction', slug: 'road-traffic-3374', page: 'road-traffic-0blhjb3eik', title: 'Road traffic', start: 0, end: 18.8, mirror: true, place: null },
  { id: 'tokyo-shinanomachi', provider: 'commons', kind: 'street', file: 'Southeast view from the Shinanomachi Station footbridge, 9 December 2024.webm', start: 0, end: 8.5, place: 'Shinanomachi, Shinjuku, Tokyo, Japan' },
  { id: 'cuttack-link-road', provider: 'commons', kind: 'street', file: 'Moving vehicles in Link road, Cuttack, Odisha.webm', start: 10, end: 40, place: 'Link Road, Cuttack, Odisha, India' },
  { id: 'hcmc-district-7', provider: 'commons', kind: 'street', file: 'Traffic-d7-high.webm', start: 0, end: 8.4, mirror: true, place: 'District 7, Ho Chi Minh City, Vietnam' },
  { id: 'coverr-vilnius-crossing', provider: 'coverr', kind: 'street', slug: 'people-crossing-the-street-on-gedinimo-avenue-5358', page: 'people-crossing-the-street-on-gedinimo-avenue-lld3amgmdb', title: 'People crossing the street on Gedinimo Avenue', start: 0, end: 14.1, mirror: true, place: 'Gediminas Avenue, Vilnius, Lithuania' },
  { id: 'coverr-nyc-downtown', provider: 'coverr', kind: 'street', slug: 'traffic-in-downtown-nyc-7224', page: 'traffic-in-downtown-nyc-lxzezmug1m', title: 'Traffic in downtown NYC', start: 0, end: 12.3, mirror: true, place: 'New York City, USA' },
  { id: 'tbilisi-embankment', provider: 'commons', kind: 'street', file: 'Tbilisi (3).ogv', start: 0, end: 16.9, mirror: true, place: 'Heydar Aliyev Right Embankment, Tbilisi, Georgia' },
  { id: 'gothenburg-garda', provider: 'commons', kind: 'arterial', file: 'Changing lanes in Gothenburg ubt.ogv', start: 0, end: 34.5, mirror: true, place: 'Gårda, Gothenburg, Sweden', author: 'Tomasz Sienicki (tsca)' },
  { id: 'bengaluru-nice-road-a', provider: 'commons', kind: 'arterial', file: 'NICE Road Clover leaf junction (2025) 05.webm', start: 2, end: 32, place: 'NICE Road, Bengaluru, India' },
  { id: 'bengaluru-nice-road-b', provider: 'commons', kind: 'arterial', file: 'NICE Road Clover leaf junction (2025) 04.webm', start: 0, end: 30, place: 'NICE Road, Bengaluru, India' },
  { id: 'liverpool-m62', provider: 'commons', kind: 'expressway', file: 'M62 motorway from the Greystone Road footbridge.ogv', start: 0, end: 30.7, place: 'M62 motorway, Broadgreen, Liverpool, UK' },
  { id: 'dortmund-a40', provider: 'commons', kind: 'expressway', file: 'Motorway A40 - on bridge above the traffic.webm', start: 0, end: 24.5, mirror: true, place: 'A40 motorway, Dortmund, Germany', author: 'Kathinka Engels' },
  { id: 'bethesda-i495', provider: 'commons', kind: 'expressway', file: 'I495 towards i270 spur from bradley blvd 20201123 171152609.webm', start: 0, end: 30, mirror: true, place: 'I-495 from Bradley Boulevard, Bethesda, Maryland, USA' },
  { id: 'chicago-jane-byrne', provider: 'commons', kind: 'expressway', file: 'Jane M. Bryne Interchange 4-1-22.webm', start: 0, end: 32, mirror: true, place: 'Jane Byrne Interchange, Chicago, USA' },
  { id: 'tel-aviv-ayalon-a', provider: 'commons', kind: 'expressway', file: 'Ayalon Freeway Azriely Towers View P1150161.ogv', start: 0, end: 6, place: 'Ayalon Freeway, Tel Aviv, Israel' },
  { id: 'tel-aviv-ayalon-b', provider: 'commons', kind: 'expressway', file: 'Ayalon Freeway Azriely Towers View P1150162.ogv', start: 0, end: 10, place: 'Ayalon Freeway, Tel Aviv, Israel' },
  { id: 'coverr-highway-overhead', provider: 'coverr', kind: 'expressway', slug: 'overhead-view-of-the-highway-8903', page: 'overhead-view-of-the-highway-9ejgoxnsm3', title: 'Overhead view of the highway', start: 0, end: 13, mirror: true, place: null },
  { id: 'coverr-highway-bridge', provider: 'coverr', kind: 'expressway', slug: 'cars-on-the-highway-2993', page: 'cars-on-the-highway-axikfcuht6', title: 'Cars on the highway', start: 0, end: 13.5, mirror: true, place: null },
  { id: 'bengaluru-banashankari-ptz', provider: 'commons', kind: 'junction', ptz: true, file: 'Banashankari traffic circle, Banashankari, Bangalore (2024) 01.ogg', start: 0, end: 22, place: 'Banashankari, Bengaluru, India' },
  { id: 'bengaluru-nice-road-ptz', provider: 'commons', kind: 'arterial', ptz: true, file: 'NICE Road Clover leaf junction (2025) 06.webm', start: 0, end: 15.2, place: 'NICE Road, Bengaluru, India' },
];

const COVERR_LICENCE = { licence: 'Coverr License', licenceUrl: 'https://coverr.co/license' };
const LICENCE_URL = { 'Public domain': 'https://commons.wikimedia.org/wiki/Help:Public_domain', CC0: 'https://creativecommons.org/publicdomain/zero/1.0/' };
const strip = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
// Commons dates come as '2024-08-31 10:12', 'Taken on 11 October 2017 (the
// date provided ...)', '2010s'...: the first date in the text is the one.
function recordedDate(raw) {
  const s = strip(raw);
  const dmy = /(\d{1,2}) ([A-Za-z]+) (\d{4})/.exec(s);
  const month = dmy ? MONTHS.indexOf(dmy[2].toLowerCase()) : -1;
  const found = [
    /\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])/.exec(s),
    month >= 0 && Object.assign([`${dmy[3]}-${String(month + 1).padStart(2, '0')}-${dmy[1].padStart(2, '0')}`], { index: dmy.index }),
    /\d{4}s?(?!\d)/.exec(s),
  ].filter(Boolean);
  return found.sort((a, b) => a.index - b.index)[0]?.[0] || null;
}

async function commons(params) {
  const u = new URL(API);
  Object.entries({ format: 'json', ...params }).forEach(([k, v]) => u.searchParams.set(k, v));
  const res = await fetch(u, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Commons API HTTP ${res.status}`);
  return res.json();
}

async function commonsMetadata(files) {
  const r = await commons({ action: 'query', titles: files.map((f) => `File:${f}`).join('|'), prop: 'videoinfo|categories', viprop: 'url|size|extmetadata|derivatives', cllimit: 'max' });
  const byTitle = new Map(Object.values(r.query.pages).map((p) => [p.title.replace(/^File:/, ''), p]));
  return new Map(files.map((f) => {
    const p = byTitle.get(f);
    const v = p?.videoinfo?.[0];
    if (!v) throw new Error(`Not found on Commons: ${f}`);
    // Only files whose licence Commons has accepted (e.g. not YouTube imports awaiting review).
    const flag = (p.categories || []).map((c) => c.title).find((c) => /licen[cs]e review needed|deletion|copyright violation|unknown copyright|no permission|no source/i.test(c));
    if (flag) throw new Error(`Licence not settled on Commons (${flag}): ${f}`);
    const m = v.extmetadata || {};
    // A 480p transcode is plenty for a 640×360 output; fall back to the original.
    const src = v.derivatives?.find((d) => d.transcodekey === '480p.vp9.webm') || { src: v.url };
    const licence = m.LicenseShortName?.value || 'unknown';
    return [f, {
      title: f, author: strip(m.Artist?.value), licence, licenceUrl: m.LicenseUrl?.value || LICENCE_URL[licence] || null,
      sourceUrl: v.descriptionurl, recorded: recordedDate(m.DateTimeOriginal?.value), original: `${v.width}×${v.height}`, download: src.src,
    }];
  }));
}

async function download(url, dest) {
  if (fs.existsSync(dest) && !FORCE) return;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}): ${url}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  await sleep(500);
}

// Windows can briefly lock a file that was just written (virus scan, a dev
// server serving it); try again before giving up.
function ffmpeg(args) {
  for (let attempt = 1; ; attempt++) {
    try { execFileSync(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] }); return; } catch (e) {
      if (attempt >= 3) { process.stderr.write(String(e.stderr || '')); throw e; }
    }
  }
}

function probeSize(file) {
  try { execFileSync(FFMPEG, ['-hide_banner', '-i', file], { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) {
    const m = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(String(e.stderr));
    if (m) return `${m[1]}×${m[2]}`;
  }
  return null;
}

/* The CCTV look: junction cameras record at modest resolution and frame
   rate, with flatter colour than a phone, sensor noise and lens fall-off. */
const LOOK = `eq=saturation=0.78:contrast=1.07:brightness=-0.01,gblur=sigma=0.5,noise=alls=7:allf=t,vignette=angle=PI/5`;

function encode(clip, input, out) {
  const len = clip.end - clip.start;
  const shape = `crop='min(iw,ih*16/9)':'min(ih,iw*9/16)',scale=${W}:${H},setsar=1,fps=${FPS}${clip.mirror ? ',hflip' : ''},${LOOK}`;
  // Cross-fade the last second into the first so the loop has no jump cut.
  // A PTZ tour ends on a different view, so it loops with a plain cut.
  const fade = !clip.ptz;
  const graph = fade
    ? `[0:v]${shape},split[a][b];[a]trim=start=${FADE_S},setpts=PTS-STARTPTS[a2];[b]trim=end=${FADE_S},setpts=PTS-STARTPTS[b2];[a2][b2]xfade=transition=fade:duration=${FADE_S}:offset=${(len - 2 * FADE_S).toFixed(2)}[v]`
    : `[0:v]${shape}[v]`;
  ffmpeg(['-loglevel', 'error', '-y', '-ss', String(clip.start), '-t', len.toFixed(2), '-i', input,
    '-filter_complex', graph, '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-profile:v', 'main',
    '-pix_fmt', 'yuv420p', '-g', String(FPS * 2), '-movflags', '+faststart', out]);
  ffmpeg(['-loglevel', 'error', '-y', '-ss', '1', '-i', out, '-frames:v', '1', '-q:v', '6', out.replace(/\.mp4$/, '.jpg')]);
  return { durationS: Math.round((fade ? len - FADE_S : len) * 10) / 10, fade };
}

/* One camera per signalised approach. A camera gets a clip suited to its
   road (motorway footage only on trunk roads), never the same clip as
   another camera at its junction, and the least-used clip otherwise, so
   the library is spread evenly across the network. The proof-of-concept
   junction is assigned first. */
const FITS = { junction: ['trunk', 'primary', 'minor'], street: ['primary', 'minor'], arterial: ['trunk', 'primary'], expressway: ['trunk'] };
function assignCameras(junctions, clips) {
  const used = new Map(clips.map((c) => [c.id, 0]));
  const road = (arm) => (arm.cls === 'motorway' || arm.cls === 'trunk' ? 'trunk' : arm.cls === 'primary' ? 'primary' : 'minor');
  const fits = (clip, arm) => FITS[clip.kind].includes(road(arm));
  // When usage is tied the most road-specific footage wins, except at the
  // proof-of-concept junction, which shows whole-junction views first.
  const affinity = (clip, j) => (j.poc ? ['junction', 'street', 'arterial', 'expressway'] : ['expressway', 'arterial', 'street', 'junction']).indexOf(clip.kind);
  const order = [...junctions].sort((a, b) => (b.poc ? 1 : 0) - (a.poc ? 1 : 0) || a.id.localeCompare(b.id));
  const cameras = [];
  for (const j of order) {
    const taken = new Set();
    for (const arm of j.arms) {
      const pick = clips
        .filter((c) => !taken.has(c.id) && fits(c, arm))
        .sort((a, b) => used.get(a.id) - used.get(b.id) || affinity(a, j) - affinity(b, j) || clips.indexOf(a) - clips.indexOf(b))[0];
      if (!pick) throw new Error(`No clip left for ${j.id} ${arm.id}`);
      taken.add(pick.id);
      used.set(pick.id, used.get(pick.id) + 1);
      cameras.push({ id: `CAM-${j.id}-${arm.id}`, junctionId: j.id, arm: arm.id, type: pick.ptz ? 'PTZ' : 'Fixed', clip: pick.id });
    }
  }
  const rank = new Map(junctions.map((j, i) => [j.id, i]));
  return cameras.sort((a, b) => rank.get(a.junctionId) - rank.get(b.junctionId));
}

fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
const ids = CLIPS.map((c) => c.id);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate clip id');

const meta = await commonsMetadata(CLIPS.filter((c) => c.provider === 'commons').map((c) => c.file));
const clips = [];
for (const clip of CLIPS) {
  let m;
  let input;
  if (clip.provider === 'commons') {
    m = meta.get(clip.file);
    input = path.join(CACHE, `${clip.file.replace(/[^\w.-]+/g, '_')}${path.extname(new URL(m.download).pathname)}`);
    await download(m.download, input);
  } else {
    input = path.join(CACHE, `coverr-${clip.slug}.mp4`);
    await download(`https://cdn.coverr.co/videos/coverr-${clip.slug}/360p.mp4`, input);
    m = { title: clip.title, author: 'Coverr', ...COVERR_LICENCE, sourceUrl: `https://coverr.co/videos/${clip.page}`, recorded: null, original: probeSize(input) };
  }
  const { durationS, fade } = encode(clip, input, path.join(OUT_DIR, `${clip.id}.mp4`));
  const kb = Math.round(fs.statSync(path.join(OUT_DIR, `${clip.id}.mp4`)).size / 1024);
  console.log(`${clip.id.padEnd(28)} ${String(durationS).padStart(5)} s  ${String(kb).padStart(5)} KB  ${m.licence}`);
  const changes = [
    `Cut to ${clip.start}–${clip.end} s of the ${clip.provider === 'coverr' ? '360p download' : 'original'}`,
    'cropped to 16:9',
    `scaled to ${W}×${H} at ${FPS} fps`,
    clip.mirror && 'mirrored left to right so traffic keeps left as in Malaysia',
    'colour muted, noise and vignette added to match a CCTV camera',
    'audio removed',
    fade && `${FADE_S} s cross-fade at the loop point`,
  ].filter(Boolean);
  clips.push({
    id: clip.id, kind: clip.kind, src: `cctv/${clip.id}.mp4`, poster: `cctv/${clip.id}.jpg`, width: W, height: H, fps: FPS, durationS, mirrored: !!clip.mirror,
    footage: {
      provider: clip.provider === 'coverr' ? 'Coverr' : 'Wikimedia Commons', title: m.title, place: clip.place, author: clip.author || m.author,
      licence: m.licence, licenceUrl: m.licenceUrl, sourceUrl: m.sourceUrl, recorded: m.recorded || null, original: m.original,
      changes: `${changes.join(', ').replace(/^./, (c) => c.toUpperCase())}.`,
    },
  });
}

// Clean out clips that are no longer in the library (and the old per-junction files).
const keep = new Set(clips.flatMap((c) => [path.basename(c.src), path.basename(c.poster)]));
for (const f of fs.readdirSync(OUT_DIR)) if (/\.(mp4|jpg)$/.test(f) && !keep.has(f)) fs.rmSync(path.join(OUT_DIR, f));

const { junctions } = JSON.parse(fs.readFileSync(JUNCTIONS, 'utf8'));
const cameras = assignCameras(junctions, clips);

fs.writeFileSync(MANIFEST, `${JSON.stringify({
  note: 'Stand-in footage. MBKS junction cameras are not connected to this prototype; each camera plays an openly licensed clip filmed elsewhere from a fixed, elevated viewpoint (clips from right-hand-traffic countries are mirrored so traffic keeps left, unless they show legible signs). Overlays (time, signal state, queue, EVP status, rain, night mode) come from the live twin.',
  source: 'Wikimedia Commons and Coverr', generatedBy: 'scripts/fetch-cctv.mjs', clips, cameras,
}, null, 2)}\n`);
fs.writeFileSync(path.join(OUT_DIR, 'ATTRIBUTION.txt'), [
  'Stand-in CCTV footage for the GreenLight EVP prototype. Not filmed in Kuching.',
  'Built by scripts/fetch-cctv.mjs from Wikimedia Commons and Coverr. Each clip is shown on several junction cameras (see public/data/cameras.json).',
  'Clips derived from CC BY-SA works are shared under the same licence. Coverr clips are used under the Coverr License (https://coverr.co/license).',
  '',
  ...clips.map((c) => `${c.src}\n  "${c.footage.title}" by ${c.footage.author}, ${c.footage.licence}${c.footage.licenceUrl ? ` (${c.footage.licenceUrl})` : ''}\n  ${c.footage.sourceUrl}\n  ${c.footage.place ? `Filmed in ${c.footage.place}.` : 'Location not stated by the source.'} ${c.footage.changes}`),
  '',
].join('\n'));
const total = clips.reduce((s, c) => s + fs.statSync(path.join(OUT_DIR, path.basename(c.src))).size, 0);
console.log(`\n${clips.length} clips (${(total / 1e6).toFixed(1)} MB) → public/cctv/; ${cameras.length} cameras → public/data/cameras.json`);
