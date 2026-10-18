/* GreenLight EVP simulation engine.

   Pipeline, mirroring MBKS's three-part architecture:
     1. Vehicle + OBU      ambulances drive real Kuching South roads; the
                           tablet's START opens a trip and the OBU sends a
                           GPS fix every 2 s.
     2. Cloud GIS          each fix passes the authorisation & anomaly guard,
                           is map-matched to the route, and the ETA and
                           movement models are re-run for upcoming junctions.
     3. Roadside / SCATS   the decision engine requests, holds and releases
                           phases through the SCATS adapter.

   The same engine runs headless in Node to generate the historical trips
   (with the v0 heuristic models) and live in the browser (with the trained
   models), so the models learn from the physics they will predict. */
import { spanAt } from '../network.js';
import { analyseRoute, MOVES } from '../junctions.js';
import { JunctionController } from '../scats/controller.js';
import { SimulatedScatsAdapter } from '../scats/ScatsAdapter.js';
import { Guard, ALERT_TYPES } from './guard.js';
import { DecisionEngine, LEAD_S } from './decision.js';
import { Rng } from '../rng.js';
import { DYN, cruiseSpeed, brakingEnvelope, nextLane, headingOffset, localParts, profileCongestion, STATUS } from '../traffic.js';
import { distance, bearing, angleDiff, project, unproject } from '../geo.js';

export const FIX_INTERVAL_S = 2;
const OBS_DISTANCES = [400, 300, 220, 160, 100, 60, 30];
const IDLE_FUEL_LPH = 1.6;      // diesel van idling
const STOP_START_L = 0.02;      // extra fuel per avoided stop
const r1 = (x) => Math.round(x * 10) / 10;

export class SimEngine {
  /**
   * data   = { network: RoadNetwork, junctions, hospitals, places, bases, ambulances }
   * models = { eta, movement, anomaly }
   */
  constructor({ data, models, seed = 1, startMs = Date.now(), recordFixes = false, mode = 'live' }) {
    this.data = data;
    this.net = data.network;
    this.models = models;
    this.mode = mode;
    this.rng = new Rng(seed);
    this.epoch = startMs;
    this.t = 0;
    this.rain = false;
    this.recordFixes = recordFixes;
    this.fixLog = [];
    this.junctionsById = new Map(data.junctions.map((j) => [j.id, j]));
    this.hospitalsById = new Map(data.hospitals.map((h) => [h.id, h]));
    this.placesById = new Map([...data.places, ...data.bases].map((p) => [p.id, p]));
    this.controllers = new Map();
    this.shadows = new Map();
    data.junctions.forEach((j, i) => {
      const c = new JunctionController(j, { rng: new Rng(seed * 101 + i) });
      c.onEvent = (ev) => this._onSignalEvent(ev);
      this.controllers.set(j.id, c);
      this.shadows.set(j.id, new JunctionController(j, { rng: new Rng(seed * 101 + i), shadow: true }));
    });
    this.adapter = new SimulatedScatsAdapter(this.controllers, () => this.t);
    this.alerts = [];
    this.guard = new Guard({ registry: data.ambulances, network: this.net, anomalyModel: models.anomaly, onAlert: (a) => this._onAlert(a) });
    this.decision = new DecisionEngine(this);
    this.vehicles = new Map();
    data.ambulances.forEach((a) => {
      const base = this.placesById.get(a.base);
      this.vehicles.set(a.id, { id: a.id, amb: a, node: base.node, lat: base.lat, lng: base.lng, heading: 0, v: 0, trip: null, location: base.name });
    });
    this.trips = new Map();
    this.completed = [];
    this.events = [];
    this.ghosts = [];
    this.pendingBaseline = [];
    this.tripSeq = 0;
    this.eventSeq = 0;
    this.costCache = new Map();
    this.armExits = this._computeArmExits();
    this.onTripComplete = null;
    this.onAlert = null;
    this.timers = [];
  }

  /** Run fn after `seconds` of simulated time. */
  after(seconds, fn) { this.timers.push({ at: this.t + seconds, fn }); }

  /** Move an idle ambulance to a graph node (e.g. the patient pickup point). */
  placeVehicle(vehicleId, node, name) {
    const veh = this.vehicles.get(vehicleId);
    if (!veh || veh.trip) return false;
    const [lat, lng] = this.net.nodes[node];
    Object.assign(veh, { node, lat, lng, location: name });
    return true;
  }

  get now() { return this.epoch + this.t * 1000; }

  activeTrips() { return [...this.trips.values()].filter((tr) => tr.active); }

  log(level, text, meta = {}) {
    const ev = { id: ++this.eventSeq, t: this.t, time: this.now, level, text, ...meta };
    this.events.unshift(ev);
    if (this.events.length > 400) this.events.pop();
    if (meta.tripId && this.trips.get(meta.tripId)) this.trips.get(meta.tripId).events.push(ev);
    return ev;
  }

