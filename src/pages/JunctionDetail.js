import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, Badge, PageHeader, Button, Field, DetailGrid, DataTable } from '../components/ui';
import ChartCard from '../components/charts/ChartCard';
import { useData, useSim } from '../data/DataProvider';
import PhaseDiagram from '../components/evp/PhaseDiagram';
import PreemptTimeline from '../components/evp/PreemptTimeline';
import { ModeBadge, SignalHead, PriorityBadge, fmtS, fmtNum, fmtTime, MOVE_ARROW, REQUEST_LABEL } from '../components/evp/format';
import { JunctionCameras } from '../components/evp/CctvFeed';
import { OVERRIDE_TEXT } from '../evp/reports';
import { MOVE_LABEL } from '../evp/junctions';

const NO_ANIM = { animation: false };

/* Every approach camera at the junction. Selecting one opens it on the CCTV page. */
function CameraCard({ junction, data, snap }) {
  const navigate = useNavigate();
  const cams = data.camerasByJ.get(junction.id) || [];
  if (!cams.length) return null;
  return (
    <Card title="Junction cameras" subtitle={`${cams.length} cameras, one on each approach · stand-in footage with live overlays from the twin`}
      actions={<Link to={`/cctv?j=${junction.id}`} className="link-btn">OPEN CCTV WALL</Link>}>
      <JunctionCameras junction={junction} cameras={cams} snap={snap} size="sm" className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-3"
        onSelect={(c) => navigate(`/cctv?cam=${c.id}`)} />
    </Card>
  );
}

function PhasePlan({ junction, current }) {
  const normal = junction.phases.filter((p) => p.kind === 'normal');
  const exclusive = junction.phases.filter((p) => p.kind === 'exclusive');
  const row = (p) => (
    <div key={p.id} className={`flex items-center gap-2 text-xs rounded-md px-2 py-1.5 ${p.id === current ? 'bg-primary-soft' : ''}`}>
      <span className="w-9 font-bold text-fg">{p.id}</span>
      <span className="flex-1 text-fg-muted">{p.label}{p.ped ? ' · ped' : ''}</span>
      <span className="text-fg-faint tabular-nums">{p.split ? `${Math.round(p.split * 100)}%` : 'EVP only'}</span>
    </div>
  );
  return (
    <div className="space-y-2">
      <div><p className="label-caps mb-1">Normal SCATS sequence</p>{normal.map(row)}</div>
      <div><p className="label-caps mb-1">EVP phases</p>{exclusive.map(row)}</div>
    </div>
  );
}

