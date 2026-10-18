import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { assembleData, DATA_FILES } from '../evp/data';
import { SimEngine } from '../evp/engine/simulation';
import { EtaModel, MovementModel, AnomalyModel } from '../evp/ml/models';
import { buildAnalytics, etaAccuracy, DEFAULT_ASSUMPTIONS } from '../evp/analytics';
import { SCENARIOS } from '../evp/engine/scenarios';
import { buildInsights } from './insights';
import { llmStatus } from '../services/llm';

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
    this.ambient = false;
    this.engine = null;
  }

  subscribe = (fn) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  get = () => this.snap;

  publish() {
    this.snap = { ...this.engine.snapshot(), speed: this.speed, paused: this.paused, ambient: this.ambient };
    this.listeners.forEach((fn) => fn());
  }

  start(engine, onTick) {
    this.engine = engine;
    let last = performance.now();
    let lastPub = 0;
    let nextAmbient = engine.t + 120;
    this.timer = setInterval(() => {
      const now = performance.now();
      const real = Math.min(0.5, (now - last) / 1000);
      last = now;
      if (!this.paused) {
        let sim = real * this.speed;
        while (sim > 1e-6) { const d = Math.min(0.1, sim); engine.step(d); sim -= d; }
        if (this.ambient && engine.t >= nextAmbient) {
          nextAmbient = engine.t + 150 + Math.random() * 240;
          startAmbientTrip(engine);
        }
      }
      if (now - lastPub >= 200) { lastPub = now; this.publish(); onTick?.(); }
    }, 100);
    this.publish();
  }

  stop() { clearInterval(this.timer); }
  setSpeed(s) { this.speed = s; this.paused = false; this.publish(); }
  togglePause() { this.paused = !this.paused; this.publish(); }
  setAmbient(on) { this.ambient = on; this.publish(); }
}

function startAmbientTrip(engine) {
  const idle = [...engine.vehicles.values()].filter((v) => !v.trip && !engine.guard.quarantined.has(v.id));
  if (!idle.length || engine.activeTrips().length >= 4) return;
  const veh = idle[Math.floor(Math.random() * idle.length)];
  const place = engine.data.places[Math.floor(Math.random() * engine.data.places.length)];
  const toHospital = Math.random() < 0.6;
  const hospital = engine.data.hospitals[Math.floor(Math.random() * engine.data.hospitals.length)];
  try {
    if (toHospital) {
      engine.placeVehicle(veh.id, place.node, place.name);
      engine.startTrip({ vehicleId: veh.id, status: 'TO_HOSPITAL', priority: ['Critical', 'Urgent', 'Urgent', 'Non-urgent'][Math.floor(Math.random() * 4)], destination: { type: 'hospital', id: hospital.id }, originName: place.name });
    } else {
      engine.startTrip({ vehicleId: veh.id, status: 'TO_PATIENT', priority: 'Urgent', destination: { type: 'place', id: place.id } });
    }
  } catch (e) { /* no route; skip */ }
}

const store = new SimStore();
export const useSim = () => useSyncExternalStore(store.subscribe, store.get);

/* ─── Provider ────────────────────────────────────────────── */
const LEVEL_TONE = { danger: 'danger', warning: 'warning', success: 'info', info: 'info' };
const NOTIFY = /SECURITY|Conflict at|maximum hold|cancelled|blocked|arrived at/i;