  /* ─── Geometry precomputation ───────────────────────────── */
  _computeArmExits() {
    const out = new Map();
    const { net } = this;
    this.data.junctions.forEach((j) => {
      const exits = {};
      const best = {};
      const seen = new Map();
      const queue = j.nodeIds.map((n) => [n, 0]);
      j.nodeIds.forEach((n) => seen.set(n, 0));
      while (queue.length) {
        const [n, acc] = queue.shift();
        for (const eid of net.out[n]) {
          const e = net.edges[eid];
          const nd = acc + e.len;
          if (nd > 180 || (seen.has(e.to) && seen.get(e.to) <= nd)) continue;
          seen.set(e.to, nd);
          const [la, ln] = net.nodes[e.to];
          const dc = distance(j.lat, j.lng, la, ln);
          if (dc >= j.radius + 8) {
            const b = bearing(j.lat, j.lng, la, ln);
            const arm = j.arms.find((a) => Math.abs(angleDiff(a.bearing, b)) < 32);
            if (arm && (best[arm.id] == null || nd < best[arm.id])) { best[arm.id] = nd; exits[arm.id] = e.to; }
            continue;
          }
          queue.push([e.to, nd]);
        }
      }
      out.set(j.id, exits);
    });
    return out;
  }

  _costsTo(node) {
    if (!this.costCache.has(node)) {
      if (this.costCache.size > 40) this.costCache.clear();
      this.costCache.set(node, this.net.costsTo(node));
    }
    return this.costCache.get(node);
  }

  /** Route record with polyline and junction crossings. */
  _buildRoute(path) {
    const { line, spans } = this.net.buildPolyline(path.edges);
    const crossings = analyseRoute(path, line, spans, this.data.junctions);
    return { ...path, line, spans, crossings };
  }

  /** Best alternative movement and its relative cost gap for each crossing. */
  _annotateAlternatives(route, destNode) {
    const costs = this._costsTo(destNode);
    let prev = null;
    route.crossings.forEach((c) => {
      const j = this.junctionsById.get(c.junctionId);
      const exits = this.armExits.get(j.id);
      const moves = j.movements[c.fromArm] || {};
      const exitCost = (armId) => {
        const node = exits[armId];
        if (node == null || !Number.isFinite(costs[node])) return Infinity;
        const [la, ln] = this.net.nodes[node];
        return costs[node] + distance(j.lat, j.lng, la, ln) / 8;
      };
      const planned = exitCost(moves[c.move]) < Infinity ? exitCost(moves[c.move]) : route.time * 0.5;
      let alt = null;
      let altCost = Infinity;
      Object.entries(moves).forEach(([m, armId]) => {
        if (m === c.move || m === 'U') return;
        const cost = exitCost(armId) + (m === 'R' ? 12 : m === 'L' ? 6 : 0);
        if (cost < altCost) { altCost = cost; alt = m; }
      });
      c.alt = alt;
      c.gap = alt ? Math.max(0, (altCost - planned) / Math.max(60, planned)) : 1;
      c.prev = prev;
      prev = c.move;
    });
  }

  /* ─── Trips ──────────────────────────────────────────────── */
  /**
   * Start a trip (the crew pressed START on the tablet).
   *   opts = { vehicleId, status, priority, destination: { type: 'hospital'|'place', id },
   *            originNode?, originName?, startOffset?, allowDeviation?, crew? }
   */
  startTrip(opts) {
    const veh = this.vehicles.get(opts.vehicleId);
    if (!veh) throw new Error(`Unknown vehicle ${opts.vehicleId}`);
    if (veh.trip) throw new Error(`${veh.id} already has an active trip`);
    const dest = opts.destination.type === 'hospital' ? this.hospitalsById.get(opts.destination.id) : this.placesById.get(opts.destination.id);
    if (!dest) throw new Error('Unknown destination');
    const originNode = opts.originNode ?? veh.node;
    const path = this.net.route(originNode, dest.node);
    if (!path || !path.edges.length) throw new Error('No route to destination');
    let route = this._buildRoute(path);
    this._annotateAlternatives(route, dest.node);
    let deviation = null;
    if (opts.allowDeviation) {
      const res = this._maybeDeviate(route, dest.node);
      if (res) { route = res.route; deviation = res.deviation; }
    }
    const t0 = this.t;
    const trip = {
      id: opts.id || `TRIP-${String(++this.tripSeq).padStart(3, '0')}`,
      vehicleId: veh.id,
      obuId: veh.amb.obuId,
      status: opts.status,
      statusLabel: STATUS[opts.status] || opts.status,
      priority: opts.priority,
      crew: opts.crew || null,
      origin: { node: originNode, name: opts.originName || veh.location },
      destination: { ...opts.destination, name: dest.name, short: dest.short || dest.name, node: dest.node },
      start: this.now,
      t0,
      startOffset: opts.startOffset || 0,
      rain: this.rain,
      active: true,
      route,
      physRoute: route,
      routeVersion: 1,
      crossings: this._crossingsFor(route, deviation),
      dEst: opts.startOffset || 0,
      lastFix: null,
      lastSpeed: 0,
      stoppedSince: null,
      offRouteSince: null,
      trace: [],
      events: [],
      anomalies: [],
      overrides: [],
      deviation,
    };
    this.trips.set(trip.id, trip);
    Object.assign(veh, {
      trip, d: trip.startOffset, v: opts.startOffset ? 8 : 0, lane: this.rng.pick(['L', 'C', 'R']),
      ou: 1, driver: Math.max(0.85, Math.min(1.15, this.rng.normal(1, 0.06))), holdUntil: 0, stopUntil: 0,
      nextFixAt: this.t + this.rng.float(0, FIX_INTERVAL_S), nextLaneAt: this.t + 2, spoof: null,
    });
    const jList = trip.crossings.map((c) => c.j).join(', ') || 'none';
    this.log('info', `${veh.id} START: ${trip.statusLabel}, ${trip.priority}, to ${trip.destination.name}. Route ${(route.length / 1000).toFixed(1)} km via ${trip.crossings.length} EVP junctions (${jList})`, { tripId: trip.id, vehicleId: veh.id });
    return trip;
  }

