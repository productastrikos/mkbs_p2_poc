/* Pre-emption decision engine (SCATS-safe).

   For every junction it looks at the ambulances approaching it and decides,
   each tick:
     • WHICH phase to request: the predicted movement if P ≥ 0.8, otherwise
       a phase covering the two most likely movements;
     • WHEN to request: as soon as  ETA ≤ clearance time + 15 s,  where the
       clearance time comes from the controller (pedestrian protection, min
       green, 3 s amber, 2 s all-red);
     • WHO goes first when requests conflict: higher patient priority, then
       nearest ETA. A vehicle within 4 s of the stop line is never overtaken;
     • WHEN to let go: release once the ambulance clears the junction, or
       cancel if it stops or leaves the route for more than 20 s.
   All signal changes go through the SCATS adapter. */
import { phaseCovering, phaseServes, MOVE_LABEL } from '../junctions.js';
import { PRIORITY_RANK } from '../traffic.js';

export const LEAD_S = 15;
export const PROB_THRESHOLD = 0.8;
export const CANCEL_AFTER_S = 20;
export const NOTICE_S = 60;
const COMMITTED_S = 4;

/** Phase to request for a prediction: { phase, moves, rule }. */
export function choosePhase(junction, arm, probs) {
  const ranked = Object.entries(probs).sort((a, b) => b[1] - a[1]);
  const [top, pTop] = ranked[0];
  if (pTop >= PROB_THRESHOLD) {
    return { phase: phaseCovering(junction, arm, [top]), moves: [top], rule: `P(${MOVE_LABEL[top]}) = ${pTop.toFixed(2)} ≥ 0.8: predicted phase only` };
  }
  const second = ranked[1][0];
  return { phase: phaseCovering(junction, arm, [top, second]), moves: [top, second], rule: `P(${MOVE_LABEL[top]}) = ${pTop.toFixed(2)} < 0.8: phase covering ${MOVE_LABEL[top]} + ${MOVE_LABEL[second]}` };
}

export class DecisionEngine {
  constructor(engine) {
    this.e = engine;
    this.grants = new Map(); // junctionId → { requestId, tripId, phaseId, priority, sentAt }
    this.seq = 0;
    this.stats = { requests: 0, greens: 0, conflicts: 0, cancels: 0, blocked: 0, maxHolds: 0, pedProtect: 0, corrections: 0 };
  }

  /** Candidates (trip, crossing) per junction with a fresh prediction. */
  _candidates() {
    const t = this.e.t;
    const byJ = new Map();
    this.e.activeTrips().forEach((trip) => {
      trip.crossings.forEach((c) => {
        if (c.cancelledAt != null) {
          // A vehicle that stopped and moved off again may request afresh.
          if (c.override === 'CANCEL_STOP' && trip.stoppedSince == null && t - c.cancelledAt > 3 && !c.passed) {
            c.cancelledAt = null;
            c.request = null;
            c.rearmed = (c.rearmed || 0) + 1;
          } else return;
        }
        if (c.passed || !c.pred) return;
        const etaNow = Math.max(0, c.pred.eta - (t - c.pred.t));
        if (etaNow > 180) return;
        if (!byJ.has(c.j)) byJ.set(c.j, []);
        byJ.get(c.j).push({ trip, c, etaNow });
      });
    });
    return byJ;
  }

