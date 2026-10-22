import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MapContainer, Marker, Polyline, Popup, Tooltip, useMap } from 'react-leaflet';
import { Card, Button, Badge, Tabs, Icon, ProgressBar, IconButton, FilterChips } from '../components/ui';
import { useData, useSim } from '../data/DataProvider';
import { useTheme } from '../theme/ThemeProvider';
import BaseTiles from '../components/evp/BaseTiles';
import { resolveColor } from '../components/charts/chartTheme';
import { junctionIcon, ambulanceIcon, hospitalIcon, ghostIcon, moveGlyph } from '../components/evp/mapIcons';
import { PriorityBadge, fmtS, fmtTime, STATUS_LABEL, REQUEST_LABEL, SignalHead, MODE_LABEL, UNIT_STATUS, UnitStatusBadge, STAGE_LABEL } from '../components/evp/format';
import CctvFeed, { JunctionCameras } from '../components/evp/CctvFeed';
import { SCENARIOS } from '../evp/engine/scenarios';
import { PRIORITY_RANK } from '../evp/traffic';
import { MOVE_LABEL } from '../evp/junctions';

const CENTER = [1.5335, 110.3605];
// Route lines use the theme's status colours (Leaflet needs concrete values).
const ROUTE_TONE = { Critical: 'danger', Urgent: 'warning', 'Non-urgent': 'info' };

function FollowVehicle({ position, active }) {
  const map = useMap();
  useEffect(() => {
    if (active && position) map.panTo(position, { animate: true, duration: 0.3 });
  }, [active, position, map]);
  return null;
}

/* One-off pan (search result, fleet list) without following. */
function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target.pos, Math.max(map.getZoom(), 15), { duration: 0.6 });
  }, [target, map]);
  return null;
}

function RouteLines({ engine, trip }) {
  const step = Math.round(trip.d / 25);
  const lines = useMemo(() => {
    const t = engine.trips.get(trip.id);
    if (!t) return null;
    const line = t.physRoute.line;
    return { done: line.slice(trip.startOffset || 0, trip.d), todo: line.slice(trip.d, line.length) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, trip.id, trip.routeVersion, step]);
  if (!lines) return null;
  const color = resolveColor(trip.evpSuspended ? 'neutral' : ROUTE_TONE[trip.priority] || 'info');
  return (
    <>
      <Polyline positions={lines.done} pathOptions={{ color: resolveColor('neutral'), weight: 4, opacity: 0.5 }} />
      <Polyline positions={lines.todo} pathOptions={{ color, weight: 9, opacity: 0.18 }} />
      <Polyline positions={lines.todo} pathOptions={{ color, weight: 4, opacity: 0.95, dashArray: trip.evpSuspended ? '6 6' : null }} />
    </>
  );
}

function approachLabel(n) {
  if (!n) return null;
  const p = n.topP != null ? n.topP.toFixed(2) : '–';
  if (n.request === 'GREEN') return `${moveGlyph(n.top)} GREEN · held`;
  if (n.request === 'SENT') return `${moveGlyph(n.top)} ${p} · green in ${Math.round(n.greenIn ?? 0)} s`;
  if (n.request === 'YIELDING') return `${moveGlyph(n.top)} yielding to ${n.yieldTo || '…'}`;
  if (n.request === 'BLOCKED') return '⛔ request blocked';
  return `${moveGlyph(n.top)} ${p} · ETA ${Math.round(n.eta ?? 0)} s`;
}

function NextJunction({ n, suspended }) {
  if (!n) return <p className="text-xs text-fg-faint">No EVP junctions left on the route.</p>;
  const ranked = n.probs ? Object.entries(n.probs).sort((a, b) => b[1] - a[1]).filter(([, v]) => v > 0.02) : [];
  let reqSub = '';
  if (suspended) reqSub = 'EVP suspended';
  else if (n.request === 'SENT') reqSub = `phase ${n.phase} · green in ~${Math.round(n.greenIn ?? 0)} s`;
  else if (n.request === 'GREEN') reqSub = `phase ${n.phase} held`;
  else if (n.request === 'YIELDING') reqSub = `for ${n.yieldTo || 'higher priority'}`;
  else if (n.triggerIn != null) reqSub = n.triggerIn < 1 ? 'requesting now' : `request in ~${Math.round(n.triggerIn)} s`;
  return (
    <div className="tile space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="label-caps">Next junction · {Math.round(n.dist)} m</p>
          <Link to={`/junctions/${n.j}`} className="text-[13px] font-semibold text-fg hover:underline block truncate">{n.j} {n.name}</Link>
        </div>
        <SignalHead state={n.signal} size={9} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div><p className="label-caps">ETA</p><p className="font-bold text-fg text-sm tabular-nums">{n.eta != null ? `${Math.round(n.eta)} s` : '–'}</p><p className="text-fg-faint tabular-nums">{n.lo != null ? `80%: ${Math.round(n.lo)}–${Math.round(n.hi)} s` : 'first GPS fix…'}</p></div>
        <div><p className="label-caps">Movement</p><p className="font-bold text-fg text-sm">{moveGlyph(n.top)} {MOVE_LABEL[n.top]}</p><p className="text-fg-faint">P = {n.topP != null ? n.topP.toFixed(2) : '–'} · from {n.arm}</p></div>
        <div><p className="label-caps">Request</p><p className="font-bold text-fg text-sm">{suspended ? 'None' : REQUEST_LABEL[n.request] || 'Not yet'}</p><p className="text-fg-faint">{reqSub}</p></div>
      </div>
      {ranked.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          {ranked.map(([m, v]) => <Badge key={m} tone={m === n.top ? 'accent' : 'neutral'}>{moveGlyph(m)} {MOVE_LABEL[m]} {v.toFixed(2)}</Badge>)}
        </div>
      )}
      {n.phaseRule && <p className="text-[10.5px] text-fg-faint">{n.phaseRule}</p>}
    </div>
  );
}