  _crossingsFor(route, deviation) {
    return route.crossings.map((c) => {
      const j = this.junctionsById.get(c.junctionId);
      const arm = j.arms.find((a) => a.id === c.fromArm);
      const dev = deviation && deviation.j === c.junctionId && Math.abs(deviation.dStop - c.dStop) < 30;
      return {
        j: c.junctionId, dStop: c.dStop, dCenter: c.dCenter, dExit: c.dExit, arm: c.fromArm, toArm: c.toArm,
        move: c.move, pmv: dev ? deviation.planned : c.move, alt: dev ? c.move : c.alt, gap: dev ? deviation.gap : c.gap,
        prev: c.prev ?? null, lanes: arm?.lanes || 2, approachBearing: route.line.bearingBetween(c.dStop - 45, c.dStop),
        passed: false, request: null, pred: null, preds: [], obs: [], obsIdx: 0, wait: 0, cg: null,
      };
    });
  }

  /** Historical generator only: drivers sometimes take a near-equal alternative. */
  _maybeDeviate(route, destNode) {
    for (const c of route.crossings) {
      if (!c.alt) continue;
      const p = 0.02 + 0.3 * Math.exp(-c.gap / 0.05);
      if (!this.rng.chance(p)) continue;
      const j = this.junctionsById.get(c.junctionId);
      const exitNode = this.armExits.get(j.id)[j.movements[c.fromArm][c.alt]];
      if (exitNode == null) continue;
      const nodeDist = route.nodes.map((_, i) => (i === 0 ? 0 : route.spans[i - 1].d1));
      let k = 0;
      while (k + 1 < route.nodes.length && nodeDist[k + 1] <= c.dStop - 5 && !j.nodeIds.includes(route.nodes[k + 1])) k++;
      const mid = this.net.route(route.nodes[k], exitNode);
      const rest = this.net.route(exitNode, destNode);
      if (!mid || !rest) continue;
      const edges = [...route.edges.slice(0, k), ...mid.edges, ...rest.edges];
      const alt = this._buildRoute(this.net.pathFromEdges(edges));
      const hit = alt.crossings.find((x) => x.junctionId === c.junctionId && Math.abs(x.dStop - c.dStop) < 30);
      if (!hit || hit.move !== c.alt) continue;
      this._annotateAlternatives(alt, destNode);
      return { route: alt, deviation: { j: c.junctionId, dStop: hit.dStop, planned: c.move, actual: c.alt, gap: c.gap } };
    }
    return null;
  }

  endTrip(tripId, reason = 'Ended by crew') {
    const trip = this.trips.get(tripId);
    if (trip?.active) this._completeTrip(trip, reason);
  }

  /* ─── Main loop ─────────────────────────────────────────── */
  step(dt) {
    this.t += dt;
    const lp = localParts(this.now);
    const pedProb = lp.hour >= 7 && lp.hour <= 21 ? 0.6 : 0.2;
    this.data.junctions.forEach((j) => {
      const ctx = { profile: profileCongestion(j, lp.hourFloat, lp.dow, this.rain), pedProb };
      this.controllers.get(j.id).step(this.t, dt, ctx);
      this.shadows.get(j.id).step(this.t, dt, ctx);
    });
    for (const veh of this.vehicles.values()) {
      if (!veh.trip) continue;
      this._stepVehicle(veh, dt);
      if (this.t >= veh.nextFixAt && veh.trip) {
        veh.nextFixAt += FIX_INTERVAL_S;
        this._emitFix(veh);
      }
    }
    this.decision.tick();
    this._resolveBaselines();
    if (this.timers.length) {
      const due = this.timers.filter((x) => x.at <= this.t);
      this.timers = this.timers.filter((x) => x.at > this.t);
      due.forEach((x) => x.fn());
    }
    this.ghosts = this.ghosts.filter((g) => this.t - g.t < 90);
  }