  tick() {
    const { e } = this;
    const t = e.t;
    const byJ = this._candidates();

    // Release / cancel existing grants.
    for (const [jid, g] of [...this.grants.entries()]) {
      const trip = e.trips.get(g.tripId);
      const c = trip?.crossings.find((x) => x.j === jid && x.requestId === g.requestId);
      if (!trip || !trip.active || !c) { this._release(jid, g, 'Trip ended'); continue; }
      if (c.passed) { this._release(jid, g, 'Ambulance cleared junction'); c.request = 'RELEASED'; continue; }
      if (e.guard.quarantined.has(trip.vehicleId)) { this._cancel(jid, g, c, 'Vehicle quarantined by anomaly guard', 'QUARANTINE'); continue; }
      const distToStop = c.dStop - trip.dEst;
      if (trip.stoppedSince != null && t - trip.stoppedSince > CANCEL_AFTER_S && (distToStop > 30 || c.request === 'GREEN')) {
        this._cancel(jid, g, c, `Ambulance stopped > ${CANCEL_AFTER_S} s`, 'CANCEL_STOP'); continue;
      }
      if (trip.offRouteSince != null && t - trip.offRouteSince > CANCEL_AFTER_S) {
        this._cancel(jid, g, c, `Ambulance diverted from route > ${CANCEL_AFTER_S} s`, 'CANCEL_DIVERT'); continue;
      }
      // Track the controller's actual state.
      const st = e.adapter.getStatus(jid);
      if (st?.preempt?.requestId === g.requestId) {
        if (st.preempt.state === 'GREEN' && c.request !== 'GREEN') {
          c.request = 'GREEN';
          c.greenAt = t;
          c.phase = st.preempt.phaseId;
          this.stats.greens++;
          if (st.preempt.pedProtect && !c.pedProtect) { c.pedProtect = Math.round((st.preempt.timeline.safeAt - st.preempt.timeline.requestedAt) * 10) / 10; this.stats.pedProtect++; }
          e.log('success', `${jid} GREEN for ${trip.vehicleId} (${g.phaseId}), ETA ${Math.round(Math.max(0, c.pred.eta - (t - c.pred.t)))} s`, { junctionId: jid, vehicleId: trip.vehicleId, tripId: trip.id });
        }
        if (c.request === 'GREEN' && (g.lastHold == null || t - g.lastHold >= 5)) { g.lastHold = t; e.adapter.holdPhase(jid, g.requestId, 45); }
      } else if (c.request === 'GREEN' || (c.request === 'SENT' && t - g.sentAt > 2)) {
        // The controller ended it (e.g. 45 s maximum hold).
        const last = e.controllers.get(jid)?.history[0];
        if (last?.requestId === g.requestId && last.maxHoldHit) {
          c.override = 'MAX_HOLD';
          this.stats.maxHolds++;
          e.log('warning', `${jid}: 45 s maximum hold reached for ${trip.vehicleId}; released to SCATS`, { junctionId: jid, vehicleId: trip.vehicleId, tripId: trip.id });
        }
        this.grants.delete(jid);
        c.request = 'RELEASED';
      }
    }

    // New requests, retargets and conflicts.
    for (const [jid, list] of byJ.entries()) {
      const junction = e.junctionsById.get(jid);
      const due = [];
      list.forEach((cand) => {
        const { trip, c } = cand;
        const choice = choosePhase(junction, c.arm, c.pred.probs);
        cand.choice = choice;
        const clearance = e.adapter.clearanceTime(jid, choice.phase.id, c.arm, choice.moves);
        cand.clearance = clearance;
        c.clearance = clearance;
        c.triggerAt = clearance + LEAD_S;
        const active = c.request === 'SENT' || c.request === 'GREEN';
        if (!active && cand.etaNow <= NOTICE_S && !trip.evpSuspended && ['TO_PATIENT', 'TO_HOSPITAL'].includes(trip.status) && !e.guard.quarantined.has(trip.vehicleId)) {
          e.adapter.notifyApproach(jid, { vehicleId: trip.vehicleId, etaS: cand.etaNow });
        }
        if (active || cand.etaNow <= clearance + LEAD_S) {
          if (c.request === 'BLOCKED' || c.request === 'RELEASED' || c.request === 'CANCELLED') return;
          if (e.guard.quarantined.has(trip.vehicleId)) return;
          due.push(cand);
        }
      });
      if (!due.length) continue;
      due.sort((a, b) => (PRIORITY_RANK[b.trip.priority] - PRIORITY_RANK[a.trip.priority]) || (a.etaNow - b.etaNow));
      const g = this.grants.get(jid);
      const holder = g ? due.find((d) => d.trip.id === g.tripId) : null;
      let winner = due[0];
      if (holder && holder !== winner && holder.etaNow <= COMMITTED_S) winner = holder; // never overtake a committed vehicle

      if (!g || !holder) {
        this._send(jid, winner);
      } else if (holder === winner) {
        this._maybeRetarget(jid, winner, g);
      } else {
        // Higher-priority (or nearer, same-priority) vehicle takes over.
        const compatible = winner.choice.moves.every((m) => phaseServes(junction.phases.find((p) => p.id === g.phaseId), winner.c.arm, m));
        if (!compatible) {
          holder.c.request = 'YIELDING';
          holder.c.conflict = true;
          winner.c.conflict = true;
          this.stats.conflicts++;
          e.log('warning', `Conflict at ${jid}: ${winner.trip.vehicleId} (${winner.trip.priority}, ETA ${Math.round(winner.etaNow)} s) granted before ${holder.trip.vehicleId} (${holder.trip.priority}, ETA ${Math.round(holder.etaNow)} s)`, { junctionId: jid, vehicleId: winner.trip.vehicleId });
          this.grants.delete(jid);
          this._send(jid, winner, `priority over ${holder.trip.vehicleId}`);
        }
      }
      // Everyone else at this junction waits (or shares a compatible green).
      const grant = this.grants.get(jid);
      due.forEach((d) => {
        if (!grant || d.trip.id === grant.tripId) return;
        const phase = junction.phases.find((p) => p.id === grant.phaseId);
        const shares = d.choice.moves.every((m) => phaseServes(phase, d.c.arm, m));
        if (shares) { d.c.shared = grant.requestId; return; }
        if (d.c.request !== 'YIELDING') {
          d.c.request = 'YIELDING';
          d.c.conflict = true;
          d.c.yieldTo = grant.vehicleId;
          this.stats.conflicts++;
          e.log('warning', `Conflict at ${jid}: ${d.trip.vehicleId} (${d.trip.priority}) holds for ${grant.vehicleId} (${grant.priority})`, { junctionId: jid, vehicleId: d.trip.vehicleId });
        }
      });
    }
  }