/* CCTV over the map. Three views:
     { junction }  every approach camera at a junction (opened by clicking it)
     { cam }       one camera, enlarged from that grid
     { vehicle }   the camera facing a unit at the next junction on its route
                   (moves on as the unit passes each one) */
function CctvPip({ pip, snap, data, onPip, onClose, onWall }) {
  const jById = (id) => data.junctions.find((j) => j.id === id);
  let cam = null;
  let note = null;
  let ahead = null;
  let arm = null;
  if (pip.vehicle) {
    const trip = snap.trips.find((t) => t.vehicleId === pip.vehicle);
    const c = trip?.crossings.find((x) => !x.passed && data.camerasByJ.get(x.j)?.length);
    if (c) {
      const list = data.camerasByJ.get(c.j);
      cam = list.find((k) => k.arm === c.arm) || list[0];
      ahead = Math.max(0, c.dStop - trip.d);
      arm = c.arm;
    }
    note = !trip ? `${pip.vehicle} is no longer on an EVP trip.` : `No camera junction left on ${pip.vehicle}'s route.`;
  } else if (pip.cam) cam = data.cameras.find((c) => c.id === pip.cam);
  const junction = jById(cam ? cam.junctionId : pip.junction);
  const grid = !pip.vehicle && !pip.cam && junction ? data.camerasByJ.get(junction.id) : null;
  const title = pip.vehicle ? `${pip.vehicle} · next camera${cam ? `: ${cam.id}` : ''}`
    : grid ? `${junction.id} · ${junction.name}` : cam?.id;
  return (
    <div className={`cctv-pip ${grid ? 'cctv-pip-wide' : ''} card p-2 space-y-1.5`} style={{ background: 'var(--color-surface)' }}>
      <div className="flex items-center gap-2">
        <Icon name="video" size={14} className="text-fg-faint shrink-0" />
        <span className="text-xs font-semibold text-fg truncate flex-1" title={title}>{title}</span>
        {pip.cam && junction && <button type="button" className="link-btn whitespace-nowrap" onClick={() => onPip({ junction: junction.id })}>ALL {junction.id} CAMERAS</button>}
        {(cam || grid) && <button type="button" className="link-btn whitespace-nowrap" onClick={() => onWall(cam ? `cam=${cam.id}` : `j=${junction.id}`)}>OPEN WALL</button>}
        <IconButton icon="close" label="Close cameras" plain onClick={onClose} />
      </div>
      {grid ? (
        <>
          <JunctionCameras junction={junction} cameras={grid} snap={snap} onSelect={(c) => onPip({ cam: c.id })} />
          <p className="text-[10.5px] text-fg-faint">{grid.length} cameras, one on each approach. Select a feed to enlarge it.</p>
        </>
      ) : cam ? <CctvFeed camera={cam} junction={junction} snap={snap} highlight={false} /> : <p className="text-xs text-fg-faint py-6 text-center">{note}</p>}
      {cam && pip.vehicle && <p className="text-[10.5px] text-fg-faint">{junction.id} is {Math.round(ahead)} m ahead; this camera looks along the {arm} approach {pip.vehicle} will use. The view moves to the next junction once it passes.</p>}
    </div>
  );
}