  _resolveBaselines() {
    this.pendingBaseline = this.pendingBaseline.filter((p) => {
      const st = this.shadows.get(p.c.j).moveState(p.c.arm, p.c.move);
      if (st === 'G' || this.t - p.t > 150) { p.c.baseWait = r1(this.t - p.t + (st === 'G' ? 2 : 0)); return false; }
      return true;
    });
  }

  _stepVehicle(veh, dt) {
    const trip = veh.trip;
    const route = trip.physRoute;
    const { t } = this;
    const span = spanAt(route.spans, veh.d);
    const crossings = trip.physCrossings || trip.crossings;
    const next = crossings.find((c) => veh.d < c.dExit);
    const cong = next && next.dStop - veh.d < 500 ? this.controllers.get(next.j).congestion : 0.35;
    veh.ou += -0.12 * (veh.ou - 1) * dt + 0.05 * Math.sqrt(dt) * this.rng.normal();
    veh.ou = Math.max(0.78, Math.min(1.18, veh.ou));
    const cruise = cruiseSpeed(span.edge.speed, { priority: trip.priority, congestion: cong, rain: this.rain, driver: veh.driver }) * veh.ou;
    let target = cruise;

    for (const c of crossings) {
      if (veh.d >= c.dExit) continue;
      if (veh.d >= c.dStop - 0.5) { target = Math.min(target, DYN.junctionSpeed[c.move] + 2); break; }
      const gap = c.dStop - DYN.stopGap - veh.d;
      if (gap > 350) break;
      const state = this.controllers.get(c.j).moveState(c.arm, c.move);
      const brakeDist = (veh.v * veh.v) / (2 * DYN.hardBrake);
      const mustStop = state === 'R' ? brakeDist < gap + DYN.stopGap + 1 : state === 'A' && (veh.v * veh.v) / (2 * DYN.brake) < gap;
      if (mustStop) { target = Math.min(target, gap < 0.3 ? 0 : brakingEnvelope(gap, 0)); break; }
      target = Math.min(target, brakingEnvelope(c.dStop - veh.d, DYN.junctionSpeed[c.move]));
      break;
    }
    target = Math.min(target, brakingEnvelope(route.length - veh.d - 2, 0));
    if (veh.holdUntil > t) target = Math.min(target, 2.5);
    if (veh.stopUntil > t) target = 0;
    else if (this.rng.next() < (veh.v * dt / 2600) * (0.4 + cong)) veh.holdUntil = t + this.rng.float(4, 12);

    if (target > veh.v) veh.v = Math.min(target, veh.v + DYN.accel * dt);
    else veh.v = Math.max(target, veh.v - DYN.hardBrake * dt);
    if (veh.v < 0.05 && target === 0) veh.v = 0;
    veh.d = Math.min(route.length, veh.d + veh.v * dt);
    const [lat, lng] = route.line.at(veh.d);
    veh.lat = lat; veh.lng = lng;
    veh.heading = route.line.headingAt(veh.d);

    // Ground truth at each junction: arrival, waiting, passing.
    const tRel = t - trip.t0;
    crossings.forEach((c) => {
      if (c.passed) return;
      const toStop = c.dStop - veh.d;
      if (c.arrival == null && (toStop <= 3 || (veh.v < 0.5 && toStop < 60 && toStop > 0))) {
        c.arrival = r1(tRel);
        c.arrivalAbs = t;
        const shadow = this.shadows.get(c.j).moveState(c.arm, c.move);
        if (shadow === 'G') c.baseWait = 0; else this.pendingBaseline.push({ c, t });
      }
      if (toStop > 0 && toStop < 80 && veh.v < 1.5) c.wait += dt;
      if (c.pass == null && veh.d >= c.dStop) c.pass = r1(tRel);
      if (veh.d >= c.dExit) c.passed = true;
    });

    if (t >= veh.nextLaneAt) {
      veh.nextLaneAt = t + 2;
      if (next) veh.lane = nextLane(veh.lane, next.move, next.dStop - veh.d, this.rng);
    }
    if (veh.d >= route.length - 2.5 && veh.v < 0.3) this._completeTrip(trip, 'Arrived at destination');
  }

