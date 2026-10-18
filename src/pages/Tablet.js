import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, Marker, Polyline, useMap } from 'react-leaflet';
import { Card, Button, Badge, Tabs, Icon, PageHeader, DetailGrid } from '../components/ui';
import { useData, useSim } from '../data/DataProvider';
import { useTheme } from '../theme/ThemeProvider';
import BaseTiles from '../components/evp/BaseTiles';
import { resolveColor } from '../components/charts/chartTheme';
import { ambulanceIcon, junctionIcon, hospitalIcon, moveGlyph } from '../components/evp/mapIcons';
import { PriorityBadge, fmtS, STATUS_LABEL, REQUEST_LABEL } from '../components/evp/format';
import { MOVE_LABEL } from '../evp/junctions';

const PRIORITIES = ['Critical', 'Urgent', 'Non-urgent'];
const STATUSES = [
  { value: 'TO_PATIENT', label: 'To patient' },
  { value: 'TO_HOSPITAL', label: 'To hospital' },
  { value: 'RETURNING', label: 'Returning (no EVP)' },
];

function Follow({ pos }) {
  const map = useMap();
  useEffect(() => { if (pos) map.panTo(pos, { animate: true, duration: 0.3 }); }, [pos, map]);
  return null;
}

/* The big status strip the crew reads at a glance. */
function SignalStatus({ trip }) {
  const n = trip.next;
  if (trip.evpSuspended) {
    return (
      <div className="signal-card is-blocked">
        <p className="text-[11px] font-bold uppercase tracking-widest opacity-80">EVP suspended</p>
        <p className="text-2xl font-extrabold mt-1">Contact control room</p>
        <p className="text-sm opacity-90 mt-1">The anomaly guard blocked green requests from this unit. Drive with caution; signals run normally.</p>
      </div>
    );
  }
  if (!n) {
    return (
      <div className="signal-card is-idle">
        <p className="text-[11px] font-bold uppercase tracking-widest text-fg-faint">No EVP junctions ahead</p>
        <p className="text-2xl font-extrabold mt-1 text-fg">Proceed to {trip.destination.short}</p>
        <p className="text-sm text-fg-muted mt-1">{(trip.remaining / 1000).toFixed(1)} km remaining</p>
      </div>
    );
  }
  let cls = 'is-wait';
  let head = 'Approaching';
  let big = n.greenIn == null ? 'Predicting…' : n.greenIn < 1 ? 'Requesting green…' : `Green in ${Math.round(n.greenIn)} s`;
  if (n.request === 'GREEN') { cls = 'is-green'; head = 'Green held for you'; big = 'GREEN: proceed with caution'; }
  else if (n.request === 'SENT') { head = 'Requested'; big = `Green in ${Math.max(1, Math.round(n.greenIn ?? 0))} s`; }
  else if (n.request === 'YIELDING') { cls = 'is-hold'; head = 'Priority conflict'; big = `HOLD: yielding to ${n.yieldTo || 'higher priority'}`; }
  else if (n.request === 'BLOCKED') { cls = 'is-blocked'; head = 'Request blocked'; big = 'Signals running normally'; }
  else if (n.request === 'CANCELLED') { cls = 'is-hold'; head = 'Request cancelled'; big = 'Re-requests when moving'; }
  return (
    <div className={`signal-card ${cls}`} role="status" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest opacity-80">{head} · {n.j}</p>
          <p className="text-3xl font-extrabold mt-1 leading-tight">{big}</p>
          <p className="text-sm opacity-90 mt-1 truncate">{n.name}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-5xl font-black leading-none">{moveGlyph(n.top)}</p>
          <p className="text-[11px] font-bold mt-1">{MOVE_LABEL[n.top]} · P {n.topP != null ? n.topP.toFixed(2) : '–'}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 text-[12px]">
        <div className="rounded-lg px-2 py-1.5" style={{ background: 'rgba(0,0,0,0.18)' }}><p className="opacity-75 text-[10px] uppercase font-bold">Distance</p><p className="font-bold text-base">{Math.round(n.dist)} m</p></div>
        <div className="rounded-lg px-2 py-1.5" style={{ background: 'rgba(0,0,0,0.18)' }}><p className="opacity-75 text-[10px] uppercase font-bold">ETA</p><p className="font-bold text-base">{n.eta != null ? `${Math.round(n.eta)} s` : '–'}<span className="text-[11px] font-semibold opacity-80"> {n.lo != null ? `(${Math.round(n.lo)}–${Math.round(n.hi)})` : ''}</span></p></div>
        <div className="rounded-lg px-2 py-1.5" style={{ background: 'rgba(0,0,0,0.18)' }}><p className="opacity-75 text-[10px] uppercase font-bold">Phase</p><p className="font-bold text-base">{n.phase || '–'}</p></div>
      </div>
    </div>
  );
}