function TripCard({ trip, engine, follow, onFollow, onCctv }) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const progress = ((trip.d - (trip.startOffset || 0)) / Math.max(1, trip.length - (trip.startOffset || 0))) * 100;
  useEffect(() => { if (!confirmEnd) return undefined; const t = setTimeout(() => setConfirmEnd(false), 4000); return () => clearTimeout(t); }, [confirmEnd]);
  return (
    <div className="card p-3 space-y-2.5" style={{ borderColor: follow ? 'var(--color-primary-border)' : undefined }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-fg">{trip.vehicleId}</span>
        <PriorityBadge priority={trip.priority} />
        <Badge tone="neutral">{STATUS_LABEL[trip.status]}</Badge>
        {trip.evpSuspended && <Badge tone="danger" dot>EVP suspended</Badge>}
        {trip.stopped && <Badge tone="warning">Stopped</Badge>}
        {trip.offRoute && <Badge tone="warning">Off route</Badge>}
        <span className="flex-1" />
        {onCctv && <IconButton icon="video" label="Watch the next CCTV camera on this route" onClick={onCctv} />}
        <IconButton icon="navigation" label={follow ? 'Stop following' : 'Follow on map'} active={follow} onClick={onFollow} />
      </div>
      <div className="text-[11px] text-fg-muted">
        {trip.origin} → <b className="text-fg">{trip.destination.name}</b> · {trip.id} · {fmtS(trip.elapsed)} elapsed · {(trip.remaining / 1000).toFixed(1)} km left · arrives in ~{fmtS(trip.etaDest, { short: true })} · {Math.round(trip.speed * 3.6)} km/h
      </div>
      <ProgressBar value={progress} tone="primary" />
      <NextJunction n={trip.next} suspended={trip.evpSuspended} />
      <div className="flex gap-1 flex-wrap">
        {trip.crossings.map((c) => (
          <Link key={`${c.j}-${Math.round(c.dStop)}`} to={`/junctions/${c.j}`} title={`${c.j}: ${c.passed ? (c.wait < 1 ? 'passed without stopping' : `passed after ${Math.round(c.wait)} s wait`) : REQUEST_LABEL[c.request] || 'ahead'}`}>
            <Badge tone={c.passed ? (c.wait < 1 ? 'success' : 'warning') : c.request === 'GREEN' ? 'success' : c.request === 'SENT' ? 'primary' : c.request === 'YIELDING' ? 'warning' : c.request === 'BLOCKED' ? 'danger' : 'neutral'}>
              {c.passed ? '✓ ' : ''}{c.j}
            </Badge>
          </Link>
        ))}
        {!trip.crossings.length && <span className="text-[11px] text-fg-faint">Route crosses no EVP junction.</span>}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        <Button size="sm" variant="secondary" icon="stop" onClick={() => engine.stopVehicle(trip.vehicleId, 40)} title="Simulate a 40 s roadside stop (tests the 20 s cancel rule)">Stop 40 s</Button>
        <Button size="sm" variant="secondary" icon="route" onClick={() => engine.divert(trip.vehicleId)} title="Turn off the route before the next junction (tests the divert rule)">Divert</Button>
        <Button size="sm" variant={confirmEnd ? 'danger' : 'ghost'} icon="close" onClick={() => (confirmEnd ? engine.endTrip(trip.id, 'Ended by operator') : setConfirmEnd(true))}>
          {confirmEnd ? 'Confirm: end trip' : 'End trip'}
        </Button>
      </div>
    </div>
  );
}