  /* ─── OBU → cloud ───────────────────────────────────────── */
  _emitFix(veh) {
    const trip = veh.trip;
    const route = trip.physRoute;
    const crossings = trip.physCrossings || trip.crossings;
    let heading = route.line.headingAt(veh.d);
    const next = crossings.find((c) => veh.d < c.dStop);
    if (next && next.dStop - veh.d < 45) heading += headingOffset(next.move, next.dStop - veh.d, this.rng);
    else heading += this.rng.normal(0, 3);
    let [x, y] = project(veh.lat, veh.lng);
    x += this.rng.normal(0, 3.5);
    y += this.rng.normal(0, 3.5);
    if (veh.spoof) { x += veh.spoof.dx; y += veh.spoof.dy; veh.spoof = null; }
    const [lat, lng] = unproject(x, y);
    const fix = {
      obuId: veh.amb.obuId, vehicleId: veh.id, plate: veh.amb.plate, t: this.t, lat, lng,
      speed: Math.max(0, veh.v + this.rng.normal(0, 0.25)), heading: (heading + 360) % 360, lane: veh.lane, tripId: trip.id,
    };
    this._onFix(fix, trip);
  }

  _onFix(fix, trip) {
    const { t } = this;
    const g = this.guard.checkFix(fix, trip);
    if (this.recordFixes && g.features) this.fixLog.push(g.features.map((v) => Math.round(v * 100) / 100));
    const jumped = g.alerts.some((a) => a.type === ALERT_TYPES.SPEED_JUMP || a.type === ALERT_TYPES.OFF_ROAD);
    if (g.alerts.length) {
      trip.anomalies.push(...g.alerts.map((a) => ({ t: r1(t - trip.t0), type: a.type, detail: a.detail })));
      if (!trip.evpSuspended) {
        trip.evpSuspended = true;
        this.decision.cancelVehicle(trip.vehicleId, `Anomaly guard: ${g.alerts[0].type}`);
      }
    }
    if (jumped) return; // never track on a spoofed position
    const dt = trip.lastFix ? Math.max(0.5, fix.t - trip.lastFix.t) : FIX_INTERVAL_S;
    const accel = trip.lastFix ? (fix.speed - trip.lastSpeed) / dt : 0;
    trip.lastFix = fix;
    trip.lastSpeed = fix.speed;

    const line = trip.route.line;
    const loc = line.locate(fix.lat, fix.lng, trip.dEst - 60, trip.dEst + 450);
    if (loc.off > 35) trip.offRouteSince = trip.offRouteSince ?? t;
    else { trip.offRouteSince = null; trip.dEst = loc.d; }
    trip.stoppedSince = fix.speed < 0.6 ? trip.stoppedSince ?? t : null;
    if (trip.offRouteSince != null && t - trip.offRouteSince > 20 && trip.physRoute !== trip.route) this._adoptPhysicalRoute(trip);
    trip.trace.push([Math.round(t - trip.t0), Math.round(trip.dEst), Math.round(fix.speed * 10)]);

    const lp = localParts(this.now);
    let first = true;
    for (const c of trip.crossings) {
      const dist = c.dStop - trip.dEst;
      if (c.passed || dist <= 0) continue;
      if (dist > 1500) break;
      const ctrl = this.controllers.get(c.j);
      if (c.cg == null && dist < 600) c.cg = Math.round(ctrl.congestion * 100) / 100;
      const e = this.models.eta.predict({
        distance: dist, speed: fix.speed, accel, hour: lp.hourFloat, dow: lp.dow, rain: this.rain,
        congestion: ctrl.congestion, lanes: c.lanes, status: trip.status,
      });
      const j = this.junctionsById.get(c.j);
      const available = Object.keys(j.movements[c.arm] || {}).filter((m) => MOVES.includes(m));
      const hdg = angleDiff(c.approachBearing, fix.heading);
      const probs = this.models.movement.predict({ planned: c.pmv, alt: c.alt, gap: c.gap, lane: first ? fix.lane : 'C', dist, heading: hdg, prev: c.prev }, available);
      c.pred = { t, eta: e.eta, lo: e.lo, hi: e.hi, probs, dist };
      if (c.preds.length < 120) c.preds.push([r1(t - trip.t0), r1(e.eta), r1(e.lo), r1(e.hi), Math.round(dist)]);
      if (first) {
        while (c.obsIdx < OBS_DISTANCES.length && dist <= OBS_DISTANCES[c.obsIdx]) {
          c.obs.push([OBS_DISTANCES[c.obsIdx], fix.lane, Math.round(hdg)]);
          c.obsIdx++;
        }
      }
      first = false;
    }
  }

