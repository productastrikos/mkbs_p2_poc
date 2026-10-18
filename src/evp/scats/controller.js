/* Simulated SCATS junction controller.

   Normal operation is adaptive: each phase's green is sized from the cycle
   length (which grows with congestion), the phase split, and the queues it
   serves. Pre-emption follows the safety rules:
     • a pedestrian walk/clearance that has started is never cut short,
     • minimum vehicle green is respected,
     • every change goes through 3 s amber + 2 s all-red,
     • the EVP green is held for at most 45 s,
   and after release the controller runs two recovery cycles that size
   greens to clear the queues built up during the pre-emption.

   A "shadow" instance runs the same junction without pre-emption to give
   the no-EVP baseline signal state. */
import { phaseServes } from '../junctions.js';

export const MAX_HOLD_S = 45;
const STARTUP_LOST = 2;
const SAT_FLOW = 0.5; // veh/s/lane
const MOVE_SHARE = { S: 0.6, L: 0.25, R: 0.13, U: 0.02 };
const RECOVERY_CYCLES = 2;

export class JunctionController {
  constructor(junction, { rng, shadow = false }) {
    this.j = junction;
    this.rng = rng;
    this.shadow = shadow;
    this.T = junction.timing;
    this.phases = Object.fromEntries(junction.phases.map((p) => [p.id, p]));
    this.seq = junction.sequence;
    this.arms = junction.arms;
    this.mode = 'ADAPTIVE';
    this.queues = Object.fromEntries(junction.arms.map((a) => [a.id, rng.float(1, 6) * a.lanes / 2]));
    this.congestion = 0.3;
    this.stage = null;
    this.preempt = null;
    this.recovery = null;
    // Arm capacity (veh/s) under the normal plan at a typical 110 s cycle;
    // demand is set as a congestion-dependent share of it.
    const C = 110;
    const lost = this.seq.length * (this.T.amber + this.T.allRed);
    this.capacity = Object.fromEntries(this.arms.map((a) => {
      const effGreen = this.seq.reduce((s, id) => {
        const p = this.phases[id];
        const g = Math.max(this.T.minGreen, (p.split || 1 / this.seq.length) * (C - lost)) - STARTUP_LOST;
        return s + this.armServedShare(p, a.id) * g;
      }, 0);
      return [a.id, (SAT_FLOW * a.lanes * effGreen) / C];
    }));
    this.history = [];      // completed pre-emption records
    this.samples = [];      // queue samples for charts
    this._lastSample = -Infinity;
    this._served = new Set();
  }

  /* ─── Geometry helpers ─────────────────────────────────── */
  armServedShare(phase, armId) {
    if (!phase) return 0;
    return phase.moves.reduce((s, [a, m]) => (a === armId ? s + MOVE_SHARE[m] : s), 0);
  }

  pedClearFor(phase) {
    const crossed = this.arms.filter((a) => this.armServedShare(phase, a.id) === 0);
    const lanes = crossed.length ? Math.max(...crossed.map((a) => a.lanes)) : 2;
    return Math.round((lanes * 2 * 3.5 + 2) / 1.2);
  }

  /* ─── Adaptive green sizing ────────────────────────────── */
  greenFor(phaseId, ctx) {
    const p = this.phases[phaseId];
    const { minGreen, maxGreen, cycleMin, cycleMax, amber, allRed } = this.T;
    const cycle = cycleMin + (cycleMax - cycleMin) * Math.min(1, this.congestion * 1.1);
    const lost = this.seq.length * (amber + allRed);
    const split = p.split || 1 / this.seq.length;
    const served = this.arms.filter((a) => this.armServedShare(p, a.id) > 0);
    const q = served.reduce((s, a) => s + this.queues[a.id] * this.armServedShare(p, a.id), 0);
    const qAvg = this.arms.reduce((s, a) => s + this.queues[a.id], 0) / this.arms.length;
    const f = Math.min(1.4, Math.max(0.7, 0.75 + (0.5 * q) / (qAvg * served.length * 0.5 + 1)));
    let g = Math.min(maxGreen, Math.max(minGreen, split * (cycle - lost) * f));
    if (this.mode === 'RECOVERY') {
      const rate = served.reduce((s, a) => s + SAT_FLOW * a.lanes * this.armServedShare(p, a.id), 0) || 1;
      g = Math.min(maxGreen * 1.25, Math.max(g, q / rate + 4));
    }
    if (this.stage?.ped) g = Math.max(g, this.T.pedWalk + this.stage.ped.clear + 1);
    void ctx;
    return g;
  }

