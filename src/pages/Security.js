import React, { useState } from 'react';
import { Card, Badge, PageHeader, StatGrid, StatCard, Button, IconButton, DataTable, FilterChips, Field, Drawer, DetailGrid } from '../components/ui';
import { useData, useSim } from '../data/DataProvider';
import { RULES, ALERT_TYPES } from '../evp/engine/guard';
import { fmtTime, fmtNum } from '../components/evp/format';
import { ANOMALY_FEATURES } from '../evp/ml/models';

const STATUS_TONE = { open: 'danger', acknowledged: 'warning', resolved: 'success' };
const FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'all', label: 'All' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'resolved', label: 'Resolved' },
];
const DEMOS = ['spoof', 'unregistered', 'misuse', 'nostatus'];

export default function Security() {
  const { data, engine, runScenario, modelInfo } = useData();
  const snap = useSim();
  const [filter, setFilter] = useState('open');
  const [selected, setSelected] = useState(null);
  const [demoMsg, setDemoMsg] = useState(null);

  const alerts = snap?.alerts || [];
  const shown = alerts.filter((a) => filter === 'all' || a.status === filter);
  const open = alerts.filter((a) => a.status === 'open');
  const quarantined = snap?.quarantined || [];
  const byType = alerts.reduce((m, a) => { m[a.type] = (m[a.type] || 0) + 1; return m; }, {});
  const clock = (t) => fmtTime(snap.now - (snap.t - t) * 1000);
  const sel = selected && alerts.find((a) => a.id === selected);

  const runDemo = (id) => {
    const res = runScenario(id);
    setDemoMsg(res);
    setFilter('open');
  };

  const columns = [
    { key: 't', header: 'Time', className: 'tabular-nums whitespace-nowrap', render: (a) => clock(a.t) },
    {
      key: 'type', header: 'Alert', render: (a) => (
        <div className="min-w-[190px]">
          <p className="flex items-center gap-2"><Badge tone={a.severity} dot>{a.severity === 'danger' ? 'High' : 'Medium'}</Badge><span className="text-fg font-medium">{a.type}</span></p>
          <p className="text-[10.5px] text-fg-faint mt-1">{a.vehicleId || 'Unregistered'} · {a.obuId}{a.plate ? ` · ${a.plate}` : ''}</p>
        </div>
      ),
    },
    { key: 'detail', header: 'Detail and action', render: (a) => <div className="min-w-[240px]"><p className="text-fg-muted">{a.detail}</p><p className="mt-1"><Badge tone="neutral">{a.action}</Badge></p></div> },
    { key: 'score', header: 'AI score', className: 'tabular-nums', render: (a) => (a.score != null ? <span className={a.score >= modelInfo.anomaly.threshold ? 'text-danger font-semibold' : ''}>{a.score.toFixed(2)}</span> : '–') },
    { key: 'status', header: 'Status', render: (a) => <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge> },
    {
      key: 'ops', header: '', render: (a) => (
        <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
          {a.status === 'open' && <IconButton icon="check" label="Acknowledge alert" onClick={() => engine.acknowledge(a.id)} />}
          {a.vehicleId && quarantined.includes(a.vehicleId) && <IconButton icon="refresh" label={`Reinstate ${a.vehicleId}`} onClick={() => engine.reinstate(a.vehicleId)} />}
        </div>
      ),
    },
  ];

  const registry = data.ambulances.map((a) => {
    const v = snap?.vehicles.find((x) => x.id === a.id);
    return { ...a, v, q: quarantined.includes(a.id), alerts: alerts.filter((x) => x.vehicleId === a.id).length };
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Alerts & Security" subtitle="Authorisation and anomaly guard: only registered ambulances on an active trip with a patient status can request a green" />
      <StatGrid>
        <StatCard label="Open alerts" value={open.length} icon="alert" status={open.some((a) => a.severity === 'danger') ? 'critical' : open.length ? 'warning' : 'normal'}
          subValues={[{ label: 'Total this session', value: alerts.length }]} />
        <StatCard label="Quarantined units" value={quarantined.length} icon="lock" status={quarantined.length ? 'warning' : 'normal'}
          subValues={[{ label: 'Units', value: quarantined.join(', ') || 'None' }]} />
        <StatCard label="Requests blocked" value={fmtNum(alerts.filter((a) => /block/i.test(a.action)).length + (snap?.stats.blocked ?? 0))} icon="shield"
          subValues={[{ label: 'Greens granted', value: fmtNum(snap?.stats.greens ?? 0) }]} />
        <StatCard label="Registered ambulances" value={data.ambulances.length} icon="ambulance"
          subValues={[{ label: 'On a trip now', value: snap?.trips.length ?? 0 }]} />
      </StatGrid>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4">
        <Card title="Alert queue" subtitle="Select an alert for the evidence and anomaly features" padded={false}
          actions={<FilterChips options={FILTERS} value={filter} onChange={setFilter} />}>
          <DataTable columns={columns} rows={shown} onRowClick={(a) => setSelected(a.id)} emptyText={filter === 'open' ? 'No open alerts. Use the demo buttons to test the guard.' : 'No alerts.'} />
        </Card>
        <div className="space-y-4">
          <Card title="Test the guard" subtitle="Each demo injects a real event into the running simulation">
            <div className="grid grid-cols-1 gap-2">
              {DEMOS.map((id) => {
                const label = { spoof: 'Spoofed GPS jump (> 150 km/h)', unregistered: 'Unregistered vehicle requests green', misuse: 'Repeated requests outside a trip', nostatus: 'Trip with no patient status' }[id];
                return <Button key={id} variant="secondary" icon={{ spoof: 'shield', unregistered: 'truck', misuse: 'bell', nostatus: 'user' }[id]} onClick={() => runDemo(id)}>{label}</Button>;
              })}
            </div>
            {demoMsg && <p className={`tile text-xs mt-3 ${demoMsg.ok ? 'tone-info' : 'tone-warning'}`}>{demoMsg.message}</p>}
          </Card>
          <Card title="Guard rules">
            <div className="space-y-1.5">
              <Field label="Registry check">OBU ID in MBKS register</Field>
              <Field label="Active trip">START pressed on tablet</Field>
              <Field label="Patient status">To patient / To hospital</Field>
              <Field label="Impossible jump">&gt; {RULES.maxSpeedKmh} km/h implied</Field>
              <Field label="Off road">&gt; {RULES.offRoadM} m from network</Field>
              <Field label="Outside-trip requests">{RULES.outsideTripLimit} in {RULES.outsideTripWindowS / 60} min</Field>
              <Field label="AI anomaly (isolation forest)">score ≥ {modelInfo.anomaly.threshold}</Field>
            </div>
            <p className="text-[11px] text-fg-faint mt-3">Spoofing and off-road fixes quarantine the unit: its pending requests are cancelled and the junction returns to SCATS. An operator must reinstate it.</p>
          </Card>
          {Object.keys(byType).length > 0 && (
            <Card title="Alerts by type">
              <div className="space-y-1.5">{Object.values(ALERT_TYPES).filter((t) => byType[t]).map((t) => <Field key={t} label={t}>{byType[t]}</Field>)}</div>
            </Card>
          )}
        </div>
      </div>

      <Card title="Ambulance registry" subtitle="20 registered units with on-board units (OBU) authorised for EVP" padded={false}>
        <DataTable rows={registry} columns={[
          { key: 'id', header: 'Unit', strong: true },
          { key: 'callsign', header: 'Call sign' },
          { key: 'plate', header: 'Plate', mono: true },
          { key: 'obuId', header: 'OBU', mono: true },
          { key: 'operator', header: 'Operator' },
          { key: 'type', header: 'Type' },
          { key: 'state', header: 'Now', render: (a) => (a.v?.tripId ? <Badge tone="primary">{a.v.tripId}</Badge> : <span className="text-fg-faint">{a.v?.location || 'At base'}</span>) },
          { key: 'evp', header: 'EVP', render: (a) => (a.q ? <span className="inline-flex gap-1.5 items-center"><Badge tone="danger">Suspended</Badge><Button size="sm" variant="soft" onClick={() => engine.reinstate(a.id)}>Reinstate</Button></span> : <Badge tone="success">Authorised</Badge>) },
          { key: 'alerts', header: 'Alerts', className: 'tabular-nums', render: (a) => a.alerts || '–' },
        ]} />
      </Card>

      {sel && (
        <Drawer eyebrow={`Alert ${sel.id}`} title={sel.type} subtitle={clock(sel.t)} onClose={() => setSelected(null)}
          footer={(
            <div className="flex gap-2 justify-end">
              {sel.status === 'open' && <Button variant="secondary" onClick={() => engine.acknowledge(sel.id)}>Acknowledge</Button>}
              {sel.vehicleId && quarantined.includes(sel.vehicleId) && <Button onClick={() => engine.reinstate(sel.vehicleId)}>Reinstate {sel.vehicleId}</Button>}
            </div>
          )}>
          <div className="space-y-4">
            <p className="text-sm text-fg-muted">{sel.detail}</p>
            <DetailGrid items={[
              { label: 'Vehicle', value: sel.vehicleId || 'Not registered' },
              { label: 'OBU', value: sel.obuId },
              { label: 'Plate', value: sel.plate || '–' },
              { label: 'Junction', value: sel.junctionId || '–' },
              { label: 'Action', value: sel.action },
              { label: 'Status', value: <Badge tone={STATUS_TONE[sel.status]}>{sel.status}</Badge> },
            ]} />
            {sel.features && (
              <div>
                <p className="label-caps mb-2">Anomaly features</p>
                <div className="space-y-1.5">
                  {sel.features.map((v, i) => <Field key={i} label={ANOMALY_FEATURES[i] || `Feature ${i + 1}`}>{fmtNum(v, 1)}</Field>)}
                  <Field label="Isolation-forest score">{sel.score != null ? `${sel.score.toFixed(3)} (threshold ${modelInfo.anomaly.threshold})` : '–'}</Field>
                </div>
              </div>
            )}
            {sel.lat != null && <p className="text-[11px] text-fg-faint">Reported position {sel.lat.toFixed(5)}, {sel.lng.toFixed(5)}</p>}
          </div>
        </Drawer>
      )}
    </div>
  );
}
