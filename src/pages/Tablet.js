import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MapContainer, Marker, Polyline, useMap } from 'react-leaflet';
import { Card, Button, Badge, Tabs, Icon, PageHeader, DetailGrid } from '../components/ui';
import { useData, useSim } from '../data/DataProvider';
import { useTheme } from '../theme/ThemeProvider';
import BaseTiles from '../components/evp/BaseTiles';
import { resolveColor } from '../components/charts/chartTheme';
import { ambulanceIcon, junctionIcon, hospitalIcon, moveGlyph } from '../components/evp/mapIcons';
import { PriorityBadge, fmtS, STATUS_LABEL, REQUEST_LABEL, UnitStatusBadge } from '../components/evp/format';
import { MOVE_LABEL } from '../evp/junctions';
import { APP, ORG } from '../config';

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
        <p className="signal-card-eyebrow">EVP suspended</p>
        <p className="signal-card-display text-2xl mt-1">Contact control room</p>
        <p className="text-sm mt-1">The anomaly guard blocked green requests from this unit. Drive with caution; signals run normally.</p>
      </div>
    );
  }
  if (!n) {
    return (
      <div className="signal-card is-idle">
        <p className="signal-card-eyebrow text-fg-faint">No EVP junctions ahead</p>
        <p className="signal-card-display text-2xl mt-1 text-fg">Proceed to {trip.destination.short}</p>
        <p className="text-sm text-fg-muted mt-1">{(trip.remaining / 1000).toFixed(1)} km remaining</p>
      </div>
    );
  }
  let cls = 'is-wait';
  let head = 'Approaching';
  let big = n.greenIn == null ? 'Predicting…' : n.greenIn < 1 ? 'Requesting green…' : `Green in ${Math.round(n.greenIn)} s`;
  if (n.request === 'GREEN') { cls = 'is-green'; head = 'Green held for you'; big = 'Green: proceed with caution'; }
  else if (n.request === 'SENT') { head = 'Requested'; big = n.greenIn < 1 ? 'Green now' : `Green in ${Math.round(n.greenIn)} s`; }
  else if (n.request === 'YIELDING') { cls = 'is-hold'; head = 'Priority conflict'; big = `Hold: yielding to ${n.yieldTo || 'higher priority'}`; }
  else if (n.request === 'BLOCKED') { cls = 'is-blocked'; head = 'Request blocked'; big = 'Signals running normally'; }
  else if (n.request === 'CANCELLED') { cls = 'is-hold'; head = 'Request cancelled'; big = 'Re-requests when moving'; }
  else if (n.request === 'RELEASED') { cls = 'is-idle'; head = 'Released'; big = 'Signals back to SCATS'; }
  return (
    <div className={`signal-card ${cls}`} role="status" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="signal-card-eyebrow">{head} · {n.j}</p>
          <p className="signal-card-display text-3xl mt-1">{big}</p>
          <p className="text-sm mt-1 truncate">{n.name}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="signal-card-display text-5xl leading-none">{moveGlyph(n.top)}</p>
          <p className="text-[11px] font-bold mt-1">{MOVE_LABEL[n.top]} · P {n.topP != null ? n.topP.toFixed(2) : '–'}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 text-[12px]">
        <div className="signal-card-well"><p className="text-[10px] uppercase font-bold tracking-[0.06em]">Distance</p><p className="font-bold text-base">{Math.round(n.dist)} m</p></div>
        <div className="signal-card-well"><p className="text-[10px] uppercase font-bold tracking-[0.06em]">ETA</p><p className="font-bold text-base">{n.eta != null ? `${Math.round(n.eta)} s` : '–'}<span className="text-[11px] font-bold"> {n.lo != null ? `(${Math.round(n.lo)}–${Math.round(n.hi)})` : ''}</span></p></div>
        <div className="signal-card-well"><p className="text-[10px] uppercase font-bold tracking-[0.06em]">Phase</p><p className="font-bold text-base">{n.phase || '–'}</p></div>
      </div>
    </div>
  );
}

