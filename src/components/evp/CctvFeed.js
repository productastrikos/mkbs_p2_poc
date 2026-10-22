import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { localParts } from '../../evp/traffic';
import { APP } from '../../config';

/* A junction CCTV feed. The picture is a stand-in clip (see
   scripts/fetch-cctv.mjs); everything drawn over it comes from the live twin:
   twin time, the signal on the approach the camera faces, its queue, the
   pedestrian phase, EVP activity, IR night mode and rain. */

const BASE = process.env.PUBLIC_URL || '';
export const cctvUrl = (path) => `${BASE}/${path}`;
/** Where a camera's stand-in clip was filmed, for captions. */
export const filmedIn = (cam) => (cam.footage?.place ? `filmed in ${cam.footage.place}` : 'filming location not stated');

const LAMP = { G: '#22c55e', A: '#f59e0b', R: '#ef4444' };
const LAMP_WORD = { G: 'GREEN', A: 'AMBER', R: 'RED' };
const PREEMPT_TAG = {
  WAIT_SAFE: ['cctv-tag-req', 'EVP REQUEST · WAITING SAFE SWITCH'],
  CLEARING: ['cctv-tag-req', 'EVP · AMBER / ALL-RED'],
  GREEN: ['cctv-tag-evp', 'EVP GREEN HELD'],
  RELEASING: ['cctv-tag-req', 'EVP RELEASING'],
};

/** Night in Kuching (twin time): the cameras switch to monochrome IR. */
export function isNight(ms) {
  const h = localParts(ms).hourFloat;
  return h < 6.5 || h >= 19;
}

