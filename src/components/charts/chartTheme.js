import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Tooltip, Legend, Filler,
} from 'chart.js';

/* Chart.js setup and theme helpers. Chart elements are registered once
   here, so pages don't need to register anything. */

/* Draws horizontal reference lines:
   options.plugins.thresholdLines = { lines: [{ value, color, dash, label }] } */
const thresholdLinesPlugin = {
  id: 'thresholdLines',
  afterDatasetsDraw(chart, _args, opts) {
    const lines = opts?.lines;
    const y = chart.scales.y;
    if (!lines?.length || !y) return;
    const { ctx, chartArea: { left, right } } = chart;
    ctx.save();
    lines.forEach(({ value, color, dash = [4, 3], label }) => {
      if (value == null || value < y.min || value > y.max) return;
      const py = y.getPixelForValue(value);
      ctx.beginPath();
      ctx.setLineDash(dash);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = color;
      ctx.moveTo(left, py);
      ctx.lineTo(right, py);
      ctx.stroke();
      if (label) {
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = '9px Inter, system-ui, sans-serif';
        ctx.fillText(label, right + 4, py + 3);
      }
    });
    ctx.restore();
  },
};

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler, thresholdLinesPlugin);
ChartJS.defaults.interaction.mode = 'index';
ChartJS.defaults.interaction.intersect = false;
ChartJS.defaults.font.family = 'Inter, system-ui, sans-serif';

/* ─── Reading theme tokens ─────────────────────────────────── */
export function cssVar(name) {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const NAMED = ['primary', 'accent', 'success', 'warning', 'danger', 'info', 'neutral'];

/** Resolve 'primary' | 'success' | 'chart-3' | '#hex' to a concrete colour. */
export function resolveColor(name) {
  if (!name) return cssVar('--chart-1');
  if (name.startsWith('#') || name.startsWith('rgb')) return name;
  if (NAMED.includes(name)) return cssVar(`--color-${name}`);
  return cssVar(`--${name}`);
}

/** Series palette: --chart-1 … --chart-8 from theme.css. */
export const seriesColor = (i) => cssVar(`--chart-${(i % 8) + 1}`);

/** '#3b7de8' + 0.15 → 'rgba(59,125,232,0.15)'. Non-hex colours are returned unchanged. */
export function withAlpha(color, alpha) {
  const hex = color?.replace('#', '');
  if (!hex || !/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) return color;
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/* ─── Shared option builders ───────────────────────────────── */
export function tooltipOptions(extra = {}) {
  return {
    backgroundColor: cssVar('--chart-tooltip-bg'),
    borderColor: cssVar('--chart-tooltip-border'),
    borderWidth: 1,
    titleColor: cssVar('--color-text'),
    bodyColor: cssVar('--color-text-muted'),
    padding: 8,
    ...extra,
  };
}

export function legendOptions(show, position = 'top') {
  if (!show) return { display: false };
  return {
    display: true,
    position,
    labels: { color: cssVar('--color-text-muted'), font: { size: 10 }, boxWidth: 8, usePointStyle: true, padding: 10 },
  };
}

export function axisOptions({ yMax, yLabel, stacked = false, grid = false } = {}) {
  const tick = { color: cssVar('--chart-tick'), font: { size: 9 } };
  const gridCfg = grid ? { color: cssVar('--chart-grid') } : { display: false };
  return {
    x: { stacked, grid: { display: false }, ticks: tick },
    y: {
      stacked, grid: gridCfg, ticks: tick, beginAtZero: true,
      ...(yMax != null ? { max: yMax } : {}),
      ...(yLabel ? { title: { display: true, text: yLabel, color: cssVar('--chart-tick'), font: { size: 9 } } } : {}),
    },
  };
}

/* ─── Timeframes ───────────────────────────────────────────── */
export const TIMEFRAMES = {
  intraday: ['12H', '24H'],
  daily:    ['24H', '7D'],
  trend:    ['7D', '30D'],
  all:      ['12H', '24H', '7D', '30D'],
};

const POINTS = { '12H': 12, '24H': 24, '7D': 7, '30D': 30 };
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function timeframeLabels(tf) {
  const n = POINTS[tf] || 24;
  if (tf === '7D') return DAYS.slice();
  if (tf === '30D') return Array.from({ length: n }, (_, i) => `D${i + 1}`);
  return Array.from({ length: n }, (_, i) => `${String(i).padStart(2, '0')}:00`);
}

/** Stretch or squeeze a series to `points` values with linear interpolation. */
export function resample(series, points) {
  if (!Array.isArray(series) || series.length === 0) return [];
  if (series.length === points) return series;
  if (points === 1) return [series[series.length - 1]];
  return Array.from({ length: points }, (_, i) => {
    const pos = (i / (points - 1)) * (series.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(series.length - 1, Math.ceil(pos));
    return +(series[lo] + (series[hi] - series[lo]) * (pos - lo)).toFixed(2);
  });
}

export const timeframePoints = (tf) => POINTS[tf] || 24;