function ActiveTrip({ trip, engine, data, theme }) {
  const snap = useSim();
  const veh = snap.vehicles.find((v) => v.id === trip.vehicleId);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const route = useMemo(() => engine.routeLatLngs(trip.id), [engine, trip.id, trip.routeVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const nextJ = trip.next ? data.junctions.find((j) => j.id === trip.next.j) : null;
  const jStates = snap.junctions;
  const dest = data.hospitals.find((h) => h.id === trip.destination.id);
  useEffect(() => { if (!confirmEnd) return undefined; const t = setTimeout(() => setConfirmEnd(false), 4000); return () => clearTimeout(t); }, [confirmEnd]);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-3 p-3">
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <PriorityBadge priority={trip.priority} />
          <Badge tone="neutral">{STATUS_LABEL[trip.status]}</Badge>
          <span className="text-sm font-semibold text-fg">→ {trip.destination.name}</span>
          <span className="flex-1" />
          <span className="text-xs text-fg-faint">{fmtS(trip.elapsed)} · {(trip.remaining / 1000).toFixed(1)} km left · arrive in ~{fmtS(trip.etaDest, { short: true })}</span>
        </div>
        <SignalStatus trip={trip} />
        <div className="card p-4">
          <p className="label-caps mb-2">Junctions on route</p>
          <div className="space-y-1.5">
            {trip.crossings.map((c) => {
              const j = data.junctions.find((x) => x.id === c.j);
              return (
                <div key={`${c.j}-${Math.round(c.dStop)}`} className={`flex items-center gap-2 text-[12px] ${c.passed ? 'opacity-50' : ''}`}>
                  <span className="w-8 font-bold text-fg">{c.j}</span>
                  <span className="flex-1 truncate text-fg-muted">{j?.name}</span>
                  <span className="text-fg-faint">{moveGlyph(c.move)}</span>
                  <Badge tone={c.passed ? (c.wait > 1 ? 'warning' : 'success') : c.request === 'GREEN' ? 'success' : c.request === 'SENT' ? 'primary' : c.request === 'YIELDING' ? 'warning' : c.request === 'BLOCKED' ? 'danger' : 'neutral'}>
                    {c.passed ? `Passed${c.wait > 1 ? ` · waited ${Math.round(c.wait)} s` : ' on green'}` : REQUEST_LABEL[c.request] || (c.eta != null ? `ETA ${Math.round(c.eta)} s` : 'Ahead')}
                  </Badge>
                </div>
              );
            })}
            {!trip.crossings.length && <p className="text-xs text-fg-faint">This route has no EVP junctions.</p>}
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <div className="card overflow-hidden isolate" style={{ height: 300 }}>
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
        <Button variant="danger" block size="lg" icon="close" onClick={() => (confirmEnd ? engine.endTrip(trip.id, 'Ended by crew') : setConfirmEnd(true))}>
          {confirmEnd ? 'Tap again to end trip' : 'End trip'}
        </Button>
        <p className="text-[10.5px] text-fg-faint">Stop / Divert are demo controls: they test the "cancel after 20 s" rule. The trip ends by itself on arrival.</p>
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
  const { data, engine, ops, liveTrips } = useData();
  const snap = useSim();
  const { theme } = useTheme();
  const [params, setParams] = useSearchParams();
  const [session] = useState(loadSession);
  const wanted = params.get('vehicle');
  const [wantedOnce] = useState(wanted);
  const [vehicleId, setVehicleId] = useState((!session && data.ambulances.some((a) => a.id === wanted) && wanted) || session?.vehicleId || 'AMB-11');
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
  const mission = snap?.ops?.missions.find((m) => m.vehicleId === vehicleId);

  // A unit signed in on the tablet is the crew's: live dispatch does not assign it calls.
  useEffect(() => {
    if (!loggedIn || !ops) return undefined;
    ops.reserve(vehicleId);
    return () => ops.release(vehicleId);
  }, [loggedIn, vehicleId, ops]);
  // ?vehicle= from the map is consumed once.
  useEffect(() => { if (wanted) setParams({}, { replace: true }); }, [wanted, setParams]);

  // Default pickup: where the unit is now if that is a known place, else a busy corridor for the SGH demo.
  useEffect(() => {
    const here = data.places.find((p) => p.name === vehSnap?.location);
    if (here && !trip) setOriginId(here.id);
    else if (!originId && data.places.length) setOriginId((data.places.find((p) => p.name === 'Northbank') || data.places[0]).id);
  }, [data.places, originId, vehSnap?.location, trip]);

  const start = () => {
    setError(null);
    try {
      const origin = data.places.find((p) => p.id === originId);
      // To hospital: the crew is at the pickup. To patient: drive from where the unit is now.
      if (origin && status === 'TO_HOSPITAL') engine.placeVehicle(vehicleId, origin.node, origin.name);
      const destination = status === 'TO_HOSPITAL' ? { type: 'hospital', id: hospitalId }
        : status === 'TO_PATIENT' ? { type: 'place', id: placeId } : { type: 'place', id: amb.base };
      engine.startTrip({ vehicleId, status, priority, destination, originName: status === 'TO_HOSPITAL' ? origin?.name : vehSnap?.location, crew, source: 'tablet' });
    } catch (e) { setError(e.message); }
  };

  const screen = !loggedIn ? (
    <form className="p-6 max-w-md mx-auto space-y-4" onSubmit={(e) => { e.preventDefault(); if (pin.length === 4 && crew) setLoggedIn(true); }}>
      <div className="text-center space-y-1 pt-4">
        <img src={APP.logo} alt={ORG.name} className="h-20 w-auto mx-auto mb-2" />
        <p className="label-caps">{ORG.name}</p>
        <h2 className="astk-h3">{APP.name} · On-board unit</h2>
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
        <span className="font-display text-base font-bold text-fg">{vehicleId}</span>
        <span className="text-xs text-fg-faint">{amb.callsign} · crew {crew} · at {vehSnap?.location}</span>
        <span className="flex-1" />
        {vehSnap && !quarantined && <UnitStatusBadge status={vehSnap.status} />}
        {quarantined && <Badge tone="danger" dot>EVP suspended by control</Badge>}
        <Button size="sm" variant="ghost" icon="logout" onClick={() => { setLoggedIn(false); setPin(''); }}>Sign out</Button>
      </div>
      {wantedOnce && wantedOnce !== vehicleId && <p className="tile tone-info text-xs">This tablet is signed in to {vehicleId}. Sign out to use {wantedOnce}.</p>}
      {mission && (
        <p className="tile tone-accent text-xs">{mission.id}: {mission.priority} call at {mission.place} · {mission.stageLabel}. {mission.stage === 'ON_SCENE' ? 'Choose To hospital and press START when the patient is loaded (otherwise control conveys automatically).' : mission.stage === 'HANDOVER' ? 'Handing over at the hospital; the unit returns to base afterwards.' : ''}</p>
      )}
      {vehSnap?.status === 'REPOSITIONING' && <p className="tile text-xs">Driving to {vehSnap.driveTo} without EVP. Pressing START gives the unit a new job from where it is now.</p>}
      {quarantined && <p className="tile tone-danger text-xs">The anomaly guard has suspended EVP for this unit. A trip can start, but no greens will be requested until control reinstates it.</p>}
      {lastTrip && (
        <div className="tile tone-success text-xs flex items-center gap-3 flex-wrap">
          <Icon name="check" size={16} />
          <span className="flex-1">Last trip {lastTrip.id} to {lastTrip.destinationName}: {fmtS(lastTrip.duration)}{lastTrip.arrived === false ? ' (ended before arrival)' : ''}, <b>{Math.round(lastTrip.saved)} s saved</b> across {lastTrip.junctions.length} junction{lastTrip.junctions.length === 1 ? '' : 's'}.</span>
          <Link to={`/assistant?trip=${lastTrip.id}`} className="link-btn">Post-trip report</Link>
        </div>
      )}
      <div>
        <p className="label-caps mb-2">Trip status</p>
        <Tabs tabs={STATUSES} value={status} onChange={setStatus} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {status === 'TO_HOSPITAL' && (
          <label className="block"><span className="label-caps field-label">Patient pickup (current location)</span>
            <select className="select" value={originId} onChange={(e) => setOriginId(e.target.value)}>
              {data.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        {status === 'TO_PATIENT' && (
          <div><span className="label-caps field-label">From (GPS)</span><p className="tile text-xs">{vehSnap?.location || 'Current position'}</p></div>
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
        {status === 'RETURNING' ? 'Start trip (no EVP)' : 'Start EVP'}
      </button>
      {error && <p className="tile tone-danger text-xs">{error}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
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