  _startGreen(t, phaseId, ctx) {
    const p = this.phases[phaseId];
    let pedDemand = p.ped && !this.preemptTarget(phaseId) && this.rng.chance(ctx.pedProb);
    // Advance notice of an approaching ambulance: hold new pedestrian calls to
    // the next cycle instead of starting a walk that could not be cut short.
    if (pedDemand && this.approach && this.approach.until > t) {
      pedDemand = false;
      this.pedHeld = (this.pedHeld || 0) + 1;
      this._log('PED_HELD', `Pedestrian call held: ${this.approach.vehicleId} approaching`);
    }
    this.stage = {
      name: 'GREEN', phaseId, t0: t, next: null,
      ped: pedDemand ? { walkEnd: t + this.T.pedWalk, clearEnd: t + this.T.pedWalk + this.pedClearFor(p), clear: this.pedClearFor(p) } : null,
    };
    this.stage.duration = this.greenFor(phaseId, ctx);
    if (p.kind === 'normal') this._served.add(phaseId);
  }

  preemptTarget(phaseId) {
    return this.preempt && !this.preempt.cancelled && this.preempt.phaseId === phaseId;
  }

  _nextNormal() {
    if (this.mode === 'RECOVERY') {
      // Serve the phase with the largest weighted queue that hasn't run this recovery cycle.
      const remaining = this.seq.filter((id) => !this._served.has(id));
      if (!remaining.length) {
        this.recovery.cycle += 1;
        this.recovery.lastCycleMean = this.recovery.acc.dt ? this.recovery.acc.sum / this.recovery.acc.dt : this.totalQueue();
        this.recovery.acc = { sum: 0, dt: 0 };
        this._log('RECOVERY_CYCLE', `Recovery cycle ${this.recovery.cycle} complete`);
        this._served = new Set();
        const cleared = this.recovery.lastCycleMean <= (this.episode?.normal ?? this.recovery.queueAtStart) * 1.2;
        if (this.recovery.cycle >= RECOVERY_CYCLES || cleared) return this._endRecovery();
        return this._nextNormal();
      }
      return remaining.sort((a, b) => this._phaseQueue(b) - this._phaseQueue(a))[0];
    }
    const i = this.seq.indexOf(this.stage.phaseId);
    return this.seq[(i + 1) % this.seq.length] || this.seq[0];
  }

  _phaseQueue(id) {
    const p = this.phases[id];
    return this.arms.reduce((s, a) => s + this.queues[a.id] * this.armServedShare(p, a.id), 0);
  }

  _endRecovery() {
    const rec = this.recovery;
    this.mode = 'ADAPTIVE';
    this.recovery = null;
    this._served = new Set();
    const last = this.history[0];
    if (last && rec) {
      last.timeline.recoveryEndAt = this._now;
      last.recovery = {
        cycles: rec.cycle, queueAtStart: rec.queueAtStart, queueAtEnd: Math.round(rec.lastCycleMean ?? this.totalQueue()),
        normalQueue: this.episode?.normal ?? null, peakQueue: this.episode ? Math.round(this.episode.peak) : null,
      };
    }
    this.episode = null;
    this._log('RECOVERY_END', 'SCATS adaptive control resumed');
    return this.seq[0];
  }

