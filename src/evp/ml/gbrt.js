/* Gradient-boosted regression trees (least squares) with histogram
   binning, small enough to train in the browser in well under a second.
   Trees are stored as flat arrays so models serialise to JSON. */
import { Rng } from '../rng.js';

function quantileEdges(values, bins) {
  const sorted = Float64Array.from(values).sort();
  const edges = [];
  for (let b = 1; b < bins; b++) {
    const v = sorted[Math.min(sorted.length - 1, Math.floor((b / bins) * sorted.length))];
    if (!edges.length || v > edges[edges.length - 1]) edges.push(v);
  }
  return edges;
}

function binOf(edges, v) {
  let lo = 0;
  let hi = edges.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (v <= edges[mid]) hi = mid; else lo = mid + 1;
  }
  return lo;
}

export class GBRT {
  constructor({ nTrees = 120, depth = 4, lr = 0.1, minLeaf = 20, bins = 32, subsample = 0.7, seed = 7 } = {}) {
    Object.assign(this, { nTrees, depth, lr, minLeaf, bins, subsample, seed });
    this.trees = [];
    this.base = 0;
    this.importance = [];
  }

  /**
   * X: array of feature arrays, y: targets.
   * Yields to the event loop between trees when `async` so the UI stays live.
   */
  async fit(X, y, { async = false, onProgress } = {}) {
    const n = X.length;
    const f = X[0].length;
    const rng = new Rng(this.seed);
    this.edges = Array.from({ length: f }, (_, k) => quantileEdges(X.map((r) => r[k]), this.bins));
    const nb = this.edges.map((e) => e.length + 1);
    const B = new Uint8Array(n * f);
    for (let i = 0; i < n; i++) for (let k = 0; k < f; k++) B[i * f + k] = binOf(this.edges[k], X[i][k]);
    this.base = y.reduce((s, v) => s + v, 0) / n;
    const pred = new Float64Array(n).fill(this.base);
    const r = new Float64Array(n);
    this.importance = new Array(f).fill(0);
    this.trees = [];
    const maxBins = Math.max(...nb);
    const sum = new Float64Array(maxBins);
    const cnt = new Float64Array(maxBins);

    for (let t = 0; t < this.nTrees; t++) {
      for (let i = 0; i < n; i++) r[i] = y[i] - pred[i];
      const rows = [];
      for (let i = 0; i < n; i++) if (rng.next() < this.subsample) rows.push(i);
      const tree = { feat: [], thr: [], left: [], right: [], value: [] };
      const build = (idx, d) => {
        const node = tree.feat.length;
        tree.feat.push(-1); tree.thr.push(0); tree.left.push(-1); tree.right.push(-1); tree.value.push(0);
        let S = 0;
        for (const i of idx) S += r[i];
        tree.value[node] = (S / Math.max(1, idx.length)) * this.lr;
        if (d >= this.depth || idx.length < 2 * this.minLeaf) return node;
        const parent = (S * S) / idx.length;
        let best = { gain: 1e-9, k: -1, b: -1 };
        for (let k = 0; k < f; k++) {
          sum.fill(0, 0, nb[k]); cnt.fill(0, 0, nb[k]);
          for (const i of idx) { const b = B[i * f + k]; sum[b] += r[i]; cnt[b] += 1; }
          let sl = 0; let cl = 0;
          for (let b = 0; b < nb[k] - 1; b++) {
            sl += sum[b]; cl += cnt[b];
            const cr = idx.length - cl;
            if (cl < this.minLeaf || cr < this.minLeaf) continue;
            const sr = S - sl;
            const gain = (sl * sl) / cl + (sr * sr) / cr - parent;
            if (gain > best.gain) best = { gain, k, b };
          }
        }
        if (best.k < 0) return node;
        this.importance[best.k] += best.gain;
        const L = []; const R = [];
        for (const i of idx) (B[i * f + best.k] <= best.b ? L : R).push(i);
        tree.feat[node] = best.k;
        tree.thr[node] = this.edges[best.k][best.b];
        tree.left[node] = build(L, d + 1);
        tree.right[node] = build(R, d + 1);
        return node;
      };
      build(rows, 0);
      this.trees.push(tree);
      for (let i = 0; i < n; i++) pred[i] += this._tree(tree, X[i]);
      if (async && t % 8 === 7) {
        onProgress?.((t + 1) / this.nTrees);
        await new Promise((res) => setTimeout(res, 0));
      }
    }
    const total = this.importance.reduce((s, v) => s + v, 0) || 1;
    this.importance = this.importance.map((v) => v / total);
    return this;
  }

  _tree(tree, x) {
    let node = 0;
    while (tree.feat[node] >= 0) node = x[tree.feat[node]] <= tree.thr[node] ? tree.left[node] : tree.right[node];
    return tree.value[node];
  }

  predict(x) {
    let p = this.base;
    for (const tree of this.trees) p += this._tree(tree, x);
    return p;
  }
}