function SimControls({ snap, sim, engine }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="font-mono text-xs px-2 py-1 rounded-md border bg-surface-raised text-fg" title="Digital-twin clock (Kuching time). Runs with the simulation speed, so it moves ahead of the wall clock at 2× and above.">
        Twin {fmtTime(snap.now)}{snap.speed > 1 && !snap.paused ? ` · ${snap.speed}×` : ''}{snap.paused ? ' · paused' : ''}
      </span>
      <IconButton icon={snap.paused ? 'play' : 'pause'} label={snap.paused ? 'Resume simulation' : 'Pause simulation'} onClick={() => sim.togglePause()} />
      <div className="timeframe" role="group" aria-label="Simulation speed">
        {[1, 2, 4, 8].map((s) => (
          <button key={s} type="button" className={!snap.paused && snap.speed === s ? 'is-active' : ''} onClick={() => sim.setSpeed(s)}>{s}×</button>
        ))}
      </div>
      <Button size="sm" variant={snap.rain ? 'soft' : 'secondary'} icon="rain" onClick={() => engine.setRain(!snap.rain)} aria-pressed={snap.rain} title="Toggle rain: lower speeds and higher congestion on every junction">{snap.rain ? 'Rain' : 'Dry'}</Button>
      <Button size="sm" variant={snap.ambient ? 'soft' : 'secondary'} icon="phone" onClick={() => sim.setAmbient(!snap.ambient)} aria-pressed={snap.ambient}
        title={`Emergency calls dispatched to the nearest free unit (about ${snap.ops?.ratePerHour ?? '–'} an hour at this time of day, 80 a day)`}>
        Live dispatch {snap.ambient ? 'on' : 'off'}
      </Button>
    </div>
  );
}

const LEVEL_DOT = { info: 'var(--color-info)', success: 'var(--color-success)', warning: 'var(--color-warning)', danger: 'var(--color-danger)' };
const EVENT_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'evp', label: 'EVP & signals' },
  { value: 'security', label: 'Security' },
  { value: 'fleet', label: 'Fleet & operator' },
];
const eventGroup = (e) => (/^security/.test(e.kind || '') || e.text.startsWith('SECURITY') ? 'security' : ['dispatch', 'fleet', 'operator', 'scenario'].includes(e.kind) ? 'fleet' : 'evp');

