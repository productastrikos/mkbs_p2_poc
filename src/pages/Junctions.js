import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Badge, PageHeader, StatGrid, StatCard, DataTable, FilterChips, ProgressBar, Icon } from '../components/ui';
import { useData, useSim } from '../data/DataProvider';
import { ModeBadge, SignalHead, fmtNum, fmtS } from '../components/evp/format';

const FILTERS = (n) => [
  { value: 'all', label: `All ${n}` },
  { value: 'active', label: 'EVP active' },
  { value: 'phase1', label: 'Rollout phase 1' },
  { value: 'poc', label: 'Proof of concept' },
];

export default function Junctions() {
  const { data, analytics } = useData();
  const snap = useSim();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [filter, setFilter] = useState(['all', 'active', 'phase1', 'poc'].includes(params.get('filter')) ? params.get('filter') : 'all');
  const n = data.junctions.length;

  const statsById = useMemo(() => Object.fromEntries(analytics.ranking.map((r) => [r.id, r])), [analytics]);
  const junctions = snap?.junctions || {};
  const active = Object.values(junctions).filter((s) => s.mode !== 'ADAPTIVE').length;
  const preemptNow = Object.values(junctions).filter((s) => s.mode === 'PREEMPT').length;
  const avgCong = Object.values(junctions).reduce((s, x) => s + x.congestion, 0) / Math.max(1, Object.keys(junctions).length);

  const rows = data.junctions
    .map((j) => ({ ...j, st: junctions[j.id], an: statsById[j.id] }))
    .filter((r) => filter === 'all'
      || (filter === 'active' && r.st && r.st.mode !== 'ADAPTIVE')
      || (filter === 'phase1' && r.an?.rank <= 8)
      || (filter === 'poc' && r.poc));

  const columns = [
    { key: 'id', header: 'ID', strong: true, render: (r) => <span>{r.id}{r.poc ? ' ★' : ''}</span> },
    { key: 'name', header: 'Junction', render: (r) => <div className="min-w-[200px]"><p className="text-fg font-medium">{r.name}</p><p className="text-[10.5px] text-fg-faint">SCATS {r.scatsSite} · {r.arms.length} arms · {r.lanes} lanes</p></div> },
    { key: 'mode', header: 'Live mode', render: (r) => (r.st ? <ModeBadge mode={r.st.mode} recovery={r.st.recovery} /> : '–') },
    {
      key: 'phase', header: 'Phase', render: (r) => (r.st ? (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <SignalHead state={r.st.stage === 'GREEN' ? 'G' : r.st.stage === 'AMBER' ? 'A' : 'R'} size={7} />
          <b className="text-fg">{r.st.phaseId}</b>
          <span className="text-fg-faint tabular-nums">{r.st.stage === 'GREEN' && r.st.held ? 'held for EVP' : r.st.stage === 'GREEN' && r.st.stageRemaining < 1 ? (r.st.ped !== 'DONT_WALK' ? 'ped. clearing' : 'ending') : `${r.st.stage === 'GREEN' ? '' : r.st.stage === 'AMBER' ? 'amber ' : 'all-red '}${Math.round(r.st.stageRemaining)} s`}</span>
        </span>
      ) : '–'),
    },
    {
      key: 'cong', header: 'Congestion', render: (r) => (r.st ? (
        <div className="w-24"><ProgressBar value={r.st.congestion * 100} tone={r.st.congestion > 0.8 ? 'danger' : r.st.congestion > 0.6 ? 'warning' : 'success'} /><p className="text-[10.5px] text-fg-faint mt-0.5 tabular-nums">{fmtNum(r.st.congestion, 2)}</p></div>
      ) : '–'),
    },
    { key: 'queue', header: 'Queue now / normal (veh)', className: 'tabular-nums whitespace-nowrap', render: (r) => (r.st ? <span>{r.st.totalQueue}<span className="text-fg-faint"> / {r.st.normalQueue ?? '–'}</span></span> : '–') },
    { key: 'crossings', header: 'Pilot crossings', className: 'tabular-nums', render: (r) => fmtNum(r.an?.crossings) },
    { key: 'wait', header: 'Avg wait: no EVP → EVP', className: 'tabular-nums whitespace-nowrap', render: (r) => (r.an?.crossings ? <span>{fmtS(r.an.avgBaseWait)} → <b className="text-fg">{fmtS(r.an.avgWait)}</b></span> : '–') },
    {
      key: 'cctv', header: 'CCTV', render: (r) => {
        const n = data.camerasByJ.get(r.id)?.length || 0;
        return n ? (
          <button type="button" className="link-btn whitespace-nowrap inline-flex items-center gap-1" title={`Watch the ${n} approach cameras at ${r.id}`}
            onClick={(e) => { e.stopPropagation(); navigate(`/cctv?j=${r.id}`); }}><Icon name="video" size={12} />{n} cameras</button>
        ) : <span className="text-fg-faint">–</span>;
      },
    },
    { key: 'rank', header: 'Rollout rank', render: (r) => (r.an ? <span className="whitespace-nowrap"><b className="text-fg">#{r.an.rank}</b> <span className="text-fg-faint text-[10.5px]">{r.an.rollout}</span></span> : '–') },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Junctions" subtitle={`${n} SCATS-controlled junctions in Kuching South with live controller state and pilot statistics`} />
      <StatGrid>
        <StatCard label="Signalised junctions" value={n} icon="traffic" subValues={[{ label: 'Proof of concept', value: data.junctions.find((j) => j.poc)?.id }, { label: 'Normal phases (avg)', value: fmtNum(data.junctions.reduce((s, j) => s + j.sequence.length, 0) / n, 1) }]} />
        <StatCard label="Under EVP control now" value={active} icon="bolt" status={active > 4 ? 'warning' : 'normal'} subValues={[{ label: 'Pre-empting', value: preemptNow }, { label: 'Recovering', value: active - preemptNow }]} />
        <StatCard label="Average congestion" value={fmtNum(avgCong, 2)} icon="gauge" status={avgCong > 0.75 ? 'warning' : 'normal'} subValues={[{ label: 'Scale', value: '0 free to 1 jammed' }]} />
        <StatCard label="Pre-empted crossings (pilot)" value={fmtNum(analytics.kpis.preempted)} icon="check" subValues={[{ label: `Of ${fmtNum(analytics.kpis.crossings)}`, value: `${fmtNum(analytics.kpis.preemptRate * 100, 1)}%` }, { label: 'Ped. protected', value: fmtNum(analytics.kpis.pedProtect) }]} />
      </StatGrid>
      <Card title="Junction register" subtitle="Select a junction for its approach cameras, phase diagram, pre-emption timeline and SCATS adapter log" padded={false}
        actions={<FilterChips options={FILTERS(n)} value={filter} onChange={setFilter} />}>
        <DataTable columns={columns} rows={rows} onRowClick={(r) => navigate(`/junctions/${r.id}`)} emptyText={filter === 'active' ? 'No junction is pre-empting or recovering right now.' : 'No junctions match this filter.'} />
      </Card>
      <p className="text-[11px] text-fg-faint">
        Junction geometry and road names: OpenStreetMap contributors. Phase plans, timings and incident counts are prototype assumptions until MBKS SCATS site data is connected. <Badge tone="neutral">★ = proof-of-concept site</Badge>
      </p>
    </div>
  );
}
