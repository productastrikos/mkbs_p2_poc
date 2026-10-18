import React, { useState } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { useTheme } from '../../theme/ThemeProvider';
import { Card, IconButton, Drawer } from '../ui';
import {
  resolveColor, seriesColor, withAlpha, tooltipOptions, legendOptions, axisOptions,
  timeframeLabels, timeframePoints, resample,
} from './chartTheme';

const CHARTS = { line: Line, bar: Bar, doughnut: Doughnut };

/** Segmented 12H / 24H / 7D / 30D toggle. */
export function TimeframeToggle({ options, value, onChange }) {
  if (!options || options.length < 2) return null;
  return (
    <div className="timeframe" role="tablist" aria-label="Time range">
      {options.map((tf) => (
        <button key={tf} type="button" role="tab" aria-selected={value === tf}
          className={value === tf ? 'is-active' : ''} onClick={() => onChange(tf)}>
          {tf}
        </button>
      ))}
    </div>
  );
}

/* Applies theme colours to plain datasets. A dataset may set
   `color`: a token name ('primary', 'success', 'chart-3') or a hex value,
   or an array of them for per-bar colours. */
function styleDatasets(type, datasets) {
  return datasets.map((ds, i) => {
    const { color, ...rest } = ds;
    if (type === 'doughnut') {
      const colors = Array.isArray(color) ? color.map(resolveColor) : ds.data.map((_, j) => seriesColor(j));
      return { borderWidth: 0, hoverOffset: 4, ...rest, backgroundColor: colors };
    }
    if (type === 'bar') {
      const bg = Array.isArray(color) ? color.map(resolveColor) : resolveColor(color || `chart-${(i % 8) + 1}`);
      return { borderRadius: 4, maxBarThickness: 36, ...rest, backgroundColor: bg };
    }
    const c = resolveColor(color || `chart-${(i % 8) + 1}`);
    return {
      borderColor: c, backgroundColor: withAlpha(c, 0.14),
      fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2,
      ...rest,
    };
  });
}

function buildOptions({ type, legend, yMax, yLabel, stacked, thresholds, options }) {
  if (type === 'doughnut') {
    return {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: {
        legend: legendOptions(legend, 'right'),
        tooltip: tooltipOptions({
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              return ` ${ctx.label}: ${total ? ((ctx.parsed / total) * 100).toFixed(1) : 0}%`;
            },
          },
        }),
      },
      ...options,
    };
  }
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: legendOptions(legend),
      tooltip: tooltipOptions(),
      thresholdLines: {
        lines: (thresholds || []).map((t) => ({ value: t.value, color: resolveColor(t.tone), dash: t.dash })),
      },
    },
    scales: axisOptions({ yMax, yLabel, stacked }),
    ...options,
  };
}

/**
 * ChartCard: a Card containing a Chart.js chart that follows the theme.
 *
 *   type        'line' | 'bar' | 'doughnut'
 *   data        { labels, datasets: [{ label, data, color? }] }
 *   thresholds  [{ value, tone: 'success'|'warning'|'danger', label, description }]
 *               dashed reference lines plus a legend under the chart
 *   timeframes  e.g. TIMEFRAMES.intraday; adds a toggle and resamples data
 *   info        show an ⓘ button that opens a detail drawer (uses `subtitle`)
 *   legend, height, yMax, yLabel, stacked, options (extra Chart.js options)
 */
export default function ChartCard({
  title, subtitle, type = 'line', data, height = 200,
  legend = false, yMax, yLabel, stacked = false, thresholds, timeframes, defaultTimeframe,
  info = false, actions, options, className = '',
}) {
  const { theme } = useTheme();
  const [tf, setTf] = useState(defaultTimeframe || timeframes?.[timeframes.length - 1]);
  const [showInfo, setShowInfo] = useState(false);

  const labels = timeframes && type !== 'doughnut' ? timeframeLabels(tf) : data.labels;
  const datasets = timeframes && type !== 'doughnut'
    ? data.datasets.map((ds) => ({ ...ds, data: resample(ds.data, timeframePoints(tf)) }))
    : data.datasets;

  const Chart = CHARTS[type];
  const chartData = { labels, datasets: styleDatasets(type, datasets) };
  const chartOptions = buildOptions({ type, legend, yMax, yLabel, stacked, thresholds, options });

  const header = (
    <>
      {actions}
      <TimeframeToggle options={timeframes} value={tf} onChange={setTf} />
      {info && <IconButton icon="info" label="Chart details" plain onClick={() => setShowInfo(true)} />}
    </>
  );

  return (
    <>
      <Card title={title} subtitle={info ? undefined : subtitle} actions={header} className={className}>
        <div style={{ height }}>
          <Chart key={theme} data={chartData} options={chartOptions} />
        </div>
        <ThresholdLegend thresholds={thresholds} />
      </Card>

      {showInfo && (
        <Drawer eyebrow="Chart details" title={title} onClose={() => setShowInfo(false)} width={400}>
          <div className="space-y-5">
            {subtitle && <p className="text-xs text-fg-muted leading-relaxed">{subtitle}</p>}
            <div className="tile" style={{ height: 240 }}>
              <Chart key={theme} data={chartData} options={chartOptions} />
            </div>
            <ThresholdLegend thresholds={thresholds} stacked />
          </div>
        </Drawer>
      )}
    </>
  );
}

function ThresholdLegend({ thresholds, stacked = false }) {
  const items = (thresholds || []).filter((t) => t.label);
  if (!items.length) return null;
  return (
    <div className={`flex ${stacked ? 'flex-col' : 'flex-wrap'} gap-x-4 gap-y-2 mt-3 pt-3 border-t`}>
      {items.map((t) => (
        <div key={t.label} className="flex items-center gap-2 text-[10px]">
          <span className="w-4 border-t-2 border-dashed" style={{ borderColor: `var(--color-${t.tone})` }} />
          <span className="font-bold uppercase tracking-wide" style={{ color: `var(--color-${t.tone})` }}>{t.label}</span>
          {t.description && <span className="text-fg-muted">{t.description}</span>}
        </div>
      ))}
    </div>
  );
}