  /* ─── Main loop ─────────────────────────────────────────── */
  step(t, dt, ctx) {
    this._now = t;
    if (!this.stage) {
      const startIdx = this.rng.int(0, this.seq.length - 1);
      this._startGreen(t - this.rng.float(0, 10), this.seq[startIdx], ctx);
    }
    this._updateQueues(dt, ctx);
    const s = this.stage;
    const el = t - s.t0;
    const pre = this.preempt;

    if (s.name === 'GREEN') {
      if (pre && !pre.cancelled && pre.state === 'GREEN') {
        if (t - pre.timeline.greenAt >= MAX_HOLD_S) {
          pre.maxHoldHit = true;
          this._log('MAX_HOLD', `Maximum hold ${MAX_HOLD_S} s reached, releasing`);
          this.release(t, pre.requestId, 'Maximum hold reached');
        }
      } else if (pre && !pre.cancelled && pre.state === 'WAIT_SAFE') {
        const minOk = el >= this.T.minGreen;
        const pedOk = !s.ped || t >= s.ped.clearEnd;
        if (!pedOk && !pre.pedProtect) { pre.pedProtect = true; this._log('PED_PROTECT', 'Pedestrian crossing in progress: transition held'); }
        if (minOk && pedOk) {
          pre.timeline.safeAt = t;
          pre.pedProtectS = Math.round((t - pre.timeline.requestedAt) * 10) / 10;
          this._toAmber(t, pre.phaseId);
          pre.state = 'CLEARING';
          pre.timeline.amberAt = t;
          this._log('AMBER', `Amber ${this.T.amber} s on phase ${s.phaseId}`);
        }
      } else if (el >= s.duration && (!s.ped || t >= s.ped.clearEnd)) {
        this._toAmber(t, this._nextNormal());
      }
    } else if (s.name === 'AMBER') {
      if (el >= this.T.amber) {
        this.stage = { name: 'ALLRED', phaseId: s.phaseId, t0: t, next: s.next };
        if (pre && pre.state === 'CLEARING') { pre.timeline.allRedAt = t; this._log('ALLRED', `All-red ${this.T.allRed} s`); }
        if (pre && pre.state === 'RELEASING') pre.timeline.releaseAllRedAt = t;
      }
    } else if (s.name === 'ALLRED') {
      if (el >= this.T.allRed) {
        if (pre && !pre.cancelled && pre.state === 'CLEARING') {
          this._startGreen(t, pre.phaseId, ctx);
          pre.state = 'GREEN';
          pre.timeline.greenAt = t;
          this.mode = 'PREEMPT';
          this._log('GREEN', `EVP green on phase ${pre.phaseId}`);
        } else {
          if (pre && (pre.state === 'RELEASING' || pre.cancelled)) this._finishPreempt(t);
          this._startGreen(t, s.next || this._nextNormal(), ctx);
        }
      }
    }

    if (t - this._lastSample >= 5) {
      this._lastSample = t;
      this.samples.push({ t, mode: this.mode, phase: this.stage.phaseId, total: Math.round(this.totalQueue() * 10) / 10, q: { ...this.queues } });
      if (this.samples.length > 400) this.samples.shift();
    }
  }

  _toAmber(t, next) {
    this.stage = { name: 'AMBER', phaseId: this.stage.phaseId, t0: t, next };
  }

  _updateQueues(dt, ctx) {
    const s = this.stage;
    const p = this.phases[s.phaseId];
    let total = 0;
    let lanes = 0;
    const vc = 0.25 + 0.62 * ctx.profile; // demand / capacity
    this.arms.forEach((a) => {
      const lambda = this.capacity[a.id] * vc;
      let q = this.queues[a.id] + lambda * dt * (0.6 + this.rng.next() * 0.8);
      if (s.name === 'GREEN' && this._now - s.t0 > STARTUP_LOST) {
        q -= SAT_FLOW * a.lanes * this.armServedShare(p, a.id) * dt;
      }
      this.queues[a.id] = Math.max(0, q);
      total += this.queues[a.id];
      lanes += a.lanes;
    });
    if (this.mode === 'ADAPTIVE' && !this.preempt) this.qAvg = this.qAvg == null ? total : this.qAvg + (total - this.qAvg) * Math.min(1, dt / 300);
    if (this.episode) this.episode.peak = Math.max(this.episode.peak, total);
    if (this.recovery) { this.recovery.acc.sum += total * dt; this.recovery.acc.dt += dt; }
    const live = 0.65 * ctx.profile + 0.35 * Math.min(1, total / (lanes * 8));
    this.congestion = Math.min(1, this.congestion + (live - this.congestion) * Math.min(1, dt / 20));
  }

  totalQueue() { return Object.values(this.queues).reduce((s, q) => s + q, 0); }

  /* ─── Signal state queries ─────────────────────────────── */
  moveState(arm, move) {
    const s = this.stage;
    if (!s || s.name === 'ALLRED') return 'R';
    const served = phaseServes(this.phases[s.phaseId], arm, move);
    if (!served) return 'R';
    return s.name === 'GREEN' ? 'G' : 'A';
  }

  armState(arm) {
    const s = this.stage;
    if (!s || s.name === 'ALLRED') return 'R';
    const served = this.armServedShare(this.phases[s.phaseId], arm) > 0;
    if (!served) return 'R';
    return s.name === 'GREEN' ? 'G' : 'A';
  }

