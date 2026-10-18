import React, { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { useTheme } from '../../theme/ThemeProvider';
import { Drawer, Badge, Button, Icon } from '../ui';
import { TimeframeToggle } from './ChartCard';
import {
  cssVar, withAlpha, tooltipOptions, legendOptions, axisOptions,
  timeframeLabels, timeframePoints, TIMEFRAMES,
} from './chartTheme';
import { STATUS, getStatus } from '../../utils';
import { APP } from '../../config';

/* Generates a sample history from the current value and trend.
   Replace with real history from your data source. */
function sampleHistory(value, trendPct, n) {
  const v0 = value || 50;
  const slope = ((trendPct || 0) / 100) * v0 / n;
  return Array.from({ length: n }, (_, i) =>
    Math.max(0, +(v0 - slope * (n - i) + Math.sin(i * 0.8) * v0 * 0.03 + Math.sin(i * 0.3 + 1.2) * v0 * 0.015).toFixed(2)));
}

function sampleForecast(hist, trendPct, n = 8) {
  const last = hist[hist.length - 1];
  const avg = hist.reduce((a, b) => a + b, 0) / hist.length;
  const slope = ((trendPct || 0) / 100) * avg / hist.length;
  return Array.from({ length: n }, (_, i) => Math.max(0, +(last + slope * (i + 1) * 2 + Math.sin(i * 0.6) * avg * 0.02).toFixed(2)));
}

/**
 * MetricDetailDrawer: drill-down for a metric.
 *
 * metric = {
 *   label, icon, value, unit, trend,
 *   thresholds: { good, warn }, inverted,   // see getStatus() in utils.js
 *   target, definition, category,
 *   related:  [{ label, value }],
 *   events:   [{ time, tone, text }],
 *   insights: ['…', '…'],
 * }
 */
export default function MetricDetailDrawer({ metric, onClose, timeframes = TIMEFRAMES.all }) {
  const { theme } = useTheme();
  const [tf, setTf] = useState('24H');
  const [forecast, setForecast] = useState(false);

  const value = parseFloat(metric.value) || 0;
  const status = STATUS[getStatus(value, metric.thresholds, metric.inverted)];
  const target = metric.thresholds?.good ?? +(value * 1.05).toFixed(1);

  const hist = useMemo(() => sampleHistory(value, metric.trend, timeframePoints(tf)), [value, metric.trend, tf]);
  const pred = useMemo(() => sampleForecast(hist, metric.trend), [hist, metric.trend]);

  const labels = forecast ? [...timeframeLabels(tf), ...pred.map((_, i) => `+${i + 1}`)] : timeframeLabels(tf);
  const primary = cssVar('--color-primary');
  const accent = cssVar('--color-accent');
  const data = {
    labels,
    datasets: [
      { label: 'Actual', data: forecast ? [...hist, ...pred.map(() => null)] : hist, borderColor: primary, backgroundColor: withAlpha(primary, 0.14), fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2.5 },
      ...(forecast ? [{ label: 'Forecast', data: [...hist.map(() => null), ...pred], borderColor: accent, backgroundColor: withAlpha(accent, 0.1), borderDash: [6, 4], fill: true, tension: 0.4, pointRadius: 2, borderWidth: 2 }] : []),
    ],
  };

  const lines = [];
  if (metric.thresholds) {
    const { good, warn } = metric.thresholds;
    lines.push({ value: good, color: cssVar('--color-success'), label: 'Target', dash: [6, 4] });
    lines.push({ value: warn, color: cssVar('--color-warning'), label: 'Warn', dash: [3, 3] });
  }
  const options = {
    responsive: true, maintainAspectRatio: false,
    layout: { padding: { right: lines.length ? 40 : 8 } },
    plugins: {
      legend: legendOptions(forecast),
      tooltip: tooltipOptions({ callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y ?? '—'} ${metric.unit || ''}` } }),
      thresholdLines: { lines },
    },
    scales: axisOptions({ grid: true }),
  };

  const u = metric.unit || '';
  const bands = metric.thresholds && (metric.inverted
    ? [['normal', `≤ ${metric.thresholds.good}${u}`], ['warning', `${metric.thresholds.good}–${metric.thresholds.warn}${u}`], ['critical', `> ${metric.thresholds.warn}${u}`]]
    : [['normal', `≥ ${metric.thresholds.good}${u}`], ['warning', `${metric.thresholds.warn}–${metric.thresholds.good}${u}`], ['critical', `< ${metric.thresholds.warn}${u}`]]);

  const summary = [
    { label: 'Current', value: metric.value, highlight: true },
    { label: 'Target', value: target },
    { label: 'YTD Avg', value: +(value * 0.977).toFixed(1) },
    { label: '30-Day Avg', value: +(value * 0.964).toFixed(1) },
  ];

  return (
    <Drawer
      width={680}
      eyebrow={metric.category || 'Metric'}
      title={metric.label}
      headerExtra={<Badge tone={status.tone} dot>{status.label.toUpperCase()}</Badge>}
      onClose={onClose}
      bodyClassName="p-4 overflow-y-auto space-y-3"
      footer={
        <>
          <span className="text-[10px] text-fg-faint mr-auto">Last updated {new Date().toLocaleTimeString()} · {APP.name}</span>
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
        </>
      }
    >
      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {summary.map((s) => (
          <div key={s.label} className={`tile ${s.highlight ? `tone-${status.tone}` : ''}`}>
            <p className="label-caps mb-1">{s.label}</p>
            <p className="text-xl font-bold text-fg leading-none">
              {s.value}<span className="text-[11px] font-normal text-fg-faint ml-1">{u}</span>
            </p>
            {s.highlight && metric.trend != null && (
              <p className={`text-[10px] font-semibold mt-1 ${(metric.inverted ? metric.trend <= 0 : metric.trend >= 0) ? 'text-success' : 'text-danger'}`}>
                {metric.trend >= 0 ? '+' : '−'}{Math.abs(metric.trend).toFixed(1)}% vs previous
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="tile">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="label-caps">History</p>
          <div className="flex items-center gap-2">
            <TimeframeToggle options={timeframes} value={tf} onChange={(v) => { setTf(v); setForecast(false); }} />
            <Button size="sm" variant={forecast ? 'accent' : 'soft'} icon="sparkles" onClick={() => setForecast((f) => !f)}>Forecast</Button>
          </div>
        </div>
        <div style={{ height: 220 }}>
          <Line key={theme} data={data} options={options} />
        </div>
        {bands && (
          <div className="flex flex-wrap gap-5 pt-2 mt-2 border-t">
            {bands.map(([key, desc]) => (
              <div key={key} className="flex items-center gap-2">
                <Badge tone={STATUS[key].tone} dot plain>{STATUS[key].label.toUpperCase()}</Badge>
                <span className="text-[11px] font-semibold text-fg">{desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {metric.definition && (
          <div className="tile">
            <p className="label-caps mb-1">Definition</p>
            <p className="text-xs text-fg leading-relaxed">{metric.definition}</p>
          </div>
        )}
        {metric.events?.length > 0 && (
          <div className="tile">
            <p className="label-caps mb-2">Events</p>
            <div className="space-y-2">
              {metric.events.map((e, i) => (
                <div key={i} className="flex gap-2 text-[11px]">
                  <span className="font-bold tabular-nums" style={{ color: `var(--color-${e.tone || 'neutral'})` }}>{e.time}</span>
                  <span className="text-fg leading-snug">{e.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {metric.related?.length > 0 && (
          <div className="tile sm:col-span-2">
            <p className="label-caps mb-2">Related metrics</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {metric.related.map((r) => (
                <div key={r.label} className="pl-2 border-l-2 border-primary">
                  <p className="label-caps mb-0.5">{r.label}</p>
                  <p className="text-sm font-bold text-primary">{r.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {metric.insights?.length > 0 && (
        <div className="tile tone-accent">
          <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-accent mb-2">
            <Icon name="sparkles" size={13} /> AI insights
          </p>
          <ol className="grid sm:grid-cols-3 gap-3">
            {metric.insights.map((s, i) => (
              <li key={i} className="flex gap-2 text-[11px] text-fg leading-snug">
                <span className="w-4 h-4 rounded-full bg-accent text-white text-[9px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Drawer>
  );
}
