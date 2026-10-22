import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { assembleData, DATA_FILES } from '../evp/data';
import { SimEngine } from '../evp/engine/simulation';
import { FleetOps } from '../evp/engine/operations';
import { EtaModel, MovementModel, AnomalyModel } from '../evp/ml/models';
import { buildAnalytics, etaAccuracy, DEFAULT_ASSUMPTIONS } from '../evp/analytics';
import { SCENARIOS } from '../evp/engine/scenarios';
import { buildInsights } from './insights';
import { ACTION_FORMS } from './actionForms';
import { llmStatus } from '../services/llm';
import { USER } from '../config';

/* App-wide state: static data, trained models, the running simulation and
   completed trips. The simulation snapshot lives in a separate external
   store (useSim) so 5 Hz updates only re-render components that read it. */

const DataContext = createContext(null);
const BASE = process.env.PUBLIC_URL || '';

/* ─── Simulation runner + snapshot store ──────────────────── */
class SimStore {
  constructor() {
    this.listeners = new Set();
    this.snap = null;
    this.speed = 1;
    this.paused = false;
    this.engine = null;
    this.ops = null;
  }

  subscribe = (fn) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  get = () => this.snap;

  publish() {
    this.snap = { ...this.engine.snapshot(), speed: this.speed, paused: this.paused, ambient: Boolean(this.ops?.enabled), ops: this.ops?.summary() || null };
    this.listeners.forEach((fn) => fn());
  }

  start(engine, ops, onTick) {
    this.engine = engine;
    this.ops = ops;
    let last = performance.now();
    let lastPub = 0;
    this.timer = setInterval(() => {
      const now = performance.now();
      const real = Math.min(0.5, (now - last) / 1000);
      last = now;
      if (!this.paused) {
        let sim = real * this.speed;
        while (sim > 1e-6) { const d = Math.min(0.1, sim); engine.step(d); sim -= d; }
        ops.update();
      }
      if (now - lastPub >= 200) { lastPub = now; this.publish(); onTick?.(); }
    }, 100);
    this.publish();
  }

  stop() { clearInterval(this.timer); }
  setSpeed(s) { this.speed = s; this.paused = false; this.publish(); }
  togglePause() { this.paused = !this.paused; this.publish(); }
  setAmbient(on) {
    if (!this.ops) return;
    this.ops.enabled = on;
    this.engine.log('info', `Live dispatch ${on ? 'on: emergency calls are assigned to the nearest free unit' : 'off: no new calls; units already on a job finish it'}`, { kind: 'operator' });
    this.publish();
  }
}

const store = new SimStore();
export const useSim = () => useSyncExternalStore(store.subscribe, store.get);

/* ─── Notifications from engine events ───────────────────── */
// Only events that need the operator's attention become notifications; the
// rest stay in the event log. Each kind has a clear title and a destination.
function notificationFor(e) {
  const j = e.junctionId;
  switch (e.kind) {
    case 'security': {
      const [type, ...rest] = e.text.replace(/^SECURITY: /, '').split('. ');
      return { tone: e.level === 'danger' ? 'danger' : 'warning', title: `Security: ${type}`, message: rest.join('. '), link: '/security' };
    }
    case 'conflict': return { tone: 'warning', title: `Priority conflict at ${j}`, message: e.text.replace(/^Conflict at [^:]+: /, ''), link: `/junctions/${j}` };
    case 'maxhold': return { tone: 'warning', title: `Maximum hold reached at ${j}`, message: e.text, link: `/junctions/${j}` };
    case 'cancel': return { tone: 'warning', title: `EVP request cancelled at ${j}`, message: e.text.replace(/^[^:]+: /, ''), link: `/junctions/${j}` };
    case 'correction': return { tone: 'info', title: `Phase corrected at ${j}`, message: e.text.replace(/^[^:]+: /, ''), link: `/junctions/${j}` };
    case 'trip-ended': return { tone: 'info', title: `${e.vehicleId}: trip ended before arrival`, message: e.text, link: e.tripId ? `/assistant?trip=${e.tripId}` : '/' };
    case 'dispatch': return e.level === 'warning' ? { tone: 'warning', title: 'Emergency call not served', message: e.text, link: '/' } : null;
    default: return null;
  }
}

const clampAssumptions = (a) => Object.fromEntries(Object.entries({ ...DEFAULT_ASSUMPTIONS, ...a }).map(([k, v]) => {
  const n = Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : DEFAULT_ASSUMPTIONS[k];
  return [k, k === 'collisionReduction' ? Math.min(1, n) : n];
}));