  /** After a diversion the tablet re-routes; the cloud adopts the new route. */
  _adoptPhysicalRoute(trip) {
    const fresh = trip.physCrossings;
    trip.crossings.forEach((c) => {
      if (c.passed || fresh.includes(c)) return;
      const g = this.decision.grants.get(c.j);
      if (g && g.requestId === c.requestId) this.decision._cancel(c.j, g, c, 'Ambulance diverted from route > 20 s', 'CANCEL_DIVERT');
      trip.overrides.push({ j: c.j, code: 'CANCEL_DIVERT', t: r1(this.t - trip.t0) });
    });
    trip.route = trip.physRoute;
    trip.crossings = fresh;
    trip.physCrossings = null;
    trip.routeVersion++;
    trip.offRouteSince = null;
    const veh = this.vehicles.get(trip.vehicleId);
    trip.dEst = veh.d;
    this.log('info', `${trip.vehicleId}: route updated after diversion (${trip.crossings.filter((c) => !c.passed).length} EVP junctions ahead)`, { tripId: trip.id, vehicleId: trip.vehicleId });
  }

  _completeTrip(trip, reason) {
    if (!trip.active) return;
    trip.active = false;
    const veh = this.vehicles.get(trip.vehicleId);
    if (trip.physCrossings) this._adoptPhysicalRoute(trip);
    // Release anything still held.
    for (const [jid, g] of [...this.decision.grants.entries()]) {
      if (g.tripId === trip.id) this.decision._release(jid, g, 'Trip ended');
    }
    this.pendingBaseline = this.pendingBaseline.filter((p) => {
      if (!trip.crossings.includes(p.c)) return true;
      p.c.baseWait = r1(this.t - p.t);
      return false;
    });
    const duration = r1(this.t - trip.t0);
    const junctions = trip.crossings.filter((c) => c.arrival != null).map((c) => {
      const greenLead = c.greenAt != null && c.arrivalAbs != null ? r1(c.arrivalAbs - c.greenAt) : null;
      const errors = c.preds.filter(([tp]) => tp < c.arrival).map(([tp, eta]) => Math.abs(eta - (c.arrival - tp)));
      return {
        j: c.j, dStop: Math.round(c.dStop), arm: c.arm, move: c.move, pmv: c.pmv, alt: c.alt, gap: Math.round(c.gap * 1000) / 1000,
        prev: c.prev, lanes: c.lanes, cg: c.cg ?? Math.round(this.controllers.get(c.j).congestion * 100) / 100,
        arrival: c.arrival, pass: c.pass ?? c.arrival, wait: r1(c.wait), baseWait: c.baseWait ?? 0,
        preempted: c.greenAt != null && (greenLead == null || greenLead >= -1),
        greenLead, requestAt: c.requestAt != null ? r1(c.requestAt - trip.t0) : null, phase: c.phase || null,
        phaseRule: c.phaseRule || null, conflict: Boolean(c.conflict), yieldTo: c.yieldTo || null,
        pedProtect: c.pedProtect || 0, override: c.override || null, obs: c.obs,
        etaMae: errors.length ? r1(errors.reduce((s, x) => s + x, 0) / errors.length) : null,
        preds: c.preds,
      };
    });
    const waits = junctions.reduce((s, c) => s + c.wait, 0);
    const baseWaits = junctions.reduce((s, c) => s + c.baseWait, 0);
    const avoidedStops = junctions.filter((c) => c.baseWait > 2 && c.wait < 1).length;
    const idleSaved = Math.max(0, baseWaits - waits);
    const record = {
      id: trip.id, ambulanceId: trip.vehicleId, start: trip.start, status: trip.status, priority: trip.priority,
      rain: trip.rain, origin: trip.origin.name, destination: trip.destination.id, destinationName: trip.destination.name,
      destinationType: trip.destination.type, route: trip.route.nodes, length: Math.round(trip.route.length - trip.startOffset),
      duration, baseline: r1(duration - waits + baseWaits), saved: r1(baseWaits - waits),
      conflictsAvoided: avoidedStops, idleSavedS: Math.round(idleSaved),
      fuelSavedL: Math.round(((idleSaved / 3600) * IDLE_FUEL_LPH + avoidedStops * STOP_START_L) * 1000) / 1000,
      junctions, trace: trip.trace, anomalies: trip.anomalies, overrides: [...trip.overrides, ...junctions.filter((c) => c.override).map((c) => ({ j: c.j, code: c.override }))],
      deviation: trip.deviation, endReason: reason, source: this.mode === 'live' ? 'live' : 'history',
      events: trip.events.map((e) => ({ t: r1(e.t - trip.t0), level: e.level, text: e.text })),
      models: { eta: this.models.eta.version ?? 0, movement: this.models.movement.version ?? 0 },
    };
    trip.record = record;
    veh.trip = null;
    veh.v = 0;
    veh.node = trip.route.nodes[trip.route.nodes.length - 1];
    veh.location = trip.destination.name;
    this.completed.unshift(record);
    this.trips.delete(trip.id);
    this.log('success', `${trip.vehicleId} arrived at ${trip.destination.short} (${reason}): ${Math.round(duration)} s, ${Math.round(record.saved)} s saved vs no-EVP baseline`, { vehicleId: trip.vehicleId });
    this.onTripComplete?.(record);
    return record;
  }

