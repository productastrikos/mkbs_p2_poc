import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { toneToken } from '../../utils';

/* Chart.js setup and theme helpers (ASTRIKOS-UI-THEME §10). Chart elements
   are registered once here, so pages don't need to register anything. */

const FONT = "'Lato', system-ui, -apple-system, sans-serif";

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
        ctx.font = `700 10px ${FONT}`;
        ctx.fillText(label, right + 4, py + 3);
      }
    });
    ctx.restore();
  },
};

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler, thresholdLinesPlugin);
ChartJS.defaults.interaction.mode = 'index';
ChartJS.defaults.interaction.intersect = false;
ChartJS.defaults.font.family = FONT;

/* ─── Reading theme tokens ─────────────────────────────────── */
// Tokens live on <body data-theme>, so read them from body, not <html>.
export function cssVar(name) {
  if (typeof document === 'undefined' || !document.body) return '';
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

/* Categorical series order (§10), never shuffled. */
const SERIES = ['accent', 'teal', 'info', 'warning', 'success', 'danger'];
export const SERIES_COUNT = SERIES.length;

const NAMED = ['primary', 'accent', 'success', 'warning', 'danger', 'info', 'neutral', 'teal', 'violet'];

/** Resolve 'primary' | 'success' | 'chart-3' | '#hex' to a concrete colour. */
export function resolveColor(name) {
  if (!name) return cssVar(`--app-${SERIES[0]}`);
  if (name.startsWith('#') || name.startsWith('rgb')) return name;
  if (NAMED.includes(name)) return cssVar(`--app-${name === 'accent' ? 'accent' : toneToken(name)}`);
  const series = name.match(/^chart-(\d+)$/);
  if (series) return seriesColor(Number(series[1]) - 1);
  return cssVar(`--app-${name}`) || cssVar(`--${name}`);
}

/** Series palette: accent, teal, info, warning, success, danger. */
export const seriesColor = (i) => cssVar(`--app-${SERIES[i % SERIES.length]}`);

/** '#rrggbb' + 0.15 → 'rgba(r, g, b, 0.15)'. Non-hex colours are returned unchanged. */
export function withAlpha(color, alpha) {
  const hex = color?.replace('#', '');
  if (!hex || !/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) return color;
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Bar fill: the status --app-*-bar tokens, otherwise the colour at 88% alpha. */
export function barColor(name) {
  const token = NAMED.includes(name) ? toneToken(name) : null;
  if (token === 'success' || token === 'warning' || token === 'danger') return cssVar(`--app-${token}-bar`);
  return withAlpha(resolveColor(name), 0.88);
}

/* ─── Shared option builders ───────────────────────────────── */
export function tooltipOptions(extra = {}) {
  return {
    backgroundColor: cssVar('--app-chart-tooltip-bg'),
    borderColor: cssVar('--app-chart-tooltip-border'),
    borderWidth: 1,
    cornerRadius: 8,
    titleColor: cssVar('--app-text'),
    bodyColor: cssVar('--app-text-muted'),
    titleFont: { family: FONT, size: 11, weight: 700 },
    bodyFont: { family: FONT, size: 11 },
    padding: { x: 10, y: 8 },
    boxWidth: 8,
    boxHeight: 8,
    boxPadding: 4,
    ...extra,
  };
}

/* Solid 8px swatches: a line series shows its line colour, not its 12% area fill. */
const solidSwatches = (chart) => ChartJS.defaults.plugins.legend.labels.generateLabels(chart).map((l) => {
  const ds = chart.data.datasets[l.datasetIndex];
  const line = (ds?.type || chart.config.type) === 'line';
  return { ...l, fillStyle: line ? ds.borderColor : l.fillStyle, strokeStyle: 'transparent', lineWidth: 0 };
});

export function legendOptions(show, position = 'top') {
  if (!show) return { display: false };
  return {
    display: true,
    position,
    align: position === 'top' ? 'end' : 'center',
    labels: {
      color: cssVar('--app-text-muted'), font: { family: FONT, size: 10 },
      boxWidth: 8, boxHeight: 8, useBorderRadius: true, borderRadius: 2, padding: 12,
      // Doughnuts keep their per-slice labels from the doughnut controller.
      ...(position === 'top' ? { generateLabels: solidSwatches } : {}),
    },
  };
}

/* Horizontal grid only; axis labels 10px Lato in --app-text-faint. */
export function axisOptions({ yMax, yLabel, stacked = false, grid = true } = {}) {
  const tick = { color: cssVar('--app-text-faint'), font: { family: FONT, size: 10 } };
  const border = { color: cssVar('--app-border') };
  return {
    x: { stacked, grid: { display: false }, border, ticks: tick },
    y: {
      stacked, beginAtZero: true, ticks: tick,
      grid: grid ? { color: cssVar('--app-chart-grid'), lineWidth: 1 } : { display: false },
      border: { display: false },
      ...(yMax != null ? { max: yMax } : {}),
      ...(yLabel ? { title: { display: true, text: yLabel, color: cssVar('--app-text-faint'), font: { family: FONT, size: 10 } } } : {}),
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