/* ─── Provider ────────────────────────────────────────────── */
export function DataProvider({ children }) {
  const [status, setStatus] = useState({ stage: 'loading', message: 'Loading Kuching South road network…', progress: 0.02 });
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [liveTrips, setLiveTrips] = useState([]);
  const [modelInfo, setModelInfo] = useState(null);
  const [modelLog, setModelLog] = useState([]);
  const [training, setTraining] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [actions, setActions] = useState([]);
  const [operator, setOperator] = useState({ ...USER, signedInAt: Date.now(), signedIn: true });
  const [llm, setLlm] = useState({ available: false, checking: true });
  const [assumptions, setAssumptionsRaw] = useState(DEFAULT_ASSUMPTIONS);
  const [, setAlertsVersion] = useState(0);
  const engineRef = useRef(null);
  const opsRef = useRef(null);
  const modelsRef = useRef(null);
  const lastEventId = useRef(0);
  const liveRef = useRef([]);
  const historyRef = useRef([]);
  const operatorRef = useRef(operator);
  operatorRef.current = operator;

  const pushNotification = useCallback((n) => {
    setNotifications((list) => [{ id: `N-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, read: false, createdAt: new Date().toISOString(), ...n }, ...list].slice(0, 60));
  }, []);

  /* Retrain ETA + movement models on history + all live trips. Runs are
     queued, so two trips finishing together give v2 then v3, never two v2s. */
  const retrainChain = useRef(Promise.resolve());
  const retrainOnce = useCallback(async (trigger) => {
    const engine = engineRef.current;
    const prev = modelsRef.current;
    if (!engine || !prev) return;
    setTraining(true);
    const all = [...historyRef.current, ...liveRef.current];
    const eta = new EtaModel();
    await eta.train(all, { async: true, version: prev.eta.version + 1 });
    const movement = new MovementModel();
    movement.train(all, { version: prev.movement.version + 1 });
    engine.models.eta = eta;
    engine.models.movement = movement;
    modelsRef.current = { ...prev, eta, movement };
    setModelInfo({ eta: eta.meta, movement: movement.meta, anomaly: prev.anomaly.meta });
    setModelLog((log) => [{
      at: Date.now(), simAt: engine.now, trigger: trigger.id, tripEtaMae: trigger.tripEtaMae, liveTrips: liveRef.current.length,
      eta: { version: eta.version, mae: eta.meta.mae, before: prev.eta.meta.mae, samples: eta.meta.samples },
      movement: { version: movement.version, accuracy: movement.meta.accuracy, before: prev.movement.meta.accuracy },
    }, ...log]);
    setTraining(false);
  }, []);
  const retrain = useCallback((trigger) => {
    retrainChain.current = retrainChain.current.then(() => retrainOnce(trigger)).catch((e) => { console.error(e); setTraining(false); });
    return retrainChain.current;
  }, [retrainOnce]);

  /* Boot: load data, train models, start the engine. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = {};
        const files = [...DATA_FILES, 'trips', 'gps-fixes'];
        for (let i = 0; i < files.length; i++) {
          const res = await fetch(`${BASE}/data/${files[i]}.json`);
          if (!res.ok) throw new Error(`Could not load data/${files[i]}.json (HTTP ${res.status})`);
          raw[files[i]] = await res.json();
          if (cancelled) return;
          setStatus({ stage: 'loading', message: `Loading ${files[i].replace('-', ' ')}…`, progress: 0.02 + (0.2 * (i + 1)) / files.length });
        }
        const assembled = assembleData(raw);
        const trips = raw.trips.trips;
        historyRef.current = trips;
        setStatus({ stage: 'training', message: `Training ETA model (gradient-boosted trees) on ${trips.length} trips…`, progress: 0.25 });
        const eta = new EtaModel();
        await eta.train(trips, { async: true, version: 1, onProgress: (p) => !cancelled && setStatus((s) => ({ ...s, progress: 0.25 + p * 0.55 })) });
        setStatus({ stage: 'training', message: 'Training movement model (softmax regression)…', progress: 0.82 });
        await new Promise((r) => setTimeout(r, 0));
        const movement = new MovementModel();
        movement.train(trips, { version: 1 });
        setStatus({ stage: 'training', message: 'Training GPS anomaly model (isolation forest)…', progress: 0.9 });
        await new Promise((r) => setTimeout(r, 0));
        const anomaly = new AnomalyModel();
        anomaly.train(raw['gps-fixes'].rows);
        const models = { eta, movement, anomaly };
        modelsRef.current = models;
        setStatus({ stage: 'training', message: 'Starting SCATS controllers and the fleet…', progress: 0.96 });
        await new Promise((r) => setTimeout(r, 0));
        const engine = new SimEngine({ data: assembled, models, seed: 7, startMs: Date.now() - 300000 });
        engineRef.current = engine;
        engine.onTripComplete = (rec) => {
          rec.tripEtaMae = (() => {
            const xs = rec.junctions.map((c) => c.etaMae).filter((x) => x != null);
            return xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null;
          })();
          liveRef.current = [rec, ...liveRef.current];
          setLiveTrips(liveRef.current);
          setTimeout(() => retrain(rec), 50);
        };
        engine.onAlert = () => setAlertsVersion((v) => v + 1);
        // The fleet is already working when the console opens: during the
        // five-minute warm-up of the signal controllers one call is answered
        // early (its unit is on scene at boot) and two more come in late
        // enough that their units are still driving when the console opens.
        const ops = new FleetOps(engine);
        opsRef.current = ops;
        for (let i = 0; i < 600; i++) {
          if (i === 0) ops.dispatch({ priority: 'Urgent' });
          if (i === 480) ops.dispatch({ priority: 'Critical' });
          if (i === 560) ops.dispatch({ priority: 'Urgent' });
          engine.step(0.5);
          ops.update();
        }
        lastEventId.current = engine.eventSeq;
        if (cancelled) return;
        setData(assembled);
        setHistory(trips);
        setModelInfo({ eta: eta.meta, movement: movement.meta, anomaly: anomaly.meta });
        store.start(engine, ops, () => {
          const fresh = engine.events.filter((e) => e.id > lastEventId.current);
          if (!fresh.length) return;
          lastEventId.current = fresh[0].id;
          fresh.reverse().forEach((e) => { const n = notificationFor(e); if (n) pushNotification(n); });
        });
        setStatus({ stage: 'ready', message: 'Ready', progress: 1 });
      } catch (e) {
        console.error(e);
        if (!cancelled) setStatus({ stage: 'error', message: e.message, progress: 0 });
      }
    })();
    llmStatus().then((s) => setLlm({ ...s, checking: false }));
    return () => { cancelled = true; store.stop(); };
  }, [pushNotification, retrain]);

  const allTrips = useMemo(() => [...liveTrips, ...history], [liveTrips, history]);
  const analytics = useMemo(
    () => (data ? buildAnalytics({ trips: allTrips, junctions: data.junctions, hospitals: data.hospitals, assumptions }) : null),
    [data, allTrips, assumptions],
  );
  const liveAccuracy = useMemo(() => etaAccuracy(liveTrips), [liveTrips]);
  const insights = useMemo(() => (analytics && data ? buildInsights(analytics, data, history, modelInfo) : []), [analytics, data, history, modelInfo]);

  const markRead = useCallback((id) => setNotifications((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n))), []);
  const markAllRead = useCallback(() => setNotifications((list) => list.map((n) => ({ ...n, read: true }))), []);
  const setAssumptions = useCallback((a) => setAssumptionsRaw(clampAssumptions(a)), []);

  /* Operator actions from AI insights: recorded, logged and listed in the panel. */
  const runAction = useCallback(async (insight, action, values) => {
    const by = operatorRef.current.name;
    const summary = Object.values(values).filter(Boolean).join(' · ').slice(0, 160);
    const rec = { id: `ACT-${String(Date.now()).slice(-6)}`, at: Date.now(), action, title: ACTION_FORMS[action]?.title || action, insightId: insight.id, insightTitle: insight.title, values, by, status: 'Submitted' };
    setActions((list) => [rec, ...list].slice(0, 50));
    engineRef.current?.log('info', `Operator action ${rec.id} (${rec.title}) by ${by} on "${insight.title}": ${summary}`, { kind: 'operator' });
    return rec;
  }, []);

  const signOut = useCallback(() => {
    engineRef.current?.log('info', `${operatorRef.current.name} signed out of the console`, { kind: 'operator' });
    setOperator((o) => ({ ...o, signedIn: false }));
  }, []);
  const signIn = useCallback((name, role) => {
    const next = { name: name || USER.name, role: role || USER.role, signedInAt: Date.now(), signedIn: true };
    setOperator(next);
    engineRef.current?.log('info', `${next.name} signed in to the console`, { kind: 'operator' });
  }, []);

  const runScenario = useCallback((id) => {
    const engine = engineRef.current;
    const sc = SCENARIOS.find((s) => s.id === id);
    if (!engine || !sc) return { ok: false, message: 'Not ready' };
    try {
      const res = sc.run(engine);
      engine.log(res.ok ? 'info' : 'warning', `Scenario "${sc.label}": ${res.message}`, { kind: 'scenario' });
      store.publish();
      return res;
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }, []);

  const value = useMemo(() => ({
    status, ready: status.stage === 'ready', data, history, liveTrips, allTrips, analytics, liveAccuracy,
    modelInfo, modelLog, training, engine: engineRef.current, ops: opsRef.current, sim: store,
    runScenario, notifications, markRead, markAllRead, pushNotification, insights, runAction, actions, llm,
    assumptions, setAssumptions, operator, signIn, signOut,
  }), [status, data, history, liveTrips, allTrips, analytics, liveAccuracy, modelInfo, modelLog, training, runScenario, notifications, markRead, markAllRead, pushNotification, insights, runAction, actions, llm, assumptions, setAssumptions, operator, signIn, signOut]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);