  _onSignalEvent(ev) {
    if (ev.type === 'PED_PROTECT') this.log('warning', `${ev.junctionId}: pedestrian crossing in progress, EVP transition waits for clearance`, { junctionId: ev.junctionId });
    if (ev.type === 'RECOVERY_END') this.log('success', `${ev.junctionId}: queues cleared, SCATS adaptive control resumed`, { junctionId: ev.junctionId });
  }

  _onAlert(alert) {
    alert.time = this.epoch + alert.t * 1000;
    this.alerts.unshift(alert);
    if (this.alerts.length > 200) this.alerts.pop();
    this.log(alert.severity === 'danger' ? 'danger' : 'warning', `SECURITY: ${alert.type}. ${alert.detail}. ${alert.action}`, { vehicleId: alert.vehicleId, junctionId: alert.junctionId });
    this.onAlert?.(alert);
  }

  /* ─── Operator & demo actions ───────────────────────────── */
  setRain(on) { this.rain = Boolean(on); this.log('info', `Weather set to ${on ? 'rain' : 'dry'}`); }

  /** Make the vehicle turn off its route before the next EVP junction. */
  divert(vehicleId) {
    const veh = this.vehicles.get(vehicleId);
    const trip = veh?.trip;
    if (!trip) return false;
    const route = trip.physRoute;
    const c = trip.crossings.find((x) => !x.passed && x.dStop - veh.d > 120);
    if (!c) return false;
    const j = this.junctionsById.get(c.j);
    const nodeDist = route.nodes.map((_, i) => (i === 0 ? 0 : route.spans[i - 1].d1));
    let k = nodeDist.findIndex((d) => d > veh.d + 25);
    if (k < 0 || nodeDist[k] > c.dStop) return false;
    const avoid = new Set(j.nodeIds);
    const destNode = trip.destination.node;
    const alt = this.net.route(route.nodes[k], destNode, { penalty: (e) => (avoid.has(e.to) ? 1e5 : 0) });
    if (!alt) return false;
    const edges = [...route.edges.slice(0, k), ...alt.edges];
    const fresh = this._buildRoute(this.net.pathFromEdges(edges));
    this._annotateAlternatives(fresh, destNode);
    trip.physRoute = fresh;
    trip.physCrossings = this._crossingsFor(fresh, null).map((nc) => {
      const old = trip.crossings.find((oc) => oc.j === nc.j && Math.abs(oc.dStop - nc.dStop) < 1 && oc.passed);
      return old || nc;
    });
    this.log('warning', `${vehicleId} diverted off its route before ${c.j}`, { tripId: trip.id, vehicleId, junctionId: c.j });
    return true;
  }

  stopVehicle(vehicleId, seconds = 45) {
    const veh = this.vehicles.get(vehicleId);
    if (!veh?.trip) return false;
    veh.stopUntil = this.t + seconds;
    this.log('warning', `${vehicleId} stopped at the roadside for ${seconds} s`, { tripId: veh.trip.id, vehicleId });
    return true;
  }

  injectSpoof(vehicleId, meters = 900) {
    const veh = this.vehicles.get(vehicleId);
    if (!veh?.trip) return false;
    const a = this.rng.float(0, Math.PI * 2);
    veh.spoof = { dx: Math.cos(a) * meters, dy: Math.sin(a) * meters };
    this.log('info', `Demo: spoofed GPS fix injected for ${vehicleId} (${meters} m jump)`, { vehicleId });
    return true;
  }

  injectUnregistered(junctionId) {
    const j = this.junctionsById.get(junctionId) || this.data.junctions[0];
    const ghost = { obuId: 'OBU-KS-9F12', plate: 'QKA 4471 X', t: this.t, lat: j.lat + 0.0018, lng: j.lng - 0.0012, junctionId: j.id };
    this.ghosts.push(ghost);
    this.guard.checkRequest({ ...ghost }, null);
    return ghost;
  }

  injectRequestWithoutTrip(vehicleId, count = 3) {
    const veh = this.vehicles.get(vehicleId);
    if (!veh || veh.trip) return false;
    const near = this.data.junctions.slice().sort((a, b) => distance(veh.lat, veh.lng, a.lat, a.lng) - distance(veh.lat, veh.lng, b.lat, b.lng))[0];
    for (let i = 0; i < count; i++) {
      this.guard.checkRequest({ obuId: veh.amb.obuId, t: this.t + i * 40, junctionId: near.id, lat: veh.lat, lng: veh.lng }, null);
    }
    return true;
  }

  reinstate(vehicleId) {
    this.guard.reinstate(vehicleId);
    const veh = this.vehicles.get(vehicleId);
    if (veh?.trip) veh.trip.evpSuspended = false;
    this.alerts.forEach((a) => { if (a.vehicleId === vehicleId && a.status === 'open') a.status = 'resolved'; });
    this.log('success', `${vehicleId} reinstated by operator: EVP requests allowed again`, { vehicleId });
  }

