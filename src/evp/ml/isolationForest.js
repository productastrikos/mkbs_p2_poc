/* Isolation forest (Liu et al., 2008) for unsupervised anomaly scoring.
   Score ≈ 0.5 for ordinary points, → 1 for points isolated in few splits. */
import { Rng } from '../rng.js';

const harmonic = (n) => Math.log(n) + 0.5772156649;
const cFactor = (n) => (n <= 1 ? 0 : 2 * harmonic(n - 1) - (2 * (n - 1)) / n);

export class IsolationForest {
  constructor({ trees = 100, sample = 256, seed = 5 } = {}) {
    Object.assign(this, { nTrees: trees, sample, seed });
  }

  fit(X) {
    const rng = new Rng(this.seed);
    const psi = Math.min(this.sample, X.length);
    const maxDepth = Math.ceil(Math.log2(psi));
    this.c = cFactor(psi);
    const F = X[0].length;
    const build = (rows, depth) => {
      if (depth >= maxDepth || rows.length <= 1) return { size: rows.length };
      const k = rng.int(0, F - 1);
      let lo = Infinity; let hi = -Infinity;
      rows.forEach((r) => { lo = Math.min(lo, r[k]); hi = Math.max(hi, r[k]); });
      if (lo === hi) return { size: rows.length };
      const split = rng.float(lo, hi);
      return { k, split, l: build(rows.filter((r) => r[k] < split), depth + 1), r: build(rows.filter((r) => r[k] >= split), depth + 1) };
    };
    this.trees = Array.from({ length: this.nTrees }, () => {
      const rows = Array.from({ length: psi }, () => X[rng.int(0, X.length - 1)]);
      return build(rows, 0);
    });
    const scores = X.map((x) => this.score(x)).sort((a, b) => a - b);
    this.threshold = Math.max(0.6, scores[Math.floor(scores.length * 0.997)]);
    return this;
  }

  _path(node, x, depth) {
    if (node.size !== undefined) return depth + cFactor(node.size);
    return this._path(x[node.k] < node.split ? node.l : node.r, x, depth + 1);
  }

  score(x) {
    const mean = this.trees.reduce((s, t) => s + this._path(t, x, 0), 0) / this.trees.length;
    return 2 ** (-mean / this.c);
  }
}