  /** Seconds until `phaseId` (or any phase serving all `moves` from `arm`) could show green. */
  clearanceTime(t, phaseId, arm, moves) {
    const s = this.stage;
    if (!s) return this.T.amber + this.T.allRed;
    const cur = this.phases[s.phaseId];
    const serves = s.phaseId === phaseId || (arm && moves && moves.every((m) => phaseServes(cur, arm, m)));
    if (s.name === 'GREEN') {
      if (serves) return 0;
      const el = t - s.t0;
      const wait = Math.max(0, this.T.minGreen - el, s.ped ? s.ped.clearEnd - t : 0);
      return wait + this.T.amber + this.T.allRed;
    }
    if (s.name === 'AMBER') return this.T.amber - (t - s.t0) + this.T.allRed;
    return Math.max(0, this.T.allRed - (t - s.t0));
  }

  /* ─── Pre-emption commands (called through the SCATS adapter) ─── */
  requestPreempt(t, { requestId, phaseId, arm, moves, vehicleId, priority }) {
    let cur = this.preempt;
    if (cur && (cur.cancelled || cur.state === 'RELEASING')) { this._finishPreempt(t); cur = null; }
    if (cur && cur.requestId === requestId && cur.phaseId === phaseId) return { ok: true, state: cur.state };
    if (cur && cur.requestId !== requestId) {
      // Hand over to another request: close the current one, then transition.
      this.release(t, cur.requestId, `Handed over to ${vehicleId}`);
      this._finishPreempt(t);
    } else if (cur && !cur.cancelled && cur.requestId === requestId && cur.phaseId !== phaseId) {
      if (cur.state === 'WAIT_SAFE' || cur.state === 'CLEARING') {
        cur.phaseId = phaseId;
        cur.corrected = (cur.corrected || 0) + 1;
        this._log('RETARGET', `Request re-targeted to phase ${phaseId}`);
        return { ok: true, state: cur.state };
      }
      // Green on the wrong phase: switch safely via amber/all-red.
      cur.corrected = (cur.corrected || 0) + 1;
      cur.phaseId = phaseId;
      cur.state = 'WAIT_SAFE';
      this._log('RETARGET', `Phase correction to ${phaseId}`);
      return { ok: true, state: cur.state };
    }
    const s = this.stage;
    const rec = {
      requestId, phaseId, arm, moves, vehicleId, priority,
      state: 'WAIT_SAFE', cancelled: false, pedProtect: false, maxHoldHit: false,
      timeline: { requestedAt: t },
      fromPhase: s.phaseId, fromStage: s.name,
    };
    this.preempt = rec;
    if (!this.episode) this.episode = { normal: Math.round(this.qAvg ?? this.totalQueue()), peak: this.totalQueue(), startedAt: t };
    rec.normalQueue = this.episode.normal;
    if (this.recovery) { this.mode = 'PREEMPT'; this.recovery = null; this._served = new Set(); }
    this._log('REQUEST', `Pre-emption requested by ${vehicleId} (${priority}) for phase ${phaseId}`);
    const cur2 = this.phases[s.phaseId];
    if (s.name === 'GREEN' && (s.phaseId === phaseId || (arm && moves.every((m) => phaseServes(cur2, arm, m))))) {
      rec.state = 'GREEN';
      rec.phaseId = s.phaseId;
      rec.alreadyGreen = true;
      rec.timeline.safeAt = t;
      rec.timeline.greenAt = t;
      this.mode = 'PREEMPT';
      this._log('GREEN', `Phase ${s.phaseId} already green: holding`);
    } else if (s.name === 'AMBER' || s.name === 'ALLRED') {
      rec.state = 'CLEARING';
      rec.timeline.safeAt = t;
      if (s.name === 'AMBER') rec.timeline.amberAt = s.t0; else rec.timeline.allRedAt = s.t0;
    }
    return { ok: true, state: rec.state };
  }

  /** Advance notice that an authorised ambulance is approaching (refreshed every tick). */
  notifyApproach(t, { vehicleId, etaS }) {
    this.approach = { until: t + 6, vehicleId, etaS };
    return { ok: true };
  }

  hold(t, requestId) {
    const p = this.preempt;
    if (!p || p.requestId !== requestId) return { ok: false };
    p.lastHoldAt = t;
    return { ok: true, remaining: p.timeline.greenAt != null ? Math.max(0, MAX_HOLD_S - (t - p.timeline.greenAt)) : MAX_HOLD_S };
  }

