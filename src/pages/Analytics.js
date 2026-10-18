import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Badge, PageHeader, StatGrid, StatCard, Tabs, Button, DataTable, Field, ProgressBar } from '../components/ui';
import ChartCard from '../components/charts/ChartCard';
import { useData } from '../data/DataProvider';
import { DEFAULT_ASSUMPTIONS } from '../evp/analytics';
import { PriorityBadge, fmtS, fmtNum, fmtRM, fmtPct, fmtDate } from '../components/evp/format';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'junctions', label: 'Junctions & rollout' },
  { value: 'cost', label: 'Cost / benefit' },
  { value: 'models', label: 'Models & learning' },
];

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortMonth = (key) => { const [y, m] = key.split('-'); return `${SHORT_MONTHS[+m - 1]} ${y.slice(2)}`; };
const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/* ─── Overview ─────────────────────────────────────────────── */
function Overview({ an, allTrips }) {
  const k = an.kpis;
  const [showAll, setShowAll] = useState(false);
  const trips = showAll ? allTrips.slice(0, 200) : allTrips.slice(0, 12);
  const columns = [
    { key: 'id', header: 'Trip', strong: true, render: (t) => <span className="whitespace-nowrap">{t.id}{t.source === 'live' ? <Badge tone="primary" className="ml-1.5">Live</Badge> : null}</span> },
    { key: 'start', header: 'Start', render: (t) => <span className="whitespace-nowrap">{fmtDate(t.start)}</span> },
    { key: 'amb', header: 'Ambulance', render: (t) => t.ambulanceId },
    { key: 'dest', header: 'Destination', render: (t) => <span className="whitespace-nowrap">{t.destinationName}</span> },
    { key: 'priority', header: 'Priority', render: (t) => <PriorityBadge priority={t.priority} /> },
    { key: 'j', header: 'Junctions', className: 'tabular-nums', render: (t) => `${t.junctions.filter((c) => c.preempted).length}/${t.junctions.length}` },
    { key: 'dur', header: 'With EVP', className: 'tabular-nums whitespace-nowrap', render: (t) => fmtS(t.duration) },
    { key: 'base', header: 'No-EVP baseline', className: 'tabular-nums whitespace-nowrap', render: (t) => fmtS(t.baseline) },
    { key: 'saved', header: 'Saved', className: 'tabular-nums', render: (t) => <b className="text-fg">{Math.round(t.saved)} s</b> },
    { key: 'r', header: '', render: (t) => <Link className="link-btn" to={`/assistant?trip=${t.id}`}>REPORT</Link> },
  ];
  return (
    <div className="space-y-4">
      <StatGrid>
        <StatCard label="Avg time saved per trip" value={fmtNum(k.avgSavedS, 0)} unit="s" icon="clock"
          subValues={[{ label: 'Trip with EVP', value: fmtS(k.avgDurationS) }, { label: 'Without', value: fmtS(k.avgBaselineS) }]} />
        <StatCard label="Trips analysed" value={fmtNum(k.trips)} icon="ambulance"
          subValues={[{ label: 'Live this session', value: k.liveTrips }, { label: 'Hours saved', value: fmtNum(k.totalSavedS / 3600, 1) }]} />
        <StatCard label="Conflicting movements avoided" value={fmtNum(k.conflictsAvoided)} icon="shield"
          subValues={[{ label: 'Priority conflicts', value: k.priorityConflicts }, { label: 'Ped. protected', value: k.pedProtect }]} />
        <StatCard label="Fuel & idle saved" value={fmtNum(k.fuelSavedL, 0)} unit="L" icon="leaf"
          subValues={[{ label: 'Idle hours', value: fmtNum(k.idleSavedH, 1) }, { label: 'CO₂', value: `${fmtNum(k.co2Kg, 0)} kg` }]} />
      </StatGrid>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="Average trip time: before / after EVP" subtitle="Same trips, same traffic: actual time with EVP versus the no-EVP baseline from the shadow SCATS controller (minutes)"
          type="line" legend height={230}
          data={{
            labels: an.monthly.map((m) => shortMonth(m.month)),
            datasets: [
              { label: 'No-EVP baseline', data: an.monthly.map((m) => Math.round((m.avgBaseline / 60) * 10) / 10), color: 'chart-2' },
              { label: 'With EVP', data: an.monthly.map((m) => Math.round((m.avgDuration / 60) * 10) / 10), color: 'chart-1' },
            ],
          }} />
        <ChartCard title="Seconds saved per trip" subtitle="Distribution of time saved across all trips" type="bar" height={230}
          data={{ labels: an.savedHistogram.map((b) => `${b.label} s`), datasets: [{ label: 'Trips', data: an.savedHistogram.map((b) => b.count), color: 'chart-1' }] }} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
        <ChartCard title="Time saved by destination hospital" subtitle="Average seconds saved per trip to each hospital" type="bar" height={200}
          data={{ labels: an.byHospital.map((h) => h.id), datasets: [{ label: 'Avg seconds saved', data: an.byHospital.map((h) => h.avgSaved), color: 'chart-1' }] }} />
        <Card title="By patient priority">
          <div className="space-y-3">
            {an.byPriority.map((p) => (
              <div key={p.priority}>
                <div className="flex items-center justify-between text-xs mb-1"><PriorityBadge priority={p.priority} /><span className="text-fg-muted tabular-nums">{p.trips} trips · <b className="text-fg">{p.avgSaved} s</b> saved</span></div>
                <ProgressBar value={p.avgSaved} max={Math.max(...an.byPriority.map((x) => x.avgSaved), 1)} />
              </div>
            ))}
            <div className="border-t pt-3 space-y-1.5">
              <Field label="Junction crossings">{fmtNum(k.crossings)}</Field>
              <Field label="Pre-empted">{fmtPct(k.preemptRate, 1)}</Field>
              <Field label="Mean green lead before arrival">{fmtS(k.avgGreenLead)}</Field>
              <Field label="Safety overrides (max hold, cancel)">{k.overrides}</Field>
            </div>
          </div>
        </Card>
      </div>
      <Card title="Trips" subtitle="Seconds saved per trip, newest first. Live trips from this session are included and feed model retraining." padded={false}
        actions={<Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show fewer' : 'Show 200'}</Button>}>
        <DataTable columns={columns} rows={trips} />
      </Card>
    </div>
  );
}

/* ─── Junction heatmap + rollout ranking ───────────────────── */
function Heatmap({ ranking }) {
  const max = Math.max(1, ...ranking.flatMap((r) => r.byHour.filter((x) => x != null)));
  const shade = (v) => (v == null ? 'transparent' : `rgba(var(--chart-seq-rgb), ${(0.08 + 0.92 * (v / max)).toFixed(3)})`);
  return (
    <Card title="Junction delay heatmap" subtitle="Average red-light wait an ambulance would face without EVP, by junction and hour of day. Stronger colour = longer wait. Rows in rollout-rank order.">
      <div className="overflow-x-auto">
        <div style={{ minWidth: 640 }}>
          <div className="grid items-center gap-[2px]" style={{ gridTemplateColumns: '150px repeat(24, minmax(0, 1fr))' }}>
            <span />
            {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-[9px] text-fg-faint text-center">{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>)}
            {ranking.map((r) => (
              <React.Fragment key={r.id}>
                <span className="text-[11px] text-fg-muted truncate pr-2" title={r.name}><b className="text-fg">{r.id}</b> {r.name.split(' / ')[0]}</span>
                {r.byHour.map((v, h) => (
                  <span key={h} className="heat-cell" tabIndex={0} style={{ background: shade(v), outline: v == null ? '1px dashed var(--color-border)' : undefined, outlineOffset: -1 }}
                    title={`${r.id} ${String(h).padStart(2, '0')}:00: ${v == null ? 'no crossings' : `${Math.round(v)} s avg wait (${r.byHourN[h]} crossings)`}`}
                    aria-label={`${r.id} ${h}:00 ${v == null ? 'no data' : `${Math.round(v)} seconds`}`} />
                ))}
              </React.Fragment>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3 text-[10px] text-fg-faint">
            <span>0 s</span>
            <span className="h-2 w-40 rounded" style={{ background: 'linear-gradient(90deg, rgba(var(--chart-seq-rgb),0.08), rgba(var(--chart-seq-rgb),1))' }} />
            <span>{Math.round(max)} s avg wait</span>
            <span className="ml-3 inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ outline: '1px dashed var(--color-border)', outlineOffset: -1 }} />no crossings in that hour</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Rollout({ an }) {
  const columns = [
    { key: 'rank', header: '#', strong: true, render: (r) => r.rank },
    { key: 'name', header: 'Junction', render: (r) => <Link to={`/junctions/${r.id}`} className="block min-w-[200px]"><span className="text-fg font-medium">{r.id} · {r.name}</span>{r.poc ? <Badge tone="primary" className="ml-1.5">PoC</Badge> : null}</Link> },
    { key: 'phase', header: 'Rollout', render: (r) => <Badge tone={r.rank <= 8 ? 'primary' : r.rank <= 16 ? 'info' : 'neutral'}>{r.rollout}</Badge> },
    { key: 'delay', header: 'Delay score', render: (r) => <div className="w-24"><ProgressBar value={r.delayScore * 100} tone="primary" /><span className="text-[10.5px] text-fg-faint tabular-nums">{fmtNum(r.delayScore, 2)} · {fmtS(r.avgBaseWait)} × {fmtNum(r.perMonth, 0)}/mo</span></div> },
    { key: 'risk', header: 'Collision risk', render: (r) => <div className="w-24"><ProgressBar value={r.riskScore * 100} tone="warning" /><span className="text-[10.5px] text-fg-faint tabular-nums">{fmtNum(r.riskScore, 2)}</span></div> },
    { key: 'inc', header: 'Collisions / near misses / red-light', className: 'tabular-nums', render: (r) => `${r.incidents.ambulanceCollisions} / ${r.incidents.nearMisses} / ${r.incidents.redLightCrossings}` },
    { key: 'score', header: 'Score', className: 'tabular-nums', render: (r) => <b className="text-fg">{fmtNum(r.score, 2)}</b> },
  ];
  return (
    <div className="space-y-4">
      <Heatmap ranking={an.ranking} />
      <Card title="22-junction rollout priority" subtitle="Score = 0.55 × delay exposure (no-EVP wait × ambulance crossings per month) + 0.45 × collision risk (incidents weighted by red-light exposure, congestion and junction size). Phase 1 = top 8."
        padded={false}>
        <DataTable columns={columns} rows={an.ranking} />
      </Card>
    </div>
  );
}

/* ─── Cost / benefit ───────────────────────────────────────── */
const ASSUMPTION_FIELDS = [
  { key: 'evpTripsPerYear', label: 'EVP trips per year', step: 1000, hint: '20 ambulances × 4 trips/day' },
  { key: 'collisionsPerYear', label: 'Ambulance junction collisions / yr', step: 0.1, hint: '5 reported since 2021, plus unreported' },
  { key: 'collisionReduction', label: 'Share of collisions avoided', step: 0.05, hint: '0–1' },
  { key: 'costPerCollisionRM', label: 'Cost per collision (RM)', step: 10000, hint: 'Vehicle > RM200k + downtime + liability' },
  { key: 'ambulanceHourValueRM', label: 'Value of an ambulance-hour (RM)', step: 10 },
  { key: 'dieselRMPerL', label: 'Diesel (RM/L)', step: 0.05 },
];

function CostBenefit({ an, assumptions, setAssumptions }) {
  const cb = an.costBenefit;
  const b = cb.benefitYear;
  const last = cb.rows[cb.rows.length - 1];
  const set = (k, v) => setAssumptions({ ...assumptions, [k]: Number(v) });
  return (
    <div className="space-y-4">
      <StatGrid>
        <StatCard label="Programme budget 2027–2030" value={fmtRM(cb.budget.totalRM)} icon="dollar"
          subValues={[{ label: 'Capex 2027', value: fmtRM(cb.budget.capexRM) }, { label: 'Maintenance', value: `${fmtRM(cb.budget.maintenancePerYearRM)}/yr × 4` }]} />
        <StatCard label="Benefit per year (full rollout)" value={fmtRM(b.totalRM)} icon="trendUp"
          subValues={[{ label: 'Collisions', value: fmtRM(b.collisionsRM) }, { label: 'Fleet time', value: fmtRM(b.fleetTimeRM) }, { label: 'Fuel', value: fmtRM(b.fuelRM) }]} />
        <StatCard label="Cumulative benefit by 2030" value={fmtRM(last.cumBenefit)} icon="barChart" status={last.cumBenefit >= last.cumCost ? 'normal' : 'warning'}
          subValues={[{ label: 'vs spend', value: fmtRM(last.cumCost) }, { label: 'Ratio', value: `${fmtNum(cb.roi, 2)}×` }]} />
        <StatCard label="Payback year" value={cb.payback || 'After 2030'} icon="calendar"
          subValues={[{ label: 'Ambulance-hours saved/yr', value: fmtNum(cb.hoursSavedYear, 0) }]} />
      </StatGrid>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-4">
        <ChartCard title="Cumulative cost and benefit vs RM2.0M budget" subtitle="Benefits ramp with the phased rollout: 8 junctions in 2027, 16 in 2028, all 22 from 2029 (RM million)"
          type="line" legend height={260}
          thresholds={[{ value: cb.budget.totalRM / 1e6, tone: 'danger', label: 'Budget RM2.0M', description: 'RM1.1M capex + RM0.9M maintenance (RM225k/yr)' }]}
          data={{
            labels: cb.rows.map((r) => String(r.year)),
            datasets: [
              { label: 'Cumulative spend', data: cb.rows.map((r) => Math.round(r.cumCost / 1e4) / 100), color: 'chart-2' },
              { label: 'Cumulative benefit', data: cb.rows.map((r) => Math.round(r.cumBenefit / 1e4) / 100), color: 'chart-1' },
            ],
          }} />
        <Card title="Assumptions" subtitle="Edit to test sensitivity. Time saved per trip comes from the measured pilot data."
          actions={<Button size="sm" variant="ghost" icon="refresh" onClick={() => setAssumptions(DEFAULT_ASSUMPTIONS)}>Reset</Button>}>
          <div className="space-y-2.5">
            <Field label="Measured time saved per trip">{fmtS(an.kpis.avgSavedS)}</Field>
            {ASSUMPTION_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="label-caps field-label">{f.label}</span>
                <input className="input" type="number" step={f.step} min={0} value={assumptions[f.key]} onChange={(e) => set(f.key, e.target.value)} />
                {f.hint && <span className="text-[10.5px] text-fg-faint">{f.hint}</span>}
              </label>
            ))}
          </div>
        </Card>
      </div>
      <p className="text-[11px] text-fg-faint">Benefits are indicative and exclude the clinical value of faster arrival (patient outcomes), which is not monetised here.</p>
    </div>
  );
}

/* ─── Models & learning ────────────────────────────────────── */
function Models({ modelInfo, modelLog, liveAccuracy, training, history }) {
  const eta = modelInfo.eta;
  const mv = modelInfo.movement;
  const an = modelInfo.anomaly;
  const v0Mae = useMemo(() => avg(history.flatMap((t) => t.junctions.map((c) => c.etaMae)).filter((x) => x != null)), [history]);
  const imp = eta.importance.filter((f) => f.value > 0.001);
  const impTotal = imp.reduce((s, f) => s + f.value, 0) || 1;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Junction ETA model" subtitle="Gradient-boosted regression trees + error model for the confidence band" actions={<Badge tone="primary">v{eta.version}</Badge>}>
          <div className="space-y-1.5">
            <Field label="Hold-out MAE">{eta.mae} s</Field>
            <Field label="v0 physics heuristic MAE (history)">{v0Mae != null ? `${fmtNum(v0Mae, 1)} s` : '–'}</Field>
            <Field label="Training samples">{fmtNum(eta.samples)} from {fmtNum(eta.trips)} trips</Field>
            <Field label="Confidence band">80% (k = {eta.k})</Field>
            <Field label="Re-prediction">every 2 s per upcoming junction</Field>
            <Field label="Trained in">{fmtNum(eta.trainMs)} ms (in browser)</Field>
          </div>
        </Card>
        <Card title="Movement model" subtitle="Softmax regression: Left / Straight / Right / U-turn" actions={<Badge tone="primary">v{mv.version}</Badge>}>
          <div className="space-y-1.5">
            <Field label="Hold-out accuracy">{fmtPct(mv.accuracy, 1)}</Field>
            <Field label="Mean confidence">{fmtNum(mv.meanConfidence, 2)}</Field>
            <Field label="Below 0.8 threshold">{fmtPct(mv.lowConfidenceShare, 1)} (covering phase used)</Field>
            <Field label="Log loss">{fmtNum(mv.logLoss, 3)}</Field>
            <Field label="Training samples">{fmtNum(mv.samples)}</Field>
          </div>
        </Card>
        <Card title="GPS anomaly model" subtitle="Isolation forest on speed, jump, heading and road-distance features" actions={<Badge tone="neutral">fixed</Badge>}>
          <div className="space-y-1.5">
            <Field label="Training fixes">{fmtNum(an.samples)}</Field>
            <Field label="Alert threshold">score ≥ {an.threshold}</Field>
            <Field label="Rules alongside">&gt; 150 km/h jump, &gt; 60 m off-road, no patient status, requests outside trip</Field>
          </div>
        </Card>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="ETA feature importance" subtitle="Share of squared-error reduction contributed by each feature across all trees" type="bar" height={260}
          options={{ indexAxis: 'y' }}
          data={{ labels: imp.map((f) => f.label), datasets: [{ label: 'Importance (%)', data: imp.map((f) => Math.round((f.value / impTotal) * 1000) / 10), color: 'chart-1' }] }} />
        <ChartCard title="ETA error by horizon" subtitle="Mean absolute error on held-out trips, by how far ahead the prediction was made" type="bar" height={260}
          data={{ labels: eta.byHorizon.map((h) => h.range), datasets: [{ label: 'MAE (s)', data: eta.byHorizon.map((h) => (h.mae == null ? null : Math.round(h.mae * 10) / 10)), color: 'chart-1' }] }} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-4">
        <Card title="Live ETA accuracy" subtitle="Predicted vs actual arrival on trips completed this session">
          {liveAccuracy.n ? (
            <div className="space-y-2">
              <Field label="Predictions checked">{fmtNum(liveAccuracy.n)}</Field>
              <Field label="MAE">{liveAccuracy.mae} s</Field>
              <Field label="Inside 80% band">{fmtPct(liveAccuracy.coverage, 0)}</Field>
              <table className="table mt-2">
                <thead><tr><th>Actual time to arrival</th><th>MAE</th><th>In band</th><th>n</th></tr></thead>
                <tbody>{liveAccuracy.buckets.map((b) => <tr key={b.range}><td>{b.range}</td><td className="tabular-nums">{b.mae ?? '–'}</td><td className="tabular-nums">{fmtPct(b.coverage)}</td><td className="tabular-nums">{b.n}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <p className="text-xs text-fg-faint">Complete a trip (e.g. the SGH run scenario) to compare predicted with actual ETAs.</p>}
        </Card>
        <Card title="Learning log" subtitle="After each completed trip, actual vs predicted ETA is recorded and both models are retrained on history + live trips"
          actions={training ? <Badge tone="warning" dot>Retraining…</Badge> : <Badge tone="success" dot>Up to date</Badge>} padded={false}>
          <DataTable rowKey="at" emptyText="No retraining yet: it runs automatically when a live trip completes."
            rows={modelLog}
            columns={[
              { key: 'at', header: 'When', render: (r) => new Date(r.at).toLocaleTimeString('en-MY', { hour12: false }) },
              { key: 'trigger', header: 'Triggered by', strong: true, render: (r) => r.trigger },
              { key: 'trip', header: 'Trip ETA error', className: 'tabular-nums', render: (r) => (r.tripEtaMae != null ? `${r.tripEtaMae} s` : '–') },
              { key: 'eta', header: 'ETA model', className: 'tabular-nums whitespace-nowrap', render: (r) => `v${r.eta.version}: ${r.eta.before} → ${r.eta.mae} s` },
              { key: 'mv', header: 'Movement model', className: 'tabular-nums whitespace-nowrap', render: (r) => `v${r.movement.version}: ${fmtPct(r.movement.before, 1)} → ${fmtPct(r.movement.accuracy, 1)}` },
              { key: 'n', header: 'Samples', className: 'tabular-nums', render: (r) => fmtNum(r.eta.samples) },
            ]} />
        </Card>
      </div>
    </div>
  );
}

export default function Analytics() {
  const { analytics, allTrips, assumptions, setAssumptions, modelInfo, modelLog, liveAccuracy, training, history } = useData();
  const [tab, setTab] = useState('overview');
  return (
    <div className="space-y-5">
      <PageHeader title="Corridor Analytics" subtitle="Time saved against the no-EVP baseline, junction delay and rollout priority, cost/benefit and model learning"
        actions={<Tabs tabs={TABS} value={tab} onChange={setTab} />} />
      {tab === 'overview' && <Overview an={analytics} allTrips={allTrips} />}
      {tab === 'junctions' && <Rollout an={analytics} />}
      {tab === 'cost' && <CostBenefit an={analytics} assumptions={assumptions} setAssumptions={setAssumptions} />}
      {tab === 'models' && <Models modelInfo={modelInfo} modelLog={modelLog} liveAccuracy={liveAccuracy} training={training} history={history} />}
    </div>
  );
}