function ActiveTrip({ trip, engine, data, theme }) {
  const veh = useSim().vehicles.find((v) => v.id === trip.vehicleId);
  const route = useMemo(() => engine.routeLatLngs(trip.id), [engine, trip.id, trip.routeVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const nextJ = trip.next ? data.junctions.find((j) => j.id === trip.next.j) : null;
  const jStates = useSim().junctions;
  const dest = data.hospitals.find((h) => h.id === trip.destination.id);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-3 p-3">
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <PriorityBadge priority={trip.priority} />
          <Badge tone="neutral">{STATUS_LABEL[trip.status]}</Badge>
          <span className="text-sm font-semibold text-fg">→ {trip.destination.name}</span>
          <span className="flex-1" />
          <span className="text-xs text-fg-faint">{fmtS(trip.elapsed)} · {(trip.remaining / 1000).toFixed(1)} km left</span>
        </div>
        <SignalStatus trip={trip} />
        <div className="card p-3">
          <p className="label-caps mb-2">Junctions on route</p>
          <div className="space-y-1.5">
            {trip.crossings.map((c) => {
              const j = data.junctions.find((x) => x.id === c.j);
              return (
                <div key={`${c.j}-${Math.round(c.dStop)}`} className={`flex items-center gap-2 text-[12px] ${c.passed ? 'opacity-50' : ''}`}>
                  <span className="w-8 font-bold text-fg">{c.j}</span>
                  <span className="flex-1 truncate text-fg-muted">{j?.name}</span>
                  <span className="text-fg-faint">{moveGlyph(c.move)}</span>
                  <Badge tone={c.passed ? 'success' : c.request === 'GREEN' ? 'success' : c.request === 'SENT' ? 'primary' : c.request === 'YIELDING' ? 'warning' : c.request === 'BLOCKED' ? 'danger' : 'neutral'}>
                    {c.passed ? `Passed${c.wait > 1 ? ` · waited ${Math.round(c.wait)} s` : ''}` : REQUEST_LABEL[c.request] || (c.eta != null ? `ETA ${Math.round(c.eta)} s` : 'Ahead')}
                  </Badge>
                </div>
              );
            })}
            {!trip.crossings.length && <p className="text-xs text-fg-faint">This route has no EVP junctions.</p>}
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <div className="card overflow-hidden" style={{ height: 300 }}>
          <MapContainer center={veh ? [veh.lat, veh.lng] : [1.535, 110.36]} zoom={16} zoomControl={false} attributionControl={false} style={{ height: '100%', width: '100%' }}>
            <BaseTiles theme={theme} />
            {route && <Polyline positions={route} pathOptions={{ color: resolveColor('primary'), weight: 5, opacity: 0.85 }} />}
            {nextJ && <Marker position={[nextJ.lat, nextJ.lng]} icon={junctionIcon(nextJ, jStates[nextJ.id], { arm: trip.next.arm, move: trip.next.top, label: `${moveGlyph(trip.next.top)} ${trip.next.topP?.toFixed(2) ?? ''}` }, false)} />}
            {dest && <Marker position={[dest.lat, dest.lng]} icon={hospitalIcon(dest)} />}
            {veh && <Marker position={[veh.lat, veh.lng]} icon={ambulanceIcon({ id: veh.id, heading: veh.heading, priority: trip.priority, quarantined: veh.quarantined })} />}
            {veh && <Follow pos={[veh.lat, veh.lng]} />}
          </MapContainer>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon="stop" onClick={() => engine.stopVehicle(trip.vehicleId, 40)}>Stop 40 s</Button>
          <Button variant="secondary" icon="route" onClick={() => engine.divert(trip.vehicleId)}>Divert</Button>
        </div>
        <Button variant="danger" block size="lg" icon="close" onClick={() => engine.endTrip(trip.id, 'Ended by crew')}>END TRIP</Button>
        <p className="text-[10.5px] text-fg-faint">Stop / Divert are demo controls: they test the "cancel after 20 s" rule.</p>
      </div>
    </div>
  );
}

/* Crew sign-in survives page changes for the browser session, like an OBU
   that stays logged in while the operator looks at other screens. */
const SESSION_KEY = 'evp-tablet-session';
function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null; } catch (e) { return null; }
}
function saveSession(s) {
  try { if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); else sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* storage unavailable */ }
}