  release(t, requestId, reason = 'Ambulance cleared junction') {
    const p = this.preempt;
    if (!p || p.requestId !== requestId || p.cancelled || p.state === 'RELEASING') return { ok: false };
    p.releaseReason = reason;
    p.timeline.releasedAt = t;
    if (p.state === 'GREEN') {
      p.state = 'RELEASING';
      this._toAmber(t, null);
      this._startRecovery(t);
      this.stage.next = this._nextNormal();
      this._log('RELEASE', `Released: ${reason}`);
    } else if (p.state === 'WAIT_SAFE') {
      p.cancelled = true;
      this._log('CANCEL', `Request cancelled before transition: ${reason}`);
      this._finishPreempt(t);
    } else if (p.state === 'CLEARING') {
      p.cancelled = true;
      this._startRecovery(t);
      this.stage.next = this._nextNormal();
      this._log('CANCEL', `Request cancelled during clearance: ${reason}`);
    }
    return { ok: true };
  }

  _startRecovery(t) {
    this.mode = 'RECOVERY';
    this._served = new Set();
    this.recovery = { startedAt: t, cycle: 0, queueAtStart: Math.round(this.totalQueue()), acc: { sum: 0, dt: 0 } };
    if (this.preempt) this.preempt.timeline.recoveryStartAt = t;
  }

  _finishPreempt(t) {
    const p = this.preempt;
    if (!p) return;
    p.timeline.closedAt = t;
    p.holdS = p.timeline.greenAt != null ? Math.round(((p.timeline.releasedAt ?? t) - p.timeline.greenAt) * 10) / 10 : 0;
    this.history.unshift(p);
    if (this.history.length > 25) this.history.pop();
    this.preempt = null;
    if (this.mode === 'PREEMPT') this.mode = this.recovery ? 'RECOVERY' : 'ADAPTIVE';
  }

  _log(type, text) {
    if (this.shadow) return;
    const p = this.preempt;
    if (p) (p.events || (p.events = [])).push({ t: this._now, type, text });
    else if (this.history[0] && (type.startsWith('RECOVERY'))) (this.history[0].events || (this.history[0].events = [])).push({ t: this._now, type, text });
    this.onEvent?.({ t: this._now, junctionId: this.j.id, type, text });
  }

  snapshot(t) {
    const s = this.stage;
    if (!s) return null;
    const dur = s.name === 'GREEN' ? s.duration : s.name === 'AMBER' ? this.T.amber : this.T.allRed;
    const p = this.preempt;
    return {
      mode: this.mode,
      phaseId: s.phaseId,
      stage: s.name,
      stageRemaining: Math.max(0, Math.round((dur - (t - s.t0)) * 10) / 10),
      held: Boolean(p && p.state === 'GREEN'),
      ped: s.ped ? (t < s.ped.walkEnd ? 'WALK' : t < s.ped.clearEnd ? 'CLEAR' : 'DONT_WALK') : 'DONT_WALK',
      pedRemaining: s.ped ? Math.max(0, Math.round((s.ped.clearEnd - t) * 10) / 10) : 0,
      queues: Object.fromEntries(Object.entries(this.queues).map(([k, v]) => [k, Math.round(v * 10) / 10])),
      congestion: Math.round(this.congestion * 100) / 100,
      arms: Object.fromEntries(this.arms.map((a) => [a.id, this.armState(a.id)])),
      preempt: p ? {
        requestId: p.requestId, vehicleId: p.vehicleId, priority: p.priority, phaseId: p.phaseId, state: p.state,
        pedProtect: p.pedProtect, timeline: { ...p.timeline }, holdRemaining: p.timeline.greenAt != null ? Math.max(0, MAX_HOLD_S - (t - p.timeline.greenAt)) : null,
      } : null,
      recovery: this.recovery ? { cycle: this.recovery.cycle + 1, of: RECOVERY_CYCLES, queueAtStart: this.recovery.queueAtStart, normalQueue: this.episode?.normal ?? null, peakQueue: this.episode ? Math.round(this.episode.peak) : null } : null,
      totalQueue: Math.round(this.totalQueue()),
      normalQueue: this.qAvg != null ? Math.round(this.qAvg) : null,
      approach: this.approach && this.approach.until > t ? { vehicleId: this.approach.vehicleId } : null,
      pedHeld: this.pedHeld || 0,
    };
  }
}
