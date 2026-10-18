import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapContainer, Marker, Polyline, Popup, Tooltip, useMap } from 'react-leaflet';
import { Card, Button, Badge, Tabs, Icon, ProgressBar, IconButton } from '../components/ui';
import { useData, useSim } from '../data/DataProvider';
import { useTheme } from '../theme/ThemeProvider';
import BaseTiles from '../components/evp/BaseTiles';
import { resolveColor } from '../components/charts/chartTheme';
import { junctionIcon, ambulanceIcon, hospitalIcon, ghostIcon, moveGlyph } from '../components/evp/mapIcons';
import { PriorityBadge, fmtS, fmtTime, STATUS_LABEL, REQUEST_LABEL, SignalHead, MODE_LABEL } from '../components/evp/format';
import { SCENARIOS } from '../evp/engine/scenarios';
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

function RouteLines({ engine, trip }) {
  const step = Math.round(trip.d / 25);
  const lines = useMemo(() => {
    const t = engine.trips.get(trip.id);
    if (!t) return null;
    const line = t.physRoute.line;
    return { done: line.slice(0, trip.d), todo: line.slice(trip.d, line.length) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, trip.id, trip.routeVersion, step]);
  if (!lines) return null;
  const color = resolveColor(ROUTE_TONE[trip.priority] || 'info');
  return (
    <>
      <Polyline positions={lines.done} pathOptions={{ color: resolveColor('neutral'), weight: 4, opacity: 0.5 }} />
      <Polyline positions={lines.todo} pathOptions={{ color, weight: 9, opacity: 0.18 }} />
      <Polyline positions={lines.todo} pathOptions={{ color, weight: 4, opacity: 0.95 }} />
    </>
  );
}

function approachLabel(n) {
  if (!n) return null;
  const p = n.topP != null ? n.topP.toFixed(2) : '–';
  if (n.request === 'GREEN') return `${moveGlyph(n.top)} GREEN · held`;
  if (n.request === 'SENT') return `${moveGlyph(n.top)} ${p} · G in ${Math.round(n.greenIn ?? 0)} s`;
  if (n.request === 'YIELDING') return `${moveGlyph(n.top)} yielding to ${n.yieldTo || '…'}`;
  if (n.request === 'BLOCKED') return '⛔ request blocked';
  return `${moveGlyph(n.top)} ${p} · ETA ${Math.round(n.eta ?? 0)} s`;
}

function NextJunction({ n }) {
  if (!n) return <p className="text-xs text-fg-faint">No EVP junctions left on the route.</p>;
  const ranked = n.probs ? Object.entries(n.probs).sort((a, b) => b[1] - a[1]).filter(([, v]) => v > 0.02) : [];
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
        <div><p className="label-caps">ETA</p><p className="font-bold text-fg text-sm tabular-nums">{n.eta != null ? `${Math.round(n.eta)} s` : '–'}</p><p className="text-fg-faint tabular-nums">{n.lo != null ? `80%: ${Math.round(n.lo)}–${Math.round(n.hi)} s` : ''}</p></div>
        <div><p className="label-caps">Movement</p><p className="font-bold text-fg text-sm">{moveGlyph(n.top)} {MOVE_LABEL[n.top]}</p><p className="text-fg-faint">P = {n.topP != null ? n.topP.toFixed(2) : '–'} · from {n.arm}</p></div>
        <div><p className="label-caps">Request</p><p className="font-bold text-fg text-sm">{REQUEST_LABEL[n.request] || 'Pending'}</p><p className="text-fg-faint">{n.phase ? `phase ${n.phase}` : n.greenIn != null ? `~${Math.round(n.greenIn)} s to trigger` : ''}</p></div>
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

function TripCard({ trip, engine, follow, onFollow }) {
  const remainingPct = (trip.d / Math.max(1, trip.length)) * 100;
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
        <IconButton icon="navigation" label={follow ? 'Stop following' : 'Follow on map'} active={follow} onClick={onFollow} />
      </div>
      <div className="text-[11px] text-fg-muted">{trip.origin} → <b className="text-fg">{trip.destination.name}</b> · {fmtS(trip.elapsed)} elapsed · {(trip.remaining / 1000).toFixed(1)} km left</div>
      <ProgressBar value={remainingPct} tone="primary" />
      <NextJunction n={trip.next} />
      <div className="flex gap-1 flex-wrap">
        {trip.crossings.map((c) => (
          <Link key={`${c.j}-${Math.round(c.dStop)}`} to={`/junctions/${c.j}`} title={`${c.j}: ${c.passed ? 'passed' : REQUEST_LABEL[c.request] || 'ahead'}`}>
            <Badge tone={c.passed ? (c.wait < 1 ? 'success' : 'warning') : c.request === 'GREEN' ? 'success' : c.request === 'SENT' ? 'primary' : c.request === 'YIELDING' ? 'warning' : c.request === 'BLOCKED' ? 'danger' : 'neutral'}>
              {c.passed ? '✓ ' : ''}{c.j}
            </Badge>
          </Link>
        ))}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        <Button size="sm" variant="secondary" icon="stop" onClick={() => engine.stopVehicle(trip.vehicleId, 40)} title="Simulate a 40 s roadside stop (tests the 20 s cancel rule)">Stop 40 s</Button>
        <Button size="sm" variant="secondary" icon="route" onClick={() => engine.divert(trip.vehicleId)} title="Turn off the route before the next junction (tests the divert rule)">Divert</Button>
        <Button size="sm" variant="ghost" icon="close" onClick={() => engine.endTrip(trip.id, 'Ended by operator')}>End trip</Button>
      </div>
    </div>
  );
}

function SimControls({ snap, sim, engine }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="font-mono text-xs px-2 py-1 rounded-md border bg-surface-raised text-fg" title="Simulation clock (Kuching time)">
        {fmtTime(snap.now)} MYT
      </span>
      <IconButton icon={snap.paused ? 'play' : 'pause'} label={snap.paused ? 'Resume simulation' : 'Pause simulation'} onClick={() => sim.togglePause()} />
      <div className="timeframe" role="group" aria-label="Simulation speed">
        {[1, 2, 4, 8].map((s) => (
          <button key={s} type="button" className={!snap.paused && snap.speed === s ? 'is-active' : ''} onClick={() => sim.setSpeed(s)}>{s}×</button>
        ))}
      </div>
      <Button size="sm" variant={snap.rain ? 'soft' : 'secondary'} icon="rain" onClick={() => engine.setRain(!snap.rain)} aria-pressed={snap.rain}>{snap.rain ? 'Rain' : 'Dry'}</Button>
      <Button size="sm" variant={snap.ambient ? 'soft' : 'secondary'} icon="refresh" onClick={() => sim.setAmbient(!snap.ambient)} aria-pressed={snap.ambient} title="Start random background trips every few minutes">Background trips</Button>
    </div>
  );
}