export function fmtStamp(ms) {
  return new Date(ms).toLocaleString('en-GB', {
    timeZone: APP.timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).replace(',', '');
}

/** What the twin says is happening at a camera's junction; `rank` orders cameras by urgency (lower first). */
export function cameraActivity(snap, cam) {
  const st = snap?.junctions?.[cam.junctionId] || null;
  const approaching = (snap?.trips || [])
    .filter((t) => t.next?.j === cam.junctionId && !t.evpSuspended)
    .sort((a, b) => (a.next.eta ?? 1e9) - (b.next.eta ?? 1e9));
  const preempt = st?.preempt || null;
  // Green held, then switching, then the nearest approach; a release (the
  // ambulance has passed) and recovery come after anything still ahead.
  let rank = 9;
  if (preempt?.state === 'GREEN') rank = 0;
  else if (preempt && preempt.state !== 'RELEASING') rank = 1;
  else if (approaching.length) rank = 2 + Math.min(0.49, (approaching[0].next.eta ?? 999) / 2000);
  else if (preempt) rank = 4;
  else if (st?.mode === 'RECOVERY') rank = 5;
  // The approach the pre-empting ambulance uses (from its trip), so the camera facing it ranks first.
  const trip = preempt && (snap?.trips || []).find((t) => t.vehicleId === preempt.vehicleId);
  const here = trip?.crossings.filter((c) => c.j === cam.junctionId) || [];
  const preemptArm = (here.find((c) => !c.passed) || here[here.length - 1])?.arm || null;
  const inView = preemptArm === cam.arm || approaching.some((t) => t.next.arm === cam.arm);
  if (rank < 9 && !inView) rank += 0.5;
  return { st, approaching, lead: approaching[0] || null, preempt, preemptArm, inView, rank, active: rank < 9 };
}

// Start each camera at a different point of its loop so a wall of feeds is not in step.
const startFraction = (id) => ([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) % 100) / 100;

/** Status lines for the OSD; also used to stamp snapshots. */
export function osdLines(cam, junction, snap) {
  const act = cameraActivity(snap, cam);
  const arm = junction?.arms.find((a) => a.id === cam.arm);
  const lines = [];
  if (act.preempt) {
    const [cls, text] = PREEMPT_TAG[act.preempt.state] || ['cctv-tag-req', 'EVP'];
    const hold = act.preempt.state === 'GREEN' && act.preempt.holdRemaining != null ? ` · ≤${Math.round(act.preempt.holdRemaining)} s` : '';
    lines.push({ cls, text: `${text} · ${act.preempt.vehicleId}${act.preempt.priority ? ` (${act.preempt.priority})` : ''}${hold}${act.preemptArm === cam.arm ? ' · IN VIEW' : ''}` });
  }
  act.approaching.filter((t) => t.vehicleId !== act.preempt?.vehicleId)
    .sort((a, b) => (b.next.arm === cam.arm) - (a.next.arm === cam.arm)).slice(0, 2).forEach((t) => {
    const inView = t.next.arm === cam.arm;
    lines.push({ cls: 'cctv-tag-amb', text: `${t.vehicleId} ${t.next.eta != null ? `ETA ${Math.round(t.next.eta)} s` : `${Math.round(t.next.dist)} m`} · FROM ${t.next.arm}${inView ? ' · IN VIEW' : ''}` });
  });
  if (!act.preempt && act.st?.mode === 'RECOVERY' && act.st.recovery) lines.push({ cls: 'cctv-tag-rec', text: `SCATS RECOVERY ${act.st.recovery.cycle}/${act.st.recovery.of}` });
  return { act, arm, lines };
}

const CctvFeed = forwardRef(function CctvFeed({ camera, junction, snap, size = 'sm', onClick, selected = false, highlight = true, className = '' }, ref) {
  const videoRef = useRef(null);
  const visible = useRef(false);
  const [state, setState] = useState('loading');
  useImperativeHandle(ref, () => videoRef.current, []);

  useEffect(() => {
    setState('loading');
    const v = videoRef.current;
    if (!v) return undefined;
    const play = () => { if (visible.current && !document.hidden) v.play().catch(() => {}); else v.pause(); };
    const io = new IntersectionObserver(([e]) => { visible.current = e.isIntersecting; play(); }, { threshold: 0.05 });
    io.observe(v);
    document.addEventListener('visibilitychange', play);
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', play); };
  }, [camera.id]);

  const { act, arm, lines } = osdLines(camera, junction, snap);
  const st = act.st;
  const armState = st?.arms?.[camera.arm] || 'R';
  const night = snap ? isNight(snap.now) : false;
  const rain = Boolean(snap?.rain);
  const lg = size === 'lg';
  const xs = size === 'xs';
  const Tag = onClick ? 'button' : 'div';
  // Light the camera that sees the ambulance; junction-wide states (recovery,
  // or a pre-emption whose approach is unknown) light every camera there.
  const lit = act.active && (act.inView || (!act.preemptArm && !act.approaching.length));
  const ring = selected ? 'cctv-selected' : highlight && lit ? 'cctv-active' : '';
  const where = filmedIn(camera);

  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={`cctv ${lg ? 'cctv-lg' : ''} ${xs ? 'cctv-xs' : ''} ${night ? 'cctv-ir' : ''} ${rain ? 'cctv-rain' : ''} ${ring} ${className}`}
      aria-label={onClick ? `${camera.id}: ${junction?.name || camera.junctionId}` : undefined}
      title={`${camera.id} · ${junction?.name || ''}\nStand-in footage, ${where}; overlays are live from the twin.`}>
      <video ref={videoRef} src={cctvUrl(camera.src)} poster={cctvUrl(camera.poster)} muted loop playsInline preload="metadata"
        onLoadedMetadata={(e) => { const v = e.currentTarget; if (Number.isFinite(v.duration)) v.currentTime = v.duration * startFraction(camera.id); }}
        onPlaying={() => setState('playing')} onError={() => setState('error')} />
      {state === 'error' && (
        <div className="cctv-nosignal"><span>NO SIGNAL</span><span className="text-[10px] tracking-normal">{camera.id} · video could not be loaded</span></div>
      )}
      <div className="cctv-shade-top" />
      <div className="cctv-shade-bottom" />

      <div className="cctv-osd" style={{ left: xs ? 6 : 8, top: xs ? 4 : 6, right: xs ? '38%' : '42%' }}>
        <div className="truncate"><span className="cctv-rec" />{camera.id}{camera.type === 'PTZ' ? ' · PTZ' : ''}</div>
        {!xs && <div className="truncate opacity-90">{junction ? `${junction.id} ${junction.name}`.toUpperCase() : camera.junctionId}</div>}
      </div>
      <div className="cctv-osd text-right" style={{ right: xs ? 6 : 8, top: xs ? 4 : 6 }}>
        <div className="tabular-nums">{snap ? (xs ? fmtStamp(snap.now).split(' ')[1] : fmtStamp(snap.now)) : '--:--:--'}</div>
        <div className="flex gap-1 justify-end mt-0.5">
          {night && <span className="cctv-tag cctv-tag-dim">IR</span>}
          {rain && <span className="cctv-tag cctv-tag-dim">RAIN</span>}
          {!xs && <span className="cctv-tag cctv-tag-dim">STAND-IN</span>}
        </div>
      </div>

      {lines.length > 0 && (
        <div className="cctv-osd space-y-1" style={{ left: xs ? 6 : 8, top: lg ? 52 : xs ? 22 : 40, right: xs ? 6 : 8 }}>
          {lines.slice(0, lg ? 3 : xs ? 1 : 2).map((l) => <div key={l.text}><span className={`cctv-tag ${l.cls}`}>{l.text}</span></div>)}
        </div>
      )}

      <div className="cctv-osd" style={{ left: xs ? 6 : 8, bottom: xs ? 4 : 6, right: '45%' }}>
        <div className="truncate">{xs ? (arm?.road || `${camera.arm} approach`).toUpperCase() : `VIEW ${camera.arm}${arm?.road ? ` · ${arm.road.toUpperCase()}` : ''}`}</div>
        {lg && <div className="truncate opacity-80 text-[11px] font-medium">Stand-in footage · {where}</div>}
      </div>
      <div className="cctv-osd text-right" style={{ right: xs ? 6 : 8, bottom: xs ? 4 : 6 }}>
        <div className="flex items-center gap-1.5 justify-end">
          <span className="inline-block rounded-full" style={{ width: lg ? 10 : 8, height: lg ? 10 : 8, background: LAMP[armState], boxShadow: `0 0 6px ${LAMP[armState]}` }} />
          <span>{xs ? LAMP_WORD[armState] : `${camera.arm} ${LAMP_WORD[armState]}`}{st ? ` · Q ${Math.round(st.queues?.[camera.arm] ?? 0)}` : ''}</span>
        </div>
        {!xs && st?.ped && st.ped !== 'DONT_WALK' && <div>PED {st.ped === 'WALK' ? 'WALK' : 'CLEARING'}</div>}
      </div>
    </Tag>
  );
});