export default function JunctionDetail() {
  const { id } = useParams();
  const { data, engine, analytics, allTrips } = useData();
  const snap = useSim();
  const [pick, setPick] = useState(0);
  const junction = data.junctions.find((j) => j.id === id);
  const ctrl = engine.controllers.get(id);
  const st = snap?.junctions[id];
  const sampleCount = ctrl?.samples.length || 0;
  const lastSampleT = ctrl?.samples[sampleCount - 1]?.t;

  // Queue per approach over the last 10 minutes; recomputed only when a new 5 s sample lands.
  const queueChart = useMemo(() => {
    if (!ctrl) return null;
    const xs = ctrl.samples.slice(-120);
    const t1 = xs[xs.length - 1]?.t ?? 0;
    return {
      labels: xs.map((s) => { const d = Math.round(s.t - t1); return d === 0 ? 'now' : `${Math.floor(-d / 60)}:${String(-d % 60).padStart(2, '0')}`; }),
      datasets: junction.arms.map((a) => ({ label: `${a.id} ${a.road || ''}`.trim(), data: xs.map((s) => Math.round(s.q[a.id] * 10) / 10) })),
    };
  }, [ctrl, junction, lastSampleT]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!junction || !ctrl) {
    return <Card><p className="text-sm text-fg-muted">Unknown junction {id}. <Link className="link-btn" to="/junctions">BACK TO JUNCTIONS</Link></p></Card>;
  }

  const phase = junction.phases.find((p) => p.id === st?.phaseId);
  const approaching = snap?.trips.filter((t) => t.next?.j === id) || [];
  const lead = approaching[0];
  const an = analytics.ranking.find((r) => r.id === id);
  const records = [...(ctrl.preempt ? [{ ...ctrl.preempt, live: true }] : []), ...ctrl.history];
  const shown = records[Math.min(pick, records.length - 1)];
  const adapterLog = engine.adapter.log.filter((e) => e.junctionId === id).slice(0, 30);
  const hourly = an?.byHour || [];
  const recent = allTrips.flatMap((t) => t.junctions.filter((c) => c.j === id).map((c) => ({ ...c, key: `${t.id}-${c.dStop}`, trip: t, at: t.start + c.arrival * 1000 })))
    .sort((a, b) => b.at - a.at).slice(0, 10);

  return (
    <div className="space-y-5">
      <PageHeader
        title={<span>{junction.id} · {junction.name}{junction.poc ? <Badge tone="primary" className="ml-2 align-middle">Proof of concept</Badge> : null}</span>}
        subtitle={`SCATS site ${junction.scatsSite} · ${junction.arms.length} approaches · cycle ${junction.timing.cycleMin}–${junction.timing.cycleMax} s · amber ${junction.timing.amber} s · all-red ${junction.timing.allRed} s`}
        actions={<Link to="/junctions"><Button variant="secondary" icon="chevronRight" className="[&>svg]:rotate-180">All junctions</Button></Link>}
      />

      <CameraCard junction={junction} data={data} snap={snap} />

      <div className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-4">
        <Card title="Phase diagram" subtitle={phase ? `Phase ${phase.id}: ${phase.label}` : ''} actions={st && <ModeBadge mode={st.mode} recovery={st.recovery} />}>
          <PhaseDiagram junction={junction} phase={phase} armStates={st?.arms} predicted={lead ? { arm: lead.next.arm, move: lead.next.top } : null} ped={st?.ped} size={320} />
          <div className="grid grid-cols-2 gap-2 mt-3">
            {junction.arms.map((a) => (
              <div key={a.id} className="tile py-1.5 flex items-center gap-2">
                <SignalHead state={st?.arms[a.id] || 'R'} size={7} />
                <div className="min-w-0"><p className="text-xs font-bold text-fg">{a.id}</p><p className="text-[10.5px] text-fg-faint truncate">{a.road || 'Unnamed'} · {a.lanes} lanes</p></div>
                <span className="ml-auto text-[11px] text-fg-muted tabular-nums">{st ? Math.round(st.queues[a.id]) : '–'} veh</span>
              </div>
            ))}
          </div>
          <div className="mt-4"><PhasePlan junction={junction} current={st?.phaseId} /></div>
        </Card>

        <div className="space-y-4">
          <Card title="Live controller" subtitle="Simulated SCATS controller behind the adapter interface">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="tile"><p className="label-caps">Stage</p><p className="text-lg font-bold text-fg">{st?.stage === 'ALLRED' ? 'All-red' : st?.stage === 'AMBER' ? 'Amber' : 'Green'} · {st?.phaseId}</p><p className="text-[11px] text-fg-faint tabular-nums">{st ? `${Math.round(st.stageRemaining)} s remaining` : ''}{st?.held ? ' · held for EVP' : ''}</p></div>
              <div className="tile"><p className="label-caps">Pedestrians</p><p className="text-lg font-bold text-fg">{st?.ped === 'WALK' ? 'Walk' : st?.ped === 'CLEAR' ? 'Clearing' : "Don't walk"}</p><p className="text-[11px] text-fg-faint">{st && st.ped !== 'DONT_WALK' ? `${Math.round(st.pedRemaining)} s left` : st?.approach ? `New calls held: ${st.approach.vehicleId} approaching` : st?.pedHeld ? `${st.pedHeld} call(s) held for ambulances this session` : 'No crossing'}</p></div>
              <div className="tile"><p className="label-caps">Queue</p><p className="text-lg font-bold text-fg tabular-nums">{st?.totalQueue} veh</p><p className="text-[11px] text-fg-faint">normal ≈ {st?.normalQueue ?? '–'} veh</p></div>
              <div className="tile"><p className="label-caps">Congestion</p><p className="text-lg font-bold text-fg tabular-nums">{fmtNum(st?.congestion, 2)}</p><p className="text-[11px] text-fg-faint">profile + live demand</p></div>
            </div>
            {approaching.length > 0 ? (
              <div className="mt-3 space-y-2">
                {approaching.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 flex-wrap text-xs tile">
                    <b className="text-fg">{t.vehicleId}</b><PriorityBadge priority={t.priority} />
                    <span className="text-fg-muted">from {t.next.arm} · predicted {MOVE_ARROW[t.next.top]} {MOVE_LABEL[t.next.top]} (P {t.next.topP?.toFixed(2)})</span>
                    <span className="flex-1" />
                    <span className="text-fg tabular-nums">{Math.round(t.next.dist)} m · ETA {t.next.eta != null ? `${Math.round(t.next.eta)} s (${Math.round(t.next.lo)}–${Math.round(t.next.hi)})` : '–'}</span>
                    <Badge tone={t.evpSuspended ? 'danger' : t.next.request === 'GREEN' ? 'success' : t.next.request === 'YIELDING' ? 'warning' : t.next.request === 'BLOCKED' ? 'danger' : t.next.request ? 'primary' : 'neutral'}>{t.evpSuspended ? 'EVP suspended' : REQUEST_LABEL[t.next.request] || (t.next.triggerAt != null ? `Requests at ETA ≤ ${Math.round(t.next.triggerAt)} s` : 'Awaiting prediction')}</Badge>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-fg-faint mt-3">No ambulance approaching.</p>}
          </Card>

          <Card title="Pre-emption timeline" subtitle="Request → safe-to-switch → amber → all-red → green hold → release → SCATS recovery"
            actions={records.length > 1 && (
              <select className="select select-sm" value={pick} onChange={(e) => setPick(Number(e.target.value))} aria-label="Choose pre-emption">
                {records.map((r, i) => <option key={r.requestId} value={i}>{r.live ? 'Live · ' : ''}{r.vehicleId} · {fmtTime(snap.now - (snap.t - r.timeline.requestedAt) * 1000)}</option>)}
              </select>
            )}>
            {shown ? <PreemptTimeline p={shown} now={snap.t} live={Boolean(shown.live)} /> : <p className="text-xs text-fg-faint">No pre-emption at this junction since the simulation started. Run the "SGH run" scenario on the Command Map.</p>}
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {queueChart && <ChartCard title="Queue by approach" subtitle="Vehicles queued per arm, last 10 minutes (5 s samples). Pre-emption builds queues on the other arms; recovery drains them." type="line" data={queueChart} legend height={220} options={NO_ANIM} />}
        <Card title="SCATS adapter log" subtitle="Calls through the adapter interface: notifyApproach, requestPhase, holdPhase, release" padded={false}>
          <div className="overflow-auto" style={{ maxHeight: 262 }}>
            <table className="table">
              <thead><tr><th>Time</th><th>Call</th><th>Detail</th><th>Result</th></tr></thead>
              <tbody>
                {adapterLog.map((e, i) => (
                  <tr key={i}>
                    <td className="tabular-nums whitespace-nowrap">{fmtTime(snap.now - (snap.t - e.t) * 1000)}</td>
                    <td className="cell-mono">{e.call}</td>
                    <td className="text-fg-muted">{e.detail}</td>
                    <td>{e.ok ? <Badge tone="success">ok</Badge> : <Badge tone="danger">{e.message || 'refused'}</Badge>}</td>
                  </tr>
                ))}
                {!adapterLog.length && <tr><td colSpan={4} className="table-empty">No adapter calls for this junction yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
        <ChartCard title="No-EVP wait by hour of day" subtitle={`Average red-light wait an ambulance would have had here without EVP, from ${an?.crossings ?? 0} pilot crossings (local time; gaps = no crossings that hour)`}
          type="bar" height={200}
          data={{ labels: hourly.map((_, h) => `${String(h).padStart(2, '0')}h`), datasets: [{ label: 'Avg no-EVP wait (s)', data: hourly.map((x) => x ?? null), color: 'chart-1' }] }} />
        <Card title="Pilot statistics">
          {an ? (
            <div className="space-y-2">
              <Field label="EVP crossings (history + live)">{fmtNum(an.crossings)}</Field>
              <Field label="Avg wait without EVP">{fmtS(an.avgBaseWait)}</Field>
              <Field label="Avg wait with EVP">{fmtS(an.avgWait)}</Field>
              <Field label="Total time saved">{fmtNum(an.savedMin, 0)} min</Field>
              <Field label="Pre-empted">{an.preempted} of {an.crossings} ({fmtNum(an.preemptRate * 100, 0)}%)</Field>
              <Field label="Mean green lead (pre-empted)">{fmtS(an.avgGreenLead)}</Field>
              <Field label="Stop-line phase corrections">{an.phaseCorrections}</Field>
              <Field label="Pedestrian protections">{an.pedProtect}</Field>
              <Field label="ETA error (MAE)">{an.etaMae ? `${fmtNum(an.etaMae, 1)} s` : '–'}</Field>
              <div className="border-t pt-2 mt-2" />
              <DetailGrid columns={3} items={[
                { label: 'Collisions', value: an.incidents.ambulanceCollisions },
                { label: 'Near misses', value: an.incidents.nearMisses },
                { label: 'Red-light', value: an.incidents.redLightCrossings },
              ]} />
              <p className="text-xs text-fg-muted pt-1">Rollout rank <b className="text-fg">#{an.rank}</b> of 22 ({an.rollout}): delay score {fmtNum(an.delayScore, 2)}, risk score {fmtNum(an.riskScore, 2)}.</p>
            </div>
          ) : <p className="text-xs text-fg-faint">No statistics.</p>}
        </Card>
      </div>

      <Card title="Recent ambulance crossings" subtitle="Most recent first (live trips from this session, then the pilot history). Wait is time stopped within 80 m of the stop line." padded={false}>
        <DataTable rowKey="key" rows={recent} emptyText="No ambulance has crossed this junction yet."
          columns={[
            { key: 'trip', header: 'Trip', strong: true, render: (c) => <Link className="hover:underline whitespace-nowrap" to={`/assistant?trip=${c.trip.id}`}>{c.trip.id}{c.trip.source === 'live' ? ' · live' : ''}</Link> },
            { key: 'unit', header: 'Unit', render: (c) => <span className="whitespace-nowrap">{c.trip.ambulanceId} <PriorityBadge priority={c.trip.priority} /></span> },
            { key: 'move', header: 'Movement', render: (c) => `${MOVE_ARROW[c.move]} ${MOVE_LABEL[c.move]} from ${c.arm}` },
            { key: 'phase', header: 'Phase', render: (c) => (c.phase ? <span>{c.phase}{c.preempted ? '' : <span className="text-fg-faint"> (not pre-empted)</span>}</span> : <span className="text-fg-faint">none</span>) },
            { key: 'lead', header: 'Green vs arrival', className: 'tabular-nums', render: (c) => (c.greenLead == null ? '–' : c.greenLead >= 0 ? `${c.greenLead} s before` : `${Math.abs(c.greenLead)} s after`) },
            { key: 'wait', header: 'Wait: EVP / no EVP', className: 'tabular-nums whitespace-nowrap', render: (c) => <span><b className="text-fg">{fmtS(c.wait)}</b> / {fmtS(c.baseWait)}</span> },
            { key: 'note', header: 'Note', render: (c) => <span className="text-fg-muted text-[11px]">{[c.override && (OVERRIDE_TEXT[c.override] || c.override), c.yieldTo && `yielded to ${c.yieldTo}`, c.priorityOver && `priority over ${c.priorityOver}`, c.pedProtect ? `waited ${c.pedProtect} s for pedestrians` : null].filter(Boolean).join('; ') || '–'}</span> },
          ]} />
      </Card>
    </div>
  );
}