  acknowledge(alertId) {
    const a = this.alerts.find((x) => x.id === alertId);
    if (a && a.status === 'open') a.status = 'acknowledged';
  }

  /* ─── Read model for the UI ─────────────────────────────── */
  nextJunctionInfo(trip) {
    const veh = this.vehicles.get(trip.vehicleId);
    const c = trip.crossings.find((x) => !x.passed && x.dExit > trip.dEst);
    if (!c) return null;
    const j = this.junctionsById.get(c.j);
    const st = this.adapter.getStatus(c.j);
    const etaNow = c.pred ? Math.max(0, c.pred.eta - (this.t - c.pred.t)) : null;
    const ranked = c.pred ? Object.entries(c.pred.probs).sort((a, b) => b[1] - a[1]) : [];
    let greenIn = null;
    if (c.request === 'GREEN') greenIn = 0;
    else if (c.request === 'SENT') greenIn = Math.max(0, this.adapter.clearanceTime(c.j, c.phase, c.arm, c.requestedMoves || [c.move]));
    else if (etaNow != null) greenIn = Math.max(0, etaNow - LEAD_S);
    return {
      j: c.j, name: j.name, dist: Math.max(0, c.dStop - (veh?.d ?? trip.dEst)), eta: etaNow, lo: c.pred ? Math.max(0, c.pred.lo - (this.t - c.pred.t)) : null,
      hi: c.pred ? Math.max(0, c.pred.hi - (this.t - c.pred.t)) : null, probs: c.pred?.probs || null, top: ranked[0]?.[0] || c.move, topP: ranked[0]?.[1] ?? null,
      plannedMove: c.pmv, arm: c.arm, toArm: c.toArm, phase: c.phase, phaseRule: c.phaseRule, request: c.request, yieldTo: c.yieldTo || null,
      signal: this.controllers.get(c.j).moveState(c.arm, c.move), greenIn, mode: st?.mode, triggerAt: c.triggerAt, override: c.override || null,
    };
  }

  snapshot() {
    const vehicles = [...this.vehicles.values()].map((v) => ({
      id: v.id, lat: v.lat, lng: v.lng, heading: v.heading, speed: v.trip ? v.v : 0,
      tripId: v.trip?.id || null, priority: v.trip?.priority || null, status: v.trip ? v.trip.status : 'IDLE',
      quarantined: this.guard.quarantined.has(v.id), location: v.location, operator: v.amb.operator, callsign: v.amb.callsign,
    }));
    const trips = this.activeTrips().map((tr) => {
      const veh = this.vehicles.get(tr.vehicleId);
      const remaining = Math.max(0, tr.physRoute.length - veh.d);
      return {
        id: tr.id, vehicleId: tr.vehicleId, priority: tr.priority, status: tr.status, statusLabel: tr.statusLabel,
        destination: tr.destination, origin: tr.origin.name, routeVersion: tr.routeVersion, d: veh.d, length: tr.physRoute.length,
        remaining, etaDest: remaining / Math.max(5, veh.v * 0.6 + 4), elapsed: this.t - tr.t0, evpSuspended: Boolean(tr.evpSuspended),
        stopped: tr.stoppedSince != null, offRoute: tr.offRouteSince != null,
        next: this.nextJunctionInfo(tr),
        crossings: tr.crossings.map((c) => ({
          j: c.j, arm: c.arm, toArm: c.toArm, move: c.move, dStop: c.dStop, passed: c.passed, request: c.request, phase: c.phase,
          eta: c.pred ? Math.max(0, c.pred.eta - (this.t - c.pred.t)) : null, lo: c.pred?.lo, hi: c.pred?.hi,
          probs: c.pred?.probs || null, wait: c.wait, baseWait: c.baseWait, override: c.override || null, conflict: Boolean(c.conflict),
        })),
      };
    });
    const junctions = {};
    this.controllers.forEach((c, id) => {
      const s = c.snapshot(this.t);
      const g = this.decision.grants.get(id);
      junctions[id] = { ...s, grant: g ? { vehicleId: g.vehicleId, priority: g.priority, phaseId: g.phaseId } : null };
    });
    return {
      t: this.t, now: this.now, rain: this.rain, vehicles, trips, junctions,
      ghosts: this.ghosts.map((g) => ({ ...g })), events: this.events.slice(0, 80), alerts: this.alerts.slice(0, 100),
      stats: { ...this.decision.stats }, quarantined: [...this.guard.quarantined.keys()],
    };
  }

  routeLatLngs(tripId) {
    const tr = this.trips.get(tripId);
    if (!tr) return null;
    return tr.physRoute.line.pts;
  }
}

