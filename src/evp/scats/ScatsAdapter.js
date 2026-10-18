/* SCATS adapter: the only way the EVP decision engine touches traffic
   signals. Swapping SimulatedScatsAdapter for a real implementation is the
   integration point for MBKS's existing SCATS controllers and roadside units.

   Interface (all methods take the junction id used in junctions.json):

     notifyApproach(junctionId, meta)         → AdapterResult
         Advance notice (ETA ≤ 60 s) so the controller holds NEW pedestrian
         calls; a walk already in progress is always allowed to finish.
     requestPhase(junctionId, phaseId, meta)  → AdapterResult
         Ask the controller to move to `phaseId` as soon as it is safe.
         meta = { requestId, vehicleId, priority, arm, moves, etaS }
     holdPhase(junctionId, requestId, holdS)  → AdapterResult
         Keep the granted phase green (re-sent while the ambulance approaches).
         The controller enforces the 45 s maximum regardless.
     release(junctionId, requestId, reason)   → AdapterResult
         End the pre-emption and hand back to SCATS adaptive control.
     getStatus(junctionId)                    → ControllerStatus
         Current mode, phase, stage, queues and pre-emption timeline.
     clearanceTime(junctionId, phaseId, arm, moves) → seconds
         How long a safe transition to `phaseId` would take right now
         (pedestrian protection + min green + amber + all-red).

   AdapterResult = { ok: boolean, state?: string, message?: string }

   The decision engine never waits on these calls: it reads the outcome
   from getStatus() on the next tick, so an asynchronous implementation
   (network round trip to a roadside unit) can return a Promise or fire and
   forget without changing the engine. */

export class ScatsAdapter {
  notifyApproach() { throw new Error('not implemented'); }
  requestPhase() { throw new Error('not implemented'); }
  holdPhase() { throw new Error('not implemented'); }
  release() { throw new Error('not implemented'); }
  getStatus() { throw new Error('not implemented'); }
  clearanceTime() { throw new Error('not implemented'); }
}

/** Drives the simulated junction controllers in-process. */
export class SimulatedScatsAdapter extends ScatsAdapter {
  constructor(controllers, clock) {
    super();
    this.controllers = controllers; // Map junctionId → JunctionController
    this.clock = clock;             // () => sim time in seconds
    this.log = [];                  // recent calls, newest first
    this.listeners = new Set();
  }

  _record(junctionId, call, detail, result) {
    const entry = { t: this.clock(), junctionId, call, detail, ok: result.ok, message: result.message || result.state || '' };
    this.log.unshift(entry);
    if (this.log.length > 300) this.log.pop();
    this.listeners.forEach((fn) => fn(entry));
    return result;
  }

  notifyApproach(junctionId, meta) {
    const c = this.controllers.get(junctionId);
    const res = c ? c.notifyApproach(this.clock(), meta) : { ok: false };
    const key = `${junctionId}:${meta.vehicleId}`;
    if (!this._notified?.has(key)) {
      (this._notified || (this._notified = new Set())).add(key);
      this._record(junctionId, 'notifyApproach', `${meta.vehicleId} ETA ${Math.round(meta.etaS)} s: hold new pedestrian calls`, res);
    }
    return res;
  }

  requestPhase(junctionId, phaseId, meta) {
    const c = this.controllers.get(junctionId);
    if (!c) return this._record(junctionId, 'requestPhase', phaseId, { ok: false, message: 'Unknown junction' });
    const res = c.requestPreempt(this.clock(), { ...meta, phaseId });
    return this._record(junctionId, 'requestPhase', `${phaseId} for ${meta.vehicleId} (${meta.priority}, ETA ${Math.round(meta.etaS ?? 0)} s)`, res);
  }

  holdPhase(junctionId, requestId, holdS) {
    const c = this.controllers.get(junctionId);
    const res = c ? c.hold(this.clock(), requestId, holdS) : { ok: false };
    // Holds are re-sent every few seconds; only log the first.
    if (!this._held?.has(requestId)) {
      (this._held || (this._held = new Set())).add(requestId);
      this._record(junctionId, 'holdPhase', `${requestId} for up to ${Math.round(res.remaining ?? holdS)} s`, res);
    }
    return res;
  }

  release(junctionId, requestId, reason) {
    const c = this.controllers.get(junctionId);
    const res = c ? c.release(this.clock(), requestId, reason) : { ok: false };
    return res.ok ? this._record(junctionId, 'release', `${requestId}: ${reason}`, res) : res;
  }

  getStatus(junctionId) {
    return this.controllers.get(junctionId)?.snapshot(this.clock()) || null;
  }

  clearanceTime(junctionId, phaseId, arm, moves) {
    return this.controllers.get(junctionId)?.clearanceTime(this.clock(), phaseId, arm, moves) ?? 5;
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}

/**
 * Placeholder for the production integration. A real implementation would
 * translate these calls into the SCATS ITS-port / roadside-unit messages
 * agreed with JKR, authenticate to the regional computer, and report the
 * controller's actual phase back through getStatus().
 */
export class RemoteScatsAdapter extends ScatsAdapter {
  constructor({ endpoint, apiKey } = {}) {
    super();
    this.endpoint = endpoint;
    this.apiKey = apiKey;
  }

  _unavailable(call) {
    return { ok: false, message: `${call}: no SCATS/RSU endpoint configured (prototype uses SimulatedScatsAdapter)` };
  }

  notifyApproach() { return this._unavailable('notifyApproach'); }
  requestPhase() { return this._unavailable('requestPhase'); }
  holdPhase() { return this._unavailable('holdPhase'); }
  release() { return this._unavailable('release'); }
  getStatus() { return null; }
  clearanceTime() { return 5; }
}