export default function Tablet() {
  const { data, engine, liveTrips } = useData();
  const snap = useSim();
  const { theme } = useTheme();
  const [session] = useState(loadSession);
  const [vehicleId, setVehicleId] = useState(session?.vehicleId || 'AMB-11');
  const [crew, setCrew] = useState(session?.crew || 'MA-0412');
  const [pin, setPin] = useState('');
  const [loggedIn, setLoggedInState] = useState(Boolean(session));
  const setLoggedIn = (on) => { saveSession(on ? { vehicleId, crew } : null); setLoggedInState(on); };
  const [status, setStatus] = useState('TO_HOSPITAL');
  const [priority, setPriority] = useState('Critical');
  const [originId, setOriginId] = useState('');
  const [hospitalId, setHospitalId] = useState('SGH');
  const [placeId, setPlaceId] = useState(data.places[0]?.id);
  const [error, setError] = useState(null);

  const amb = data.ambulances.find((a) => a.id === vehicleId);
  const vehSnap = snap?.vehicles.find((v) => v.id === vehicleId);
  const trip = snap?.trips.find((t) => t.vehicleId === vehicleId);
  const lastTrip = liveTrips.find((t) => t.ambulanceId === vehicleId);
  const quarantined = snap?.quarantined.includes(vehicleId);
  const base = data.bases.find((b) => b.id === amb?.base);

  // Default the pickup point to a busy corridor so the SGH demo crosses several junctions.
  useEffect(() => {
    if (!originId && data.places.length) setOriginId((data.places.find((p) => p.name === 'Northbank') || data.places[0]).id);
  }, [data.places, originId]);

  const start = () => {
    setError(null);
    try {
      const origin = data.places.find((p) => p.id === originId);
      if (origin && status !== 'RETURNING') engine.placeVehicle(vehicleId, origin.node, origin.name);
      const destination = status === 'TO_HOSPITAL' ? { type: 'hospital', id: hospitalId }
        : status === 'TO_PATIENT' ? { type: 'place', id: placeId } : { type: 'place', id: amb.base };
      engine.startTrip({ vehicleId, status, priority, destination, originName: status !== 'RETURNING' ? origin?.name : undefined, crew });
    } catch (e) { setError(e.message); }
  };

  const screen = !loggedIn ? (
    <form className="p-6 max-w-md mx-auto space-y-4" onSubmit={(e) => { e.preventDefault(); if (pin.length === 4 && crew) setLoggedIn(true); }}>
      <div className="text-center space-y-1 pt-4">
        <img src="/logo.svg" alt="" className="w-12 h-12 mx-auto" />
        <p className="text-lg font-bold text-fg">GreenLight EVP · On-board unit</p>
        <p className="text-xs text-fg-faint">Crew sign-in</p>
      </div>
      <label className="block"><span className="label-caps field-label">Ambulance</span>
        <select className="select" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          {data.ambulances.map((a) => <option key={a.id} value={a.id}>{a.id} · {a.callsign} · {a.operator}</option>)}
        </select>
      </label>
      <label className="block"><span className="label-caps field-label">Crew ID</span><input className="input" value={crew} onChange={(e) => setCrew(e.target.value)} /></label>
      <label className="block"><span className="label-caps field-label">PIN</span><input className="input" type="password" autoComplete="off" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="Any 4 digits (prototype)" /></label>
      <Button type="submit" block size="lg" disabled={pin.length !== 4 || !crew}>Sign in</Button>
      <p className="text-[11px] text-fg-faint text-center">OBU {amb?.obuId} · {amb?.plate} · registered {amb?.registered}</p>
    </form>
  ) : trip ? (
    <ActiveTrip trip={trip} engine={engine} data={data} theme={theme} />
  ) : (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-base font-bold text-fg">{vehicleId}</span>
        <span className="text-xs text-fg-faint">{amb.callsign} · crew {crew} · at {vehSnap?.location}</span>
        <span className="flex-1" />
        {quarantined && <Badge tone="danger" dot>EVP suspended by control</Badge>}
        <Button size="sm" variant="ghost" icon="logout" onClick={() => { setLoggedIn(false); setPin(''); }}>Sign out</Button>
      </div>
      {lastTrip && (
        <div className="tile tone-success text-xs flex items-center gap-3 flex-wrap">
          <Icon name="check" size={16} />
          <span className="flex-1">Last trip {lastTrip.id} to {lastTrip.destinationName}: {fmtS(lastTrip.duration)}, <b>{Math.round(lastTrip.saved)} s saved</b> across {lastTrip.junctions.length} junctions.</span>
          <Link to={`/assistant?trip=${lastTrip.id}`} className="link-btn">POST-TRIP REPORT</Link>
        </div>
      )}
      <div>
        <p className="label-caps mb-2">Trip status</p>
        <Tabs tabs={STATUSES} value={status} onChange={setStatus} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {status !== 'RETURNING' && (
          <label className="block"><span className="label-caps field-label">{status === 'TO_HOSPITAL' ? 'Patient pickup (current location)' : 'Current location'}</span>
            <select className="select" value={originId} onChange={(e) => setOriginId(e.target.value)}>
              {data.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        {status === 'TO_HOSPITAL' && (
          <label className="block"><span className="label-caps field-label">Destination hospital</span>
            <select className="select" value={hospitalId} onChange={(e) => setHospitalId(e.target.value)}>
              {data.hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}{h.approx ? ' (approx. location)' : ''}</option>)}
            </select>
          </label>
        )}
        {status === 'TO_PATIENT' && (
          <label className="block"><span className="label-caps field-label">Patient location</span>
            <select className="select" value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
              {data.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        {status === 'RETURNING' && <p className="text-xs text-fg-faint sm:col-span-2">Returning to {base?.name}. EVP is not permitted without a patient status: requests will be blocked and logged.</p>}
      </div>
      <div>
        <p className="label-caps mb-2">Patient priority</p>
        <Tabs tabs={PRIORITIES} value={priority} onChange={setPriority} />
      </div>
      <button type="button" className="big-start" onClick={start}>
        {status === 'RETURNING' ? 'START TRIP (NO EVP)' : 'START EVP'}
      </button>
      {error && <p className="tile tone-danger text-xs">{error}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Ambulance Tablet" subtitle="On-board unit app: the crew taps START, the cloud tracks the approach to each junction, the roadside unit requests the green" />
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
        <div className="tablet-frame"><div className="tablet-screen">{screen}</div></div>
        <div className="space-y-4">
          <Card title="What happens when you press START">
            <ol className="space-y-2 text-xs text-fg-muted list-decimal list-inside">
              <li>The OBU sends a GPS fix every 2 s with speed, heading and lane.</li>
              <li>The cloud checks the unit is registered, on an active trip and has a patient status.</li>
              <li>For each junction ahead the ETA model predicts arrival (with an 80% band) and the movement model predicts Left / Straight / Right / U-turn.</li>
              <li>When ETA ≤ clearance + 15 s, the SCATS adapter requests the phase. Transitions use 3 s amber + 2 s all-red; pedestrian crossings are never cut.</li>
              <li>After the ambulance clears, SCATS recovers queues over 1–2 cycles.</li>
            </ol>
          </Card>
          <Card title="This unit">
            <DetailGrid columns={2} items={[
              { label: 'Vehicle', value: vehicleId },
              { label: 'OBU', value: amb?.obuId },
              { label: 'Plate', value: amb?.plate },
              { label: 'Operator', value: amb?.operator },
              { label: 'Base', value: base?.name },
              { label: 'EVP status', value: quarantined ? <Badge tone="danger">Suspended</Badge> : <Badge tone="success">Authorised</Badge> },
            ]} />
          </Card>
        </div>
      </div>
    </div>
  );
}