export function DataProvider({ children }) {
  const [status, setStatus] = useState({ stage: 'loading', message: 'Loading Kuching South road network…', progress: 0.02 });
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [liveTrips, setLiveTrips] = useState([]);
  const [modelInfo, setModelInfo] = useState(null);
  const [modelLog, setModelLog] = useState([]);
  const [training, setTraining] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [llm, setLlm] = useState({ available: false, checking: true });
  const [assumptions, setAssumptions] = useState(DEFAULT_ASSUMPTIONS);
  const [, setAlertsVersion] = useState(0);
  const engineRef = useRef(null);
  const modelsRef = useRef(null);
  const lastEventId = useRef(0);
  const liveRef = useRef([]);
  const historyRef = useRef([]);

  const pushNotification = useCallback((n) => {
    setNotifications((list) => [{ id: `N-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, read: false, createdAt: new Date().toISOString(), ...n }, ...list].slice(0, 60));
  }, []);

  /* Retrain ETA + movement models on history + all live trips. */
  const retrain = useCallback(async (trigger) => {
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
      at: Date.now(), trigger: trigger.id, tripEtaMae: trigger.tripEtaMae, liveTrips: liveRef.current.length,
      eta: { version: eta.version, mae: eta.meta.mae, before: prev.eta.meta.mae, samples: eta.meta.samples },
      movement: { version: movement.version, accuracy: movement.meta.accuracy, before: prev.movement.meta.accuracy },
    }, ...log]);
    setTraining(false);
  }, []);

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
        setStatus({ stage: 'training', message: 'Starting SCATS controllers…', progress: 0.96 });
        await new Promise((r) => setTimeout(r, 0));
        const engine = new SimEngine({ data: assembled, models, seed: 7, startMs: Date.now() - 300000 });
        for (let i = 0; i < 600; i++) engine.step(0.5);
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
        lastEventId.current = engine.eventSeq;
        engineRef.current = engine;
        if (cancelled) return;
        setData(assembled);
        setHistory(trips);
        setModelInfo({ eta: eta.meta, movement: movement.meta, anomaly: anomaly.meta });
        store.start(engine, () => {
          const fresh = engine.events.filter((e) => e.id > lastEventId.current);
          if (!fresh.length) return;
          lastEventId.current = fresh[0].id;
          fresh.reverse().filter((e) => e.level !== 'info' && NOTIFY.test(e.text)).forEach((e) => {
            const security = e.text.startsWith('SECURITY');
            pushNotification({
              tone: LEVEL_TONE[e.level],
              title: security ? e.text.split('.')[0].replace('SECURITY: ', 'Security: ') : e.text.split(':')[0].slice(0, 70),
              message: security ? e.text.split('. ').slice(1).join('. ') : e.text,
              link: security ? '/security' : e.junctionId ? `/junctions/${e.junctionId}` : '/',
            });
          });
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
  const insights = useMemo(() => (analytics && data ? buildInsights(analytics, data, history) : []), [analytics, data, history]);

  const markRead = useCallback((id) => setNotifications((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n))), []);
  const markAllRead = useCallback(() => setNotifications((list) => list.map((n) => ({ ...n, read: true }))), []);

  const runAction = useCallback(async (insightId, action, values) => {
    engineRef.current?.log('info', `Operator action (${action}) on insight ${insightId}: ${Object.values(values).filter(Boolean).join(' · ').slice(0, 140)}`);
  }, []);

  const runScenario = useCallback((id) => {
    const engine = engineRef.current;
    const sc = SCENARIOS.find((s) => s.id === id);
    if (!engine || !sc) return { ok: false, message: 'Not ready' };
    try {
      const res = sc.run(engine);
      engine.log(res.ok ? 'info' : 'warning', `Scenario "${sc.label}": ${res.message}`);
      store.publish();
      return res;
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }, []);

  const value = useMemo(() => ({
    status, ready: status.stage === 'ready', data, history, liveTrips, allTrips, analytics, liveAccuracy,
    modelInfo, modelLog, training, engine: engineRef.current, sim: store,
    runScenario, notifications, markRead, markAllRead, pushNotification, insights, runAction, llm,
    assumptions, setAssumptions,
  }), [status, data, history, liveTrips, allTrips, analytics, liveAccuracy, modelInfo, modelLog, training, runScenario, notifications, markRead, markAllRead, pushNotification, insights, runAction, llm, assumptions]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);