const LEVEL_DOT = { info: 'var(--color-info)', success: 'var(--color-success)', warning: 'var(--color-warning)', danger: 'var(--color-danger)' };

export default function CommandMap() {
  const { data, engine, sim, runScenario } = useData();
  const snap = useSim();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [tab, setTab] = useState('live');
  const [follow, setFollow] = useState(null);
  const [showIdle, setShowIdle] = useState(true);
  const [result, setResult] = useState(null);

  if (!snap) return null;
  const jStates = snap.junctions;
  const approaching = {};
  snap.trips.forEach((t) => { if (t.next) approaching[t.next.j] = { arm: t.next.arm, move: t.next.top, label: approachLabel(t.next), vehicle: t.vehicleId }; });
  const preempting = Object.values(jStates).filter((s) => s.mode === 'PREEMPT').length;
  const recovering = Object.values(jStates).filter((s) => s.mode === 'RECOVERY').length;
  const openAlerts = snap.alerts.filter((a) => a.status === 'open').length;
  const followed = follow && snap.vehicles.find((v) => v.id === follow);

  const run = (id) => {
    const res = runScenario(id);
    setResult(res);
    if (res.ok) setTab('live');
    if (res.ok && res.tripIds?.length) {
      const t = engine.trips.get(res.tripIds[res.tripIds.length - 1]);
      if (t) setFollow(t.vehicleId);
    }
  };

  const stats = [
    { label: 'Active trips', value: snap.trips.length, icon: 'ambulance' },
    { label: 'Pre-empting', value: preempting, icon: 'traffic', tone: preempting ? 'primary' : null },
    { label: 'Recovering', value: recovering, icon: 'refresh', tone: recovering ? 'warning' : null },
    { label: 'Requests sent', value: snap.stats.requests, icon: 'send' },
    { label: 'Conflicts resolved', value: snap.stats.conflicts, icon: 'alert' },
    { label: 'Open alerts', value: openAlerts, icon: 'shield', tone: openAlerts ? 'danger' : null },
  ];

  return (
    <div className="flex flex-col gap-3" style={{ minHeight: 'calc(100vh - var(--header-height) - 40px)' }}>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Live Command Map</h1>
          <p className="page-subtitle">Kuching South · 22 SCATS junctions · {data.ambulances.length} ambulances · simulated traffic on real roads</p>
        </div>
        <SimControls snap={snap} sim={sim} engine={engine} />
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="card px-3 py-2 flex items-center gap-2.5">
            <span className="stat-card-icon" style={{ width: 28, height: 28, ...(s.tone ? { background: `var(--color-${s.tone}-soft)`, color: `var(--color-${s.tone})` } : {}) }}><Icon name={s.icon} size={15} /></span>
            <div className="min-w-0"><p className="text-lg font-bold text-fg leading-none">{s.value}</p><p className="text-[10px] text-fg-faint truncate mt-0.5">{s.label}</p></div>
          </div>
        ))}
      </div>

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-3 min-h-0">
        <div className="card overflow-hidden relative" style={{ minHeight: 520 }}>
          <MapContainer center={CENTER} zoom={14} style={{ height: '100%', width: '100%', minHeight: 520 }} preferCanvas={false}>
            <BaseTiles theme={theme} />
            {data.boundary.rings.map((ring, i) => (
              <Polyline key={`b${i}`} positions={ring} pathOptions={{ color: resolveColor('primary'), weight: 1.5, dashArray: '6 6', opacity: 0.55 }} />
            ))}
            {snap.trips.map((t) => <RouteLines key={`${t.id}-${t.routeVersion}`} engine={engine} trip={t} />)}
            {data.junctions.map((j) => (
              <Marker key={j.id} position={[j.lat, j.lng]} icon={junctionIcon(j, jStates[j.id], approaching[j.id], false)} zIndexOffset={approaching[j.id] ? 500 : 0}>
                <Popup>
                  <div className="space-y-1.5" style={{ minWidth: 220 }}>
                    <p className="text-[13px] font-bold">{j.id} {j.name}</p>
                    <p className="text-[11px]">SCATS site {j.scatsSite}{j.poc ? ' · 2024 proof-of-concept site' : ''}</p>
                    <p className="text-[11px]">{MODE_LABEL[jStates[j.id]?.mode]} · phase {jStates[j.id]?.phaseId} ({jStates[j.id]?.stage.toLowerCase()}) · queue {Math.round(Object.values(jStates[j.id]?.queues || {}).reduce((s, q) => s + q, 0))} veh</p>
                    <button type="button" className="link-btn" onClick={() => navigate(`/junctions/${j.id}`)}>OPEN JUNCTION DETAIL</button>
                  </div>
                </Popup>
              </Marker>
            ))}
            {data.hospitals.map((h) => (
              <Marker key={h.id} position={[h.lat, h.lng]} icon={hospitalIcon(h)}>
                <Tooltip direction="top" offset={[0, -12]} className="evp-tip">{h.name}{h.approx ? ' (approximate location)' : ''}</Tooltip>
              </Marker>
            ))}
            {snap.vehicles.filter((v) => v.tripId || showIdle).map((v) => {
              const trip = snap.trips.find((t) => t.id === v.tripId);
              const n = trip?.next;
              return (
                <Marker key={v.id} position={[v.lat, v.lng]} zIndexOffset={v.tripId ? 1000 : -100}
                  icon={ambulanceIcon({ id: v.id, heading: v.heading, priority: v.priority, quarantined: v.quarantined, selected: follow === v.id, idle: !v.tripId })}
                  eventHandlers={{ click: () => v.tripId && setFollow(v.id) }}>
                  {v.tripId ? (
                    <Tooltip permanent direction="right" offset={[18, 0]} className="evp-tip">
                      <span className="text-[11px]">
                        {n ? <><b>{n.j}</b> · {n.eta != null ? `${Math.round(n.eta)} s` : '…'}{n.lo != null ? ` (${Math.round(n.lo)}–${Math.round(n.hi)})` : ''}</> : 'to destination'}
                        {' · '}{Math.round(v.speed * 3.6)} km/h
                      </span>
                    </Tooltip>
                  ) : (
                    <Tooltip direction="top" className="evp-tip">{v.id} · {v.callsign} · {v.operator} · at {v.location}</Tooltip>
                  )}
                </Marker>
              );
            })}
            {snap.ghosts.map((g) => (
              <Marker key={g.obuId} position={[g.lat, g.lng]} icon={ghostIcon(g)}>
                <Tooltip direction="top" className="evp-tip">Unregistered OBU {g.obuId}: request blocked</Tooltip>
              </Marker>
            ))}
            <FollowVehicle active={Boolean(followed)} position={followed ? [followed.lat, followed.lng] : null} />
          </MapContainer>
          <div className="absolute left-3 bottom-3 z-[500] card px-3 py-2 text-[10.5px] text-fg-muted space-y-1" style={{ background: 'var(--color-surface)' }}>
            <p className="label-caps">Legend</p>
            <p className="flex items-center gap-2"><span className="inline-flex gap-0.5">{['var(--signal-green)', 'var(--signal-amber)', 'var(--signal-red)'].map((c) => <span key={c} className="w-2 h-2 rounded-full" style={{ background: c }} />)}</span>Approach signal (green / amber / red)</p>
            <p className="flex items-center gap-2"><span className="w-3 h-3 rounded-full border-2" style={{ borderColor: 'var(--color-primary)' }} />Pre-empting · <span className="w-3 h-3 rounded-full border-2 border-dashed" style={{ borderColor: 'var(--color-warning)' }} />Recovery</p>
            <p className="flex items-center gap-2"><span style={{ color: 'var(--color-accent)' }}>➜</span>Predicted movement + probability</p>
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={showIdle} onChange={(e) => setShowIdle(e.target.checked)} />Show idle ambulances</label>
          </div>
        </div>

        <Card padded={false} className="flex flex-col min-h-[520px]">
          <div className="px-3 pt-3"><Tabs tabs={[{ value: 'live', label: `Live (${snap.trips.length})` }, { value: 'scenarios', label: 'Scenarios' }, { value: 'events', label: 'Event log' }]} value={tab} onChange={setTab} size="sm" /></div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ maxHeight: 'calc(100vh - 260px)' }}>
            {result && (
              <div className={`tile text-xs ${result.ok ? 'tone-success' : 'tone-danger'} flex gap-2`}>
                <span className="flex-1">{result.message}</span>
                <button type="button" className="link-btn" onClick={() => setResult(null)}>DISMISS</button>
              </div>
            )}
            {tab === 'live' && (
              snap.trips.length ? snap.trips.map((t) => (
                <TripCard key={t.id} trip={t} engine={engine} follow={follow === t.vehicleId} onFollow={() => setFollow(follow === t.vehicleId ? null : t.vehicleId)} />
              )) : (
                <div className="text-center py-10 space-y-3">
                  <Icon name="ambulance" size={28} className="mx-auto text-fg-faint" />
                  <p className="text-sm text-fg-muted">No ambulance on an EVP trip.</p>
                  <p className="text-xs text-fg-faint">Press START on the <Link className="text-primary underline" to="/tablet">ambulance tablet</Link>, or run a scenario.</p>
                  <Button icon="play" onClick={() => run('sgh')}>Run SGH demo</Button>
                </div>
              )
            )}
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
                <p className="text-[11px] text-fg-faint pt-1">Tip: set speed to 4× for the full SGH run (~10 min of simulated driving).</p>
              </div>
            )}
            {tab === 'events' && (
              <ul className="space-y-2">
                {snap.events.map((e) => (
                  <li key={e.id} className="flex gap-2 text-[11.5px]">
                    <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: LEVEL_DOT[e.level] }} />
                    <span className="font-mono text-[10.5px] text-fg-faint shrink-0 tabular-nums">{fmtTime(e.time)}</span>
                    <span className="text-fg-muted leading-snug">{e.junctionId ? <Link to={`/junctions/${e.junctionId}`} className="hover:underline">{e.text}</Link> : e.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
      <p className="text-[10px] text-fg-faint">{data.attribution}</p>
    </div>
  );
}
