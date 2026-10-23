import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Badge, Button, Tabs, FilterChips, Drawer, Icon, PageHeader, EmptyState } from '../components/ui';
import { toneColor } from '../utils';
import { useData, useSim } from '../data/DataProvider';
import CctvFeed, { cameraActivity, saveSnapshot, isNight } from '../components/evp/CctvFeed';
import { ModeBadge, PriorityBadge, SignalHead, REQUEST_LABEL, STAGE_LABEL } from '../components/evp/format';

/* CCTV: one camera on every signalised approach. The pictures are stand-in
   footage; the overlays and the panels beside them are the live twin. */

function JunctionState({ cam, junction, act, navigate }) {
  const st = act.st;
  if (!st) return null;
  return (
    <Card title={`${junction.id} · ${junction.name}`} subtitle={`Phase ${st.phaseId} ${STAGE_LABEL[st.stage]} · ${Math.round(st.stageRemaining)} s left${st.held ? ' · held for EVP' : ''} · queue ${st.totalQueue} veh (normal ≈ ${st.normalQueue ?? '–'})`}
      actions={<ModeBadge mode={st.mode} recovery={st.recovery} />}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {junction.arms.map((a) => (
          <div key={a.id} className="tile py-1.5 flex items-center gap-2" style={a.id === cam.arm ? { borderColor: 'var(--app-accent-border)' } : undefined}>
            <SignalHead state={st.arms[a.id] || 'R'} size={7} />
            <div className="min-w-0">
              <p className="text-xs font-bold text-fg">{a.id}{a.id === cam.arm ? <span className="text-primary font-semibold"> · this camera</span> : ''}</p>
              <p className="text-[10.5px] text-fg-faint truncate">{a.road || 'Unnamed'} · {Math.round(st.queues[a.id] ?? 0)} veh</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-2">
        {act.approaching.map((t) => (
          <div key={t.id} className="tile text-xs flex items-center gap-2 flex-wrap">
            <b className="text-fg">{t.vehicleId}</b><PriorityBadge priority={t.priority} />
            <span className="text-fg-muted">from {t.next.arm}{t.next.arm === cam.arm ? ' (in this view)' : ''} · {Math.round(t.next.dist)} m · ETA {t.next.eta != null ? `${Math.round(t.next.eta)} s` : '–'}</span>
            <span className="flex-1" />
            <Badge tone={t.next.request === 'GREEN' ? 'success' : t.next.request === 'YIELDING' ? 'warning' : t.next.request === 'BLOCKED' ? 'danger' : t.next.request ? 'primary' : 'neutral'}>{REQUEST_LABEL[t.next.request] || 'Not requested yet'}</Badge>
            <button type="button" className="link-btn" onClick={() => navigate(`/?focus=${t.vehicleId}`)}>Follow on map</button>
          </div>
        ))}
        {!act.approaching.length && <p className="text-xs text-fg-faint">No ambulance approaching this junction.{st.preempt ? ` Pre-emption for ${st.preempt.vehicleId} in progress.` : ''}</p>}
        {st.ped !== 'DONT_WALK' && <p className="text-xs text-fg-muted">Pedestrians: {st.ped === 'WALK' ? 'walk' : 'clearing'}, {Math.round(st.pedRemaining)} s left.</p>}
      </div>
    </Card>
  );
}

export function FootageCredits({ clips, cameras, note, onClose }) {
  const used = (id) => cameras.filter((c) => c.clip === id).map((c) => c.id);
  return (
    <Drawer title="Footage & licences" eyebrow="CCTV" subtitle={`${clips.length} stand-in clips behind ${cameras.length} cameras`} onClose={onClose}>
      <p className="text-xs text-fg-muted mb-4">{note} Clips derived from CC BY-SA works are shared under the same licence.</p>
      <ul className="space-y-3">
        {clips.map((c) => {
          const f = c.footage || {};
          const cams = used(c.id);
          return (
            <li key={c.id} className="tile text-xs space-y-1">
              <p className="text-fg-muted">
                <a className="text-primary hover:underline font-semibold" href={f.sourceUrl} target="_blank" rel="noreferrer">“{f.title}”</a> by {f.author || 'unknown'}, {f.licenceUrl
                  ? <a className="text-primary hover:underline" href={f.licenceUrl} target="_blank" rel="noreferrer">{f.licence}</a> : f.licence} ({f.provider})
              </p>
              <p className="text-fg-faint">{f.place ? `Filmed in ${f.place}` : 'Location not stated by the source'}{f.recorded ? `, ${f.recorded}` : ''}. {f.changes}</p>
              <p className="text-fg-faint">Used by {cams.length} camera{cams.length === 1 ? '' : 's'}: {cams.join(', ')}</p>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-fg-faint mt-4">Rebuild with <code>node scripts/fetch-cctv.mjs</code>.</p>
    </Drawer>
  );
}

export default function Cctv() {
  const { data, engine, operator } = useData();
  const snap = useSim();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const cams = data.cameras;
  const jById = useMemo(() => new Map(data.junctions.map((j) => [j.id, j])), [data.junctions]);
  const camsByJ = data.camerasByJ;
  const [layout, setLayout] = useState('focus');
  const [filter, setFilter] = useState('all');
  const [follow, setFollow] = useState(false);
  const [credits, setCredits] = useState(false);
  const [note, setNote] = useState(null);
  const videoRef = useRef(null);
  const frameRef = useRef(null);

  // ?cam=CAM-J01-NE picks a camera; ?j=J01 picks the junction's camera facing
  // the nearest approaching ambulance, or its first camera.
  const jParam = params.get('j');
  const jAmb = jParam && snap?.trips.filter((t) => t.next?.j === jParam && !t.evpSuspended).sort((a, b) => (a.next.eta ?? 1e9) - (b.next.eta ?? 1e9))[0];
  const fromJ = jParam && (camsByJ.get(jParam)?.find((c) => c.arm === jAmb?.next.arm) || camsByJ.get(jParam)?.[0]);
  const fallback = cams.find((c) => jById.get(c.junctionId)?.poc) || cams[0];
  const cam = cams.find((c) => c.id === params.get('cam')) || fromJ || fallback;
  const select = (id, { manual = true } = {}) => {
    if (manual) setFollow(false);
    setParams({ cam: id }, { replace: true });
  };

  const ranked = useMemo(() => cams.map((c) => ({ cam: c, act: cameraActivity(snap, c) })), [cams, snap]);
  const active = ranked.filter((r) => r.act.active).sort((a, b) => a.act.rank - b.act.rank);
  const topId = active[0]?.cam.id;
  useEffect(() => {
    if (follow && topId && topId !== cam?.id) setParams({ cam: topId }, { replace: true });
  }, [follow, topId, cam?.id, setParams]);
  useEffect(() => { if (!note) return undefined; const t = setTimeout(() => setNote(null), 3500); return () => clearTimeout(t); }, [note]);

  if (!snap) return null;
  if (!cams.length) {
    return (
      <EmptyState icon="video" title="No cameras configured">
        Run <code>node scripts/fetch-cctv.mjs</code> to build public/data/cameras.json, then reload this page.
      </EmptyState>
    );
  }

  const junction = jById.get(cam.junctionId);
  const act = cameraActivity(snap, cam);
  const siblings = camsByJ.get(junction.id).filter((c) => c.id !== cam.id);
  const night = isNight(snap.now);
  const activeJ = new Set(active.map((r) => r.cam.junctionId));
  // Junction groups for the wall: busiest first when following, otherwise by ID.
  const jRank = (id) => Math.min(...camsByJ.get(id).map((c) => ranked.find((r) => r.cam.id === c.id).act.rank));
  const groups = data.junctions
    .filter((j) => camsByJ.get(j.id).length && (filter === 'all' || (filter === 'active' && activeJ.has(j.id)) || (filter === 'poc' && j.poc)))
    .sort((a, b) => (follow ? jRank(a.id) - jRank(b.id) : 0) || a.id.localeCompare(b.id));

  const snapshot = () => {
    const ok = saveSnapshot(videoRef.current, cam, junction, snap);
    setNote(ok ? `Snapshot of ${cam.id} saved to your downloads.` : 'The video is not ready yet; try again in a moment.');
    if (ok) engine.log('info', `${operator.name} saved a CCTV snapshot from ${cam.id} (${junction.id})`, { kind: 'operator', junctionId: junction.id });
  };
  const fullscreen = () => {
    const el = frameRef.current;
    if (!el?.requestFullscreen) { setNote('Full screen is not available in this browser.'); return; }
    el.requestFullscreen().catch(() => setNote('Full screen was blocked by the browser.'));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="CCTV"
        subtitle={`${cams.length} cameras: one on every signalised approach of the ${camsByJ.size} junctions · ${activeJ.size} junction${activeJ.size === 1 ? '' : 's'} with EVP activity now · ${night ? 'night: IR mode' : 'daylight'}${snap.rain ? ' · raining' : ''} (twin time)`}
        actions={(
          <>
            <Tabs size="sm" tabs={[{ value: 'focus', label: 'Focus' }, { value: 'wall', label: 'Wall' }]} value={layout} onChange={setLayout} />
            <Button size="sm" variant={follow ? 'soft' : 'secondary'} icon="navigation" onClick={() => setFollow((f) => !f)} aria-pressed={follow}
              title="Switch to the camera facing the most urgent pre-emption or approaching ambulance">
              {follow ? 'Following ambulances' : 'Follow ambulances'}
            </Button>
            <Button size="sm" variant="ghost" icon="info" onClick={() => setCredits(true)}>Footage & licences</Button>
          </>
        )}
      />

      <div className="tile text-xs text-fg-muted flex items-start gap-2">
        <Icon name="info" size={14} className="shrink-0 mt-0.5 text-fg-faint" />
        <span>MBKS junction cameras are not connected to this prototype. Each camera plays openly licensed <b className="text-fg">stand-in footage</b> from fixed, elevated traffic cameras elsewhere; the time, signal, queue, EVP and weather overlays are live from the twin.</span>
      </div>

      {note && <div className="tile text-xs tone-success flex gap-2" role="status"><span className="flex-1">{note}</span><button type="button" className="link-btn" onClick={() => setNote(null)}>Dismiss</button></div>}
      {follow && !active.length && <p className="text-xs text-fg-faint">Following: no EVP activity at any junction right now; holding on {cam.id}.</p>}

      {layout === 'focus' ? (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4">
          <div className="space-y-4 min-w-0">
            <Card padded={false}>
              <div ref={frameRef} className="cctv-fs astk-fixed-dark">
                <CctvFeed ref={videoRef} size="lg" camera={cam} junction={junction} snap={snap} highlight={false} />
              </div>
              <div className="p-3 flex flex-wrap gap-2 items-center">
                <Button size="sm" variant="secondary" icon="download" onClick={snapshot}>Snapshot</Button>
                <Button size="sm" variant="secondary" icon="expand" onClick={fullscreen}>Full screen</Button>
                <Button size="sm" variant="secondary" icon="traffic" onClick={() => navigate(`/junctions/${junction.id}`)}>Junction detail</Button>
                <Button size="sm" variant="secondary" icon="map" onClick={() => navigate(`/?focus=${junction.id}`)}>Show on map</Button>
                <span className="flex-1" />
                <span className="text-[11px] text-fg-faint">
                  Footage: <a className="hover:underline" href={cam.footage?.sourceUrl} target="_blank" rel="noreferrer">{cam.footage?.author}, {cam.footage?.licence}</a>
                </span>
              </div>
            </Card>
            {siblings.length > 0 && (
              <Card title={`Other approaches at ${junction.id}`} subtitle="Select a feed to make it the main view">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {siblings.map((c) => <CctvFeed key={c.id} size="xs" camera={c} junction={junction} snap={snap} onClick={() => select(c.id)} />)}
                </div>
              </Card>
            )}
            <JunctionState cam={cam} junction={junction} act={act} navigate={navigate} />
          </div>
          <Card title="Junctions" subtitle={follow ? 'Following the most urgent camera' : 'Select a junction'} padded={false}>
            <ul className="p-2 space-y-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 230px)' }}>
              {data.junctions.map((j) => {
                const st = snap.junctions[j.id];
                const list = camsByJ.get(j.id);
                const amb = snap.trips.filter((t) => t.next?.j === j.id && !t.evpSuspended).sort((a, b) => (a.next.eta ?? 1e9) - (b.next.eta ?? 1e9))[0];
                return (
                  <li key={j.id}>
                    <button type="button" onClick={() => list.length && select((list.find((c) => c.arm === amb?.next.arm) || list[0]).id)}
                      className={`w-full text-left rounded-md px-2 py-1.5 transition-colors ${j.id === junction.id ? 'bg-primary-soft' : 'hover:bg-surface-raised'}`}>
                      <span className="flex items-center gap-2">
                        <b className="text-xs text-fg w-8">{j.id}</b>
                        <span className="text-[11px] text-fg-muted truncate flex-1">{j.name}</span>
                        <span className="text-[10px] text-fg-faint tabular-nums shrink-0">{list.length} <Icon name="video" size={10} className="inline" /></span>
                      </span>
                      {(st?.mode !== 'ADAPTIVE' || amb) && (
                        <span className="block text-[10.5px] pl-10 mt-0.5" style={{ color: toneColor(st?.mode === 'PREEMPT' ? 'primary' : 'warning') }}>
                          {st?.mode === 'PREEMPT' ? `EVP pre-emption${st.grant ? ` for ${st.grant.vehicleId}` : ''}` : st?.mode === 'RECOVERY' ? 'SCATS recovery' : ''}
                          {amb ? `${st?.mode !== 'ADAPTIVE' ? ' · ' : ''}${amb.vehicleId} from ${amb.next.arm}, ETA ${Math.round(amb.next.eta ?? 0)} s` : ''}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      ) : (
        <>
          <FilterChips options={[{ value: 'all', label: `All junctions (${camsByJ.size})` }, { value: 'active', label: `EVP activity (${activeJ.size})` }, { value: 'poc', label: 'Proof of concept' }]} value={filter} onChange={setFilter} />
          <div className="space-y-4">
            {groups.map((j) => {
              const st = snap.junctions[j.id];
              return (
                <section key={j.id} className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link to={`/junctions/${j.id}`} className="text-sm font-semibold text-fg hover:underline">{j.id} · {j.name}</Link>
                    {j.poc && <Badge tone="primary">PoC</Badge>}
                    {st && <ModeBadge mode={st.mode} recovery={st.recovery} />}
                    <span className="text-[11px] text-fg-faint">{camsByJ.get(j.id).length} cameras · queue {st?.totalQueue ?? '–'} veh</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    {camsByJ.get(j.id).map((c) => (
                      <CctvFeed key={c.id} camera={c} junction={j} snap={snap} selected={c.id === cam.id} onClick={() => { select(c.id); setLayout('focus'); }} />
                    ))}
                  </div>
                </section>
              );
            })}
            {!groups.length && (
              <Card>
                <EmptyState icon="video" title="No EVP activity right now">
                  No junction is pre-empting or has an ambulance approaching. Run the SGH demo on the <Link className="link-btn" to="/">Command Map</Link> to send one through.
                </EmptyState>
              </Card>
            )}
          </div>
        </>
      )}

      {credits && <FootageCredits clips={data.cctvClips} cameras={cams} note={data.cameraNote} onClose={() => setCredits(false)} />}
    </div>
  );
}