function FleetList({ snap, onLocate }) {
  const order = ['TO_HOSPITAL', 'TO_PATIENT', 'RETURNING', 'ON_SCENE', 'HANDOVER', 'REPOSITIONING', 'AVAILABLE_AWAY', 'AVAILABLE'];
  const units = snap.vehicles.slice().sort((a, b) => (b.quarantined - a.quarantined) || (order.indexOf(a.status) - order.indexOf(b.status)) || a.id.localeCompare(b.id));
  const counts = snap.vehicles.reduce((m, v) => { const k = v.quarantined ? 'quarantined' : UNIT_STATUS[v.status]?.group || 'other'; m[k] = (m[k] || 0) + 1; return m; }, {});
  const missions = Object.fromEntries((snap.ops?.missions || []).map((m) => [m.vehicleId, m]));
  return (
    <div className="space-y-2">
      <p className="text-xs text-fg-faint">{Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ')}. Select a unit to locate it.</p>
      {units.map((v) => {
        const m = missions[v.id];
        return (
          <button key={v.id} type="button" className="w-full text-left tile hover:border-primary transition-colors flex items-center gap-2.5" onClick={() => onLocate(v)}>
            <span className="w-14 text-xs font-bold text-fg">{v.id}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-[11px] text-fg-muted truncate">{v.callsign} · {v.operator}</span>
              <span className="block text-[10.5px] text-fg-faint truncate">{m ? `${m.id}: ${m.priority} call at ${m.place}${m.hospital ? ` → ${m.hospital}` : ''}` : v.tripId ? `${v.tripId} to ${v.tripTo}` : v.driveTo ? `to ${v.driveTo}` : v.location}</span>
            </span>
            {v.quarantined ? <Badge tone="danger" dot>Quarantined</Badge> : <UnitStatusBadge status={v.status} priority={v.priority} />}
          </button>
        );
      })}
    </div>
  );
}

export default function CommandMap() {
  const { data, engine, sim, runScenario } = useData();
  const snap = useSim();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('live');
  const [follow, setFollow] = useState(null);
  const [fly, setFly] = useState(null);
  const [showIdle, setShowIdle] = useState(true);
  const [result, setResult] = useState(null);
  const [eventFilter, setEventFilter] = useState('all');
  const [pip, setPip] = useState(null);
  const focusDone = useRef(null);

  // ?focus=AMB-11 | SGH | J01 from the header search and other pages: follow a
  // unit on a trip, otherwise fly to it.
  const focus = params.get('focus');
  useEffect(() => {
    if (!snap || !focus || focusDone.current === focus) return;
    focusDone.current = focus;
    const v = snap.vehicles.find((x) => x.id === focus);
    const h = data.hospitals.find((x) => x.id === focus);
    const jn = data.junctions.find((x) => x.id === focus);
    if (v?.tripId) { setFollow(v.id); setTab('live'); } else if (v) { setFly({ pos: [v.lat, v.lng], at: Date.now() }); setTab('fleet'); } else if (h) setFly({ pos: [h.lat, h.lng], at: Date.now() });
    else if (jn) { setFollow(null); setFly({ pos: [jn.lat, jn.lng], at: Date.now() }); }
    setParams({}, { replace: true });
  }, [focus, snap, data.hospitals, data.junctions, setParams]);

  if (!snap) return null;
  const jStates = snap.junctions;
  // Each junction shows the most urgent ambulance approaching it.
  const approaching = {};
  snap.trips.slice().sort((a, b) => (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) || ((b.next?.eta ?? 1e9) - (a.next?.eta ?? 1e9))).forEach((t) => {
    if (t.next && !t.evpSuspended) approaching[t.next.j] = { arm: t.next.arm, move: t.next.top, label: approachLabel(t.next), vehicle: t.vehicleId };
  });
  const preempting = Object.values(jStates).filter((s) => s.mode === 'PREEMPT').length;
  const recovering = Object.values(jStates).filter((s) => s.mode === 'RECOVERY').length;
  const openAlerts = snap.alerts.filter((a) => a.status === 'open').length;
  const available = snap.vehicles.filter((v) => !v.quarantined && (v.status === 'AVAILABLE' || v.status === 'AVAILABLE_AWAY' || v.status === 'REPOSITIONING')).length;
  const followed = follow && snap.vehicles.find((v) => v.id === follow);
  const events = snap.events.filter((e) => eventFilter === 'all' || eventGroup(e) === eventFilter);

  const run = (id) => {
    const res = runScenario(id);
    setResult(res);
    if (res.ok) setTab('live');
    if (res.ok && res.tripIds?.length) {
      const t = engine.trips.get(res.tripIds[res.tripIds.length - 1]);
      if (t) setFollow(t.vehicleId);
    }
  };
  const locate = (v) => {
    if (v.tripId) setFollow(v.id); else { setFollow(null); setFly({ pos: [v.lat, v.lng], at: Date.now() }); }
  };

  const stats = [
    { label: 'EVP trips now', value: snap.trips.length, icon: 'ambulance', onClick: () => setTab('live'), title: 'Ambulances on a trip with EVP (To patient / To hospital)' },
    { label: `Units free of ${snap.vehicles.length}`, value: available, icon: 'truck', tone: available < 5 ? 'warning' : null, onClick: () => setTab('fleet'), title: 'Units that can take a new job (at base, idle, or driving back to base)' },
    { label: 'Pre-empting', value: preempting, icon: 'traffic', tone: preempting ? 'primary' : null, onClick: () => navigate('/junctions?filter=active'), title: 'Junctions holding an EVP green now' },
    { label: 'Recovering', value: recovering, icon: 'refresh', tone: recovering ? 'warning' : null, onClick: () => navigate('/junctions?filter=active'), title: 'Junctions clearing queues after a pre-emption' },
    { label: 'Greens this session', value: snap.stats.greens, icon: 'check', onClick: () => { setTab('events'); setEventFilter('evp'); }, title: `${snap.stats.requests} requests sent, ${snap.stats.conflicts} priority conflicts resolved, ${snap.stats.corrections} phase corrections, ${snap.stats.cancels} cancelled` },
    { label: 'Open alerts', value: openAlerts, icon: 'shield', tone: openAlerts ? 'danger' : null, onClick: () => navigate('/security'), title: 'Security alerts waiting for an operator' },
  ];

  return (
    <div className="flex flex-col gap-3" style={{ minHeight: 'calc(100vh - var(--header-height) - 40px)' }}>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Live Command Map</h1>
          <p className="page-subtitle">Kuching South digital twin · {data.junctions.length} SCATS junctions · {data.ambulances.length} ambulances · simulated traffic on real roads</p>
        </div>
        <SimControls snap={snap} sim={sim} engine={engine} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        {stats.map((s) => (
          <button key={s.label} type="button" onClick={s.onClick} title={s.title} className="card card-hoverable px-3 py-2 flex items-center gap-2.5 text-left">
            <span className="stat-card-icon" style={{ width: 28, height: 28, ...(s.tone ? { background: `var(--color-${s.tone}-soft)`, color: `var(--color-${s.tone})` } : {}) }}><Icon name={s.icon} size={15} /></span>
            <span className="min-w-0"><span className="block text-lg font-bold text-fg leading-none">{s.value}</span><span className="block text-[10px] text-fg-faint truncate mt-0.5">{s.label}</span></span>
          </button>
        ))}
      </div>

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-3 min-h-0">
        <div className="card overflow-hidden relative isolate" style={{ minHeight: 520 }}>
          <MapContainer center={CENTER} zoom={14} style={{ height: '100%', width: '100%', minHeight: 520 }} preferCanvas={false}>
            <BaseTiles theme={theme} />
            {data.boundary.rings.map((ring, i) => (
              <Polyline key={`b${i}`} positions={ring} pathOptions={{ color: resolveColor('primary'), weight: 1.5, dashArray: '6 6', opacity: 0.55 }} />
            ))}
            {snap.trips.map((t) => <RouteLines key={`${t.id}-${t.routeVersion}`} engine={engine} trip={t} />)}
            {data.junctions.map((j) => {
              const st = jStates[j.id];
              const q = Math.round(Object.values(st?.queues || {}).reduce((s, x) => s + x, 0));
              return (
                <Marker key={j.id} position={[j.lat, j.lng]} icon={junctionIcon(j, st, approaching[j.id], false)} zIndexOffset={approaching[j.id] ? 500 : 0}
                  eventHandlers={{ click: () => setPip({ junction: j.id }) }}>
                  {/* The camera panel opens top-right with the popup: pan the map so the popup stays left of it. */}
                  <Popup autoPanPaddingTopLeft={[56, 16]} autoPanPaddingBottomRight={[548, 16]}>
                    <div className="space-y-1.5" style={{ minWidth: 230 }}>
                      <p className="text-[13px] font-bold">{j.id} {j.name}</p>
                      <p className="text-[11px]">SCATS site {j.scatsSite}{j.poc ? ' · 2024 proof-of-concept site' : ''}</p>
                      <p className="text-[11px]">{MODE_LABEL[st?.mode]}{st?.grant ? ` for ${st.grant.vehicleId} (${st.grant.priority})` : ''} · phase {st?.phaseId} {STAGE_LABEL[st?.stage]} · {Math.round(st?.stageRemaining ?? 0)} s left</p>
                      <p className="text-[11px]">Queue {q} veh (normal ≈ {st?.normalQueue ?? '–'}) · congestion {st?.congestion?.toFixed(2)}</p>
                      {approaching[j.id] && <p className="text-[11px]"><b>{approaching[j.id].vehicle}</b> approaching: {approaching[j.id].label}</p>}
                      <div className="flex gap-3 flex-wrap">
                        <button type="button" className="link-btn" onClick={() => navigate(`/junctions/${j.id}`)}>OPEN JUNCTION DETAIL</button>
                        {data.camerasByJ.get(j.id)?.length > 0 && <button type="button" className="link-btn" onClick={() => setPip({ junction: j.id })}>CAMERAS ({data.camerasByJ.get(j.id).length})</button>}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
            {data.hospitals.map((h) => (
              <Marker key={h.id} position={[h.lat, h.lng]} icon={hospitalIcon(h)}>
                <Tooltip direction="top" offset={[0, -12]} className="evp-tip">{h.name} · {h.type}{h.approx ? ' (approximate location)' : ''}</Tooltip>
              </Marker>
            ))}
            {snap.vehicles.filter((v) => v.tripId || v.status === 'REPOSITIONING' || showIdle).map((v) => {
              const trip = snap.trips.find((t) => t.id === v.tripId);
              const n = trip?.next;
              const moving = Boolean(v.tripId) || v.status === 'REPOSITIONING';
              return (
                <Marker key={v.id} position={[v.lat, v.lng]} zIndexOffset={v.tripId ? 1000 : moving ? 200 : -100}
                  icon={ambulanceIcon({ id: v.id, heading: v.heading, priority: v.priority, quarantined: v.quarantined, selected: follow === v.id, idle: !moving, status: v.status })}
                  eventHandlers={{ click: () => v.tripId && setFollow(v.id) }}>
                  {v.tripId ? (
                    <Tooltip permanent direction="right" offset={[18, 0]} className="evp-tip">
                      <span className="text-[11px]">
                        {trip?.evpSuspended ? 'EVP suspended' : n ? <><b>{n.j}</b> · {n.eta != null ? `${Math.round(n.eta)} s` : '…'}{n.lo != null ? ` (${Math.round(n.lo)}–${Math.round(n.hi)})` : ''}</> : `to ${trip?.destination.short}`}
                        {' · '}{Math.round(v.speed * 3.6)} km/h
                      </span>
                    </Tooltip>
                  ) : (
                    <Popup>
                      <div className="space-y-1" style={{ minWidth: 210 }}>
                        <p className="text-[13px] font-bold">{v.id} · {v.callsign}</p>
                        <p className="text-[11px]">{v.operator} · {v.plate}</p>
                        <p className="text-[11px]">{v.quarantined ? 'Quarantined: EVP suspended' : UNIT_STATUS[v.status]?.label}{v.driveTo ? ` to ${v.driveTo}` : ''} · {v.location}</p>
                        <div className="flex gap-3 pt-1">
                          <button type="button" className="link-btn" onClick={() => navigate(`/tablet?vehicle=${v.id}`)}>OPEN ON TABLET</button>
                          {v.quarantined && <button type="button" className="link-btn" onClick={() => navigate('/security')}>REVIEW</button>}
                        </div>
                      </div>
                    </Popup>
                  )}
                </Marker>
              );
            })}
            {snap.ghosts.map((g) => (
              <Marker key={g.obuId} position={[g.lat, g.lng]} icon={ghostIcon(g)}>
                <Tooltip direction="top" className="evp-tip">Unregistered OBU {g.obuId} ({g.plate}): request at {g.junctionId} blocked</Tooltip>
              </Marker>
            ))}
            <FollowVehicle active={Boolean(followed)} position={followed ? [followed.lat, followed.lng] : null} />
            <FlyTo target={fly} />
          </MapContainer>
          {pip && <CctvPip pip={pip} snap={snap} data={data} onPip={setPip} onClose={() => setPip(null)} onWall={(q) => navigate(`/cctv?${q}`)} />}
          <div className="absolute left-3 bottom-3 z-[500] card px-3 py-2 text-[10.5px] text-fg-muted space-y-1" style={{ background: 'var(--color-surface)' }}>
            <p className="label-caps">Legend</p>
            <p className="flex items-center gap-2"><span className="inline-flex gap-0.5">{['var(--signal-green)', 'var(--signal-amber)', 'var(--signal-red)'].map((c) => <span key={c} className="w-2 h-2 rounded-full" style={{ background: c }} />)}</span>Approach signal (green / amber / red)</p>
            <p className="flex items-center gap-2"><span className="w-3 h-3 rounded-full border-2" style={{ borderColor: 'var(--color-primary)' }} />Pre-empting · <span className="w-3 h-3 rounded-full border-2 border-dashed" style={{ borderColor: 'var(--color-warning)' }} />Recovery</p>
            <p className="flex items-center gap-2"><span className="inline-flex gap-0.5">{['var(--color-danger)', 'var(--color-warning)', 'var(--color-info)'].map((c) => <span key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />)}</span>EVP trip: Critical / Urgent / Non-urgent</p>
            <p className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-neutral)' }} />Returning to base (no EVP) · <span className="amb-idle inline-block" />free / on scene</p>
            <p className="flex items-center gap-2"><span style={{ color: 'var(--color-accent)' }}>➜</span>Predicted movement + probability</p>
            <p className="flex items-center gap-2"><Icon name="video" size={12} />Click a junction for its approach cameras</p>
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={showIdle} onChange={(e) => setShowIdle(e.target.checked)} />Show units not on the move</label>
          </div>
        </div>

        <Card padded={false} className="flex flex-col min-h-[520px]">
          <div className="px-3 pt-3">
            <Tabs tabs={[{ value: 'live', label: `Live (${snap.trips.length})` }, { value: 'fleet', label: 'Fleet' }, { value: 'scenarios', label: 'Scenarios' }, { value: 'events', label: 'Event log' }]} value={tab} onChange={setTab} size="sm" />
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ maxHeight: 'calc(100vh - 260px)' }}>
            {result && (
              <div className={`tile text-xs ${result.ok ? 'tone-success' : 'tone-danger'} flex gap-2`}>
                <span className="flex-1">{result.message}</span>
                <button type="button" className="link-btn" onClick={() => setResult(null)}>DISMISS</button>
              </div>
            )}
            {tab === 'live' && (
              snap.trips.length ? snap.trips.map((t) => (
                <TripCard key={t.id} trip={t} engine={engine} follow={follow === t.vehicleId} onFollow={() => setFollow(follow === t.vehicleId ? null : t.vehicleId)}
                  onCctv={t.crossings.some((c) => !c.passed && data.camerasByJ.get(c.j)?.length) ? () => setPip({ vehicle: t.vehicleId }) : null} />
              )) : (
                <div className="text-center py-10 space-y-3">
                  <Icon name="ambulance" size={28} className="mx-auto text-fg-faint" />
                  <p className="text-sm text-fg-muted">No ambulance on an EVP trip right now.</p>
                  <p className="text-xs text-fg-faint">{snap.ambient ? `Live dispatch is on: at this hour an emergency call comes in about every ${Math.round(60 / Math.max(0.5, snap.ops?.ratePerHour || 1))} min. ` : ''}Press START on the <Link className="text-primary underline" to="/tablet">ambulance tablet</Link>, or run a scenario.</p>
                  <Button icon="play" onClick={() => run('sgh')}>Run SGH demo</Button>
                </div>
              )
            )}
            {tab === 'fleet' && <FleetList snap={snap} onLocate={locate} />}
            {tab === 'scenarios' && (
              <div className="space-y-2">
                <p className="text-xs text-fg-faint">Each scenario drives the same engine the tablet uses. Results show in the Live tab, the event log and Alerts & Security.</p>
                {SCENARIOS.map((s) => (
                  <button key={s.id} type="button" className="w-full text-left tile hover:border-primary transition-colors flex items-center gap-3" onClick={() => run(s.id)}>
                    <span className="stat-card-icon" style={{ width: 30, height: 30 }}><Icon name={s.icon} size={16} /></span>
                    <span className="flex-1 min-w-0"><span className="block text-[13px] font-semibold text-fg">{s.label}</span><span className="block text-[11px] text-fg-faint">{s.description}</span></span>
                    <Icon name="chevronRight" size={14} className="text-fg-faint" />
                  </button>
                ))}
                <p className="text-[11px] text-fg-faint pt-1">Tip: set speed to 4× for the full SGH run (about 11 minutes of simulated driving).</p>
              </div>
            )}
            {tab === 'events' && (
              <div className="space-y-3">
                <FilterChips options={EVENT_FILTERS} value={eventFilter} onChange={setEventFilter} />
                <ul className="space-y-2">
                  {events.map((e) => (
                    <li key={e.id} className="flex gap-2 text-[11.5px]">
                      <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: LEVEL_DOT[e.level] }} />
                      <span className="font-mono text-[10.5px] text-fg-faint shrink-0 tabular-nums" title="Twin time">{fmtTime(e.time)}</span>
                      <span className="text-fg-muted leading-snug">
                        {e.junctionId ? <Link to={`/junctions/${e.junctionId}`} className="hover:underline">{e.text}</Link>
                          : eventGroup(e) === 'security' ? <Link to="/security" className="hover:underline">{e.text}</Link> : e.text}
                      </span>
                    </li>
                  ))}
                  {!events.length && <li className="text-xs text-fg-faint">No events of this type yet.</li>}
                </ul>
              </div>
            )}
          </div>
        </Card>
      </div>
      <p className="text-[10px] text-fg-faint">{data.attribution}</p>
    </div>
  );
}
