/* Multinomial logistic regression trained with mini-batch Adam. */
import { Rng } from '../rng.js';

export class Softmax {
  constructor({ classes, epochs = 10, lr = 0.05, l2 = 1e-4, batch = 64, seed = 11 }) {
    Object.assign(this, { classes, epochs, lr, l2, batch, seed });
  }

  fit(X, y) {
    const K = this.classes.length;
    const F = X[0].length;
    const rng = new Rng(this.seed);
    this.W = Array.from({ length: K }, () => new Float64Array(F));
    const m = this.W.map(() => new Float64Array(F));
    const v = this.W.map(() => new Float64Array(F));
    const yi = y.map((c) => this.classes.indexOf(c));
    let step = 0;
    const order = X.map((_, i) => i);
    for (let e = 0; e < this.epochs; e++) {
      const idx = rng.shuffle(order);
      for (let s = 0; s < idx.length; s += this.batch) {
        const g = this.W.map(() => new Float64Array(F));
        const end = Math.min(idx.length, s + this.batch);
        for (let q = s; q < end; q++) {
          const i = idx[q];
          const p = this.proba(X[i]);
          for (let k = 0; k < K; k++) {
            const err = p[k] - (yi[i] === k ? 1 : 0);
            const gk = g[k];
            const x = X[i];
            for (let j = 0; j < F; j++) gk[j] += err * x[j];
          }
        }
        step++;
        const n = end - s;
        for (let k = 0; k < K; k++) {
          for (let j = 0; j < F; j++) {
            const grad = g[k][j] / n + this.l2 * this.W[k][j];
            m[k][j] = 0.9 * m[k][j] + 0.1 * grad;
            v[k][j] = 0.999 * v[k][j] + 0.001 * grad * grad;
            const mh = m[k][j] / (1 - 0.9 ** step);
            const vh = v[k][j] / (1 - 0.999 ** step);
            this.W[k][j] -= (this.lr * mh) / (Math.sqrt(vh) + 1e-8);
          }
        }
      }
    }
    return this;
  }

  proba(x, mask) {
    const z = this.W.map((w) => { let s = 0; for (let j = 0; j < x.length; j++) s += w[j] * x[j]; return s; });
    const mx = Math.max(...z);
    const e = z.map((zi, k) => (mask && !mask[k] ? 0 : Math.exp(zi - mx)));
    const tot = e.reduce((a, b) => a + b, 0) || 1;
    return e.map((ei) => ei / tot);
  }
}