  _send(jid, cand, why) {
    const { e } = this;
    const { trip, c, choice } = cand;
    const auth = e.guard.checkRequest({ obuId: trip.obuId, t: e.t, junctionId: jid, lat: trip.lastFix?.lat, lng: trip.lastFix?.lng }, trip);
    if (!auth.ok) {
      c.request = 'BLOCKED';
      c.override = 'BLOCKED';
      this.stats.blocked++;
      if (!auth.silent) e.log('danger', `${jid}: request from ${trip.vehicleId} blocked (${auth.reason})`, { junctionId: jid, vehicleId: trip.vehicleId, tripId: trip.id });
      return;
    }
    const requestId = `R${++this.seq}`;
    c.requestId = requestId;
    c.request = 'SENT';
    c.requestAt = e.t;
    c.phase = choice.phase.id;
    c.phaseRule = choice.rule;
    c.requestedMoves = choice.moves;
    this.grants.set(jid, { requestId, tripId: trip.id, vehicleId: trip.vehicleId, priority: trip.priority, phaseId: choice.phase.id, sentAt: e.t });
    this.stats.requests++;
    e.adapter.requestPhase(jid, choice.phase.id, { requestId, vehicleId: trip.vehicleId, priority: trip.priority, arm: c.arm, moves: choice.moves, etaS: cand.etaNow });
    e.log('info', `${jid}: requested phase ${choice.phase.id} for ${trip.vehicleId}, ETA ${Math.round(cand.etaNow)} s ≤ clearance ${cand.clearance.toFixed(0)} s + ${LEAD_S} s${why ? ` (${why})` : ''}`, { junctionId: jid, vehicleId: trip.vehicleId, tripId: trip.id });
  }

  _maybeRetarget(jid, cand, g) {
    const { c, choice, trip } = cand;
    if (choice.phase.id === g.phaseId) return;
    const junction = this.e.junctionsById.get(jid);
    const current = junction.phases.find((p) => p.id === g.phaseId);
    if (c.request === 'GREEN') {
      // Keep a granted green while it still serves the most likely movement.
      if (phaseServes(current, c.arm, choice.moves[0])) return;
    } else if (choice.moves.every((m) => phaseServes(current, c.arm, m))) {
      return; // the pending request already covers what is needed
    }
    g.phaseId = choice.phase.id;
    c.phase = choice.phase.id;
    c.phaseRule = choice.rule;
    this.stats.corrections++;
    if (c.request === 'GREEN') c.override = 'PHASE_CORRECTION';
    this.e.adapter.requestPhase(jid, choice.phase.id, { requestId: g.requestId, vehicleId: trip.vehicleId, priority: trip.priority, arm: c.arm, moves: choice.moves, etaS: cand.etaNow });
    this.e.log('info', `${jid}: request for ${trip.vehicleId} updated to phase ${choice.phase.id} (${choice.rule})`, { junctionId: jid, vehicleId: trip.vehicleId });
  }

  _release(jid, g, reason) {
    this.e.adapter.release(jid, g.requestId, reason);
    this.grants.delete(jid);
    this.e.log('info', `${jid}: released by ${g.vehicleId}: ${reason}. SCATS recovery started`, { junctionId: jid, vehicleId: g.vehicleId });
  }

  _cancel(jid, g, c, reason, code) {
    this.e.adapter.release(jid, g.requestId, reason);
    this.grants.delete(jid);
    c.request = 'CANCELLED';
    c.cancelledAt = this.e.t;
    c.override = code;
    this.stats.cancels++;
    this.e.log('warning', `${jid}: request from ${g.vehicleId} cancelled: ${reason}`, { junctionId: jid, vehicleId: g.vehicleId });
  }

  /** Drop every grant held by a vehicle (quarantine). */
  cancelVehicle(vehicleId, reason) {
    for (const [jid, g] of [...this.grants.entries()]) {
      if (g.vehicleId !== vehicleId) continue;
      const trip = this.e.trips.get(g.tripId);
      const c = trip?.crossings.find((x) => x.requestId === g.requestId);
      if (c) this._cancel(jid, g, c, reason, 'QUARANTINE'); else this._release(jid, g, reason);
    }
  }
}