export default CctvFeed;

/** Every approach camera at one junction, as a grid of feeds. */
export function JunctionCameras({ junction, cameras, snap, size = 'xs', className = 'grid grid-cols-2 gap-2', onSelect, selectedId }) {
  return (
    <div className={className}>
      {cameras.map((c) => (
        <CctvFeed key={c.id} camera={c} junction={junction} snap={snap} size={size} selected={c.id === selectedId} onClick={onSelect ? () => onSelect(c) : undefined} />
      ))}
    </div>
  );
}

/** Save the current frame with the OSD burned in, as a PNG. */
export function saveSnapshot(video, cam, junction, snap) {
  if (!video || !video.videoWidth) return false;
  const c = document.createElement('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  const ctx = c.getContext('2d');
  if (snap && isNight(snap.now)) ctx.filter = 'grayscale(1) contrast(1.3) brightness(0.78)';
  ctx.drawImage(video, 0, 0, c.width, c.height);
  ctx.filter = 'none';
  const { lines } = osdLines(cam, junction, snap);
  const text = [
    `${cam.id}  ${junction ? `${junction.id} ${junction.name}` : cam.junctionId}`,
    `${snap ? fmtStamp(snap.now) : ''}  (twin time, ${APP.timeZone})`,
    ...lines.map((l) => l.text),
    `Stand-in footage, ${filmedIn(cam)}`,
  ];
  ctx.font = '600 15px Consolas, ui-monospace, monospace';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, c.width, 14 + text.length * 20);
  ctx.fillStyle = '#fff';
  text.forEach((t, i) => ctx.fillText(t, 10, 22 + i * 20));
  const [d = '', t = ''] = snap ? fmtStamp(snap.now).split(' ') : [];
  const stamp = snap ? `${d.split('/').reverse().join('')}-${t.replace(/:/g, '')}` : 'now';
  c.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${cam.id}_${stamp}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
  return true;
}
