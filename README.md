# GreenLight EVP

GreenLight EVP is a working prototype of AI-assisted Emergency Vehicle Pre-emption for **Majlis Bandaraya Kuching Selatan (MBKS)**, Sarawak. It runs on MBKS's existing SCATS signal controllers. The app predicts when an ambulance will reach each junction and which way it will turn. It then asks SCATS for the right green about 15 s before arrival, keeps every transition safe (pedestrians, amber, all-red, maximum hold), and hands control back to SCATS so queues recover.

Everything runs in the browser: a simulation of 22 Kuching South junctions on the real OpenStreetMap road network, in-browser machine learning, and a simulated SCATS adapter. A small Node endpoint adds Claude for reports and the operator assistant.

**Stack:** React 18 (Create React App), React Router 6, Tailwind CSS 3, Leaflet / react-leaflet with OpenStreetMap data and tiles, Chart.js 4, the Anthropic SDK (`@anthropic-ai/sdk`) on the server.

## Quick start

```bash
npm install
npm start            # http://localhost:3000 (dev server + LLM API)
```

The app boots in about 3 s. It loads the data, trains the three models in the browser and starts the 22 SCATS controllers.

**Claude (optional).** Create `.env.local` in the project root:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Then restart `npm start`. The key stays on the server (`server/llm.js`) and is never sent to the browser. Without a key, the AI Assistant page uses offline templates and rule-based answers, and says so.

**Production build:**

```bash
npm run build
npm run serve        # serves build/ and /api/llm on http://localhost:3000
```

## Demo walkthrough

| Goal | Where | What to do |
|---|---|---|
| START an ambulance to SGH | **Ambulance Tablet** | Sign in (any 4-digit PIN), choose *To hospital* → Sarawak General Hospital, *Critical*, press **START EVP**. The status card counts down "Green in N s" and turns green before arrival. Or use **Scenarios → SGH run** on the Command Map. |
| Watch the corridor | **Live Command Map** | Animated ambulances, route corridor, junction signal states, predicted movement arrows and ETA with its confidence band. Speed up the clock with 2×/4×/8×. |
| Check the safe sequence | **Junctions → a junction** | SCATS phase diagram, the pre-emption timeline (request → amber 3 s → all-red 2 s → green hold → release → recovery), safety checklist, queue chart, SCATS adapter log. |
| Two converging ambulances | **Scenarios → Two-ambulance conflict** | A Critical and an Urgent ambulance converge on one junction. Critical gets the green; Urgent is shown "HOLD: yielding" and gets its green after. |
| Spoofed GPS / unregistered vehicle | **Alerts & Security** (or Scenarios) | Inject a 1.1 km GPS jump, an unregistered OBU, requests outside a trip, or a trip with no patient status. Each is blocked, flagged and, where needed, quarantined. The operator can acknowledge or reinstate. |
| Time saved and rollout | **Analytics** | Seconds saved per trip against the no-EVP baseline, before/after by month, junction delay heatmap, the 22-junction rollout ranking, cost/benefit against the RM2.0M budget, model learning log. |
| Post-trip report | **AI Assistant** | Pick a trip (live trips appear first) → **Generate report**. Monthly summaries for JKR / JKNS / PDRM and the operator chat are on the same page. |

`npm run check` runs the same acceptance checks headlessly in Node (SGH run, conflict, spoofing, unregistered vehicle, misuse, stop/divert cancel, analytics, offline report). The last run passed 19/19.

## How it works

### AI core (`src/evp/`)

| # | Component | Implementation |
|---|---|---|
| 1 | **Junction ETA prediction** | Gradient-boosted regression trees (`ml/gbrt.js`, 110 trees, depth 4). Features: distance to stop line, speed, acceleration, hour, day of week, rain, live junction congestion (0–1), approach lanes, ambulance status. A second GBRT predicts the expected error and is calibrated so 80% of held-out errors fall inside the band. Re-predicted every 2 s for each upcoming junction. |
| 2 | **Movement / phase prediction** | Softmax regression over Left / Straight / Right / U-turn (`ml/softmax.js`): planned route move, route alternatives and cost gap, lane, distance, heading. If the top movement has P ≥ 0.8, the engine requests the phase serving it. Otherwise it requests a phase that covers the two most likely movements (`engine/decision.js → choosePhase`). |
| 3 | **Pre-emption decision engine** | `engine/decision.js` + `scats/controller.js`. It requests when ETA ≤ phase clearance + 15 s. A pedestrian green is never cut mid-crossing, and new pedestrian calls are held once an approach is announced. Every change uses 3 s amber + 2 s all-red, and holds stop at 45 s. A request is cancelled if the ambulance stops or diverts for more than 20 s. Conflicts go Critical > Urgent > Non-urgent, then nearest ETA. After release, SCATS adaptive control recovers over 1–2 cycles. |
| 4 | **Authorisation & anomaly guard** | `engine/guard.js` + `ml/isolationForest.js`. Only registered OBUs on an active trip (START pressed) with a patient status may request a green. Rules flag jumps above 150 km/h, fixes more than 60 m off the road network and repeated requests outside a trip; an isolation forest scores every fix. Requests are blocked, units quarantined, and the operator is alerted. |
| 5 | **Corridor analytics & learning** | `analytics.js`. After each trip, predicted ETA is compared with actual arrival and both models are retrained on history + live trips (see Analytics → Models & learning). Time saved is measured against a *shadow* SCATS controller that is never pre-empted, using the same traffic. The page also reports conflicting movements avoided, fuel and idle time saved, and ranks junctions by delay exposure and collision risk for the 22-junction rollout. |

### Generative AI (`server/llm.js`)

- **Post-trip report**, **monthly stakeholder summary** (JKR / JKNS / PDRM) and an **operator chat assistant**, all from structured facts: the trip record or an analytics digest. Prompts tell the model to use only those facts.
- Model `claude-opus-5-5`, streamed. Chat uses `effort: low`; reports use `medium`.
- **Refusal fallback is enabled:** requests send `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`). If the model declines, the API re-runs the request on Anthropic's recommended fallback model in the same call.
- `GET /api/llm/status` checks the key with a model lookup. The UI falls back to offline templates when no key is set or a call fails.

### SCATS adapter (`src/evp/scats/ScatsAdapter.js`)

The decision engine reaches the signals only through this interface. To integrate with MBKS's real SCATS controllers and roadside units, replace `SimulatedScatsAdapter` with an implementation such as the `RemoteScatsAdapter` stub.

```js
notifyApproach(junctionId, { vehicleId, etaS })          // ETA ≤ 60 s: hold new pedestrian calls
requestPhase(junctionId, phaseId, { requestId, vehicleId, priority, arm, moves, etaS })
holdPhase(junctionId, requestId, holdS)                  // re-sent while approaching; 45 s cap enforced by controller
release(junctionId, requestId, reason)                   // hand back to SCATS adaptive
getStatus(junctionId)                                    // mode, phase, stage, queues, pre-emption timeline
clearanceTime(junctionId, phaseId, arm, moves)           // seconds to a safe switch right now
```

The engine reads outcomes from `getStatus()` on its next tick, so a network implementation can be asynchronous.

## Data

`public/data/` is generated by the scripts and committed, so `npm start` works offline.

| File | Contents | Source |
|---|---|---|
| `network.json` | Routable road graph (≈2,900 nodes, 4,000 links) for Kuching South | OpenStreetMap via Overpass |
| `junctions.json` | 22 signalised junctions on real Kuching South roads, incl. Jalan Simpang Tiga / Jalan Tabuan / Jalan Mendu (proof-of-concept site, J16). Each has SCATS phase plans, timings, hourly congestion profiles and incident counts. | OSM signal locations; phase plans, timings, congestion and incidents are prototype assumptions |
| `hospitals.json` | SGH, Borneo Medical Centre, KPJ Kuching, Timberland Medical Centre | OSM (KPJ location approximate) |
| `ambulances.json` | 20 ambulances with OBU IDs, plates, bases and operators | Mock |
| `trips.json`, `gps-fixes.json` | 500 historical trips (Apr–Oct 2026) with GPS traces, timestamps and junction waits; 8,000 GPS fixes for the anomaly model | Generated by running the simulation headlessly |

Regenerate:

```bash
npm run data         # fetch OSM (cached in scripts/osm-cache) and build network/junction data
npm run data:trips   # regenerate the 500 historical trips
npm run check        # acceptance checks
```

Map data and tiles © OpenStreetMap contributors (ODbL). For production use, move to a tile provider or self-hosted tiles, as the OSM tile usage policy requires.

## Project structure

```
src/
  evp/                    simulation + AI core (plain ES modules, also run by the Node scripts)
    engine/               simulation.js, decision.js, guard.js, scenarios.js
    scats/                controller.js (simulated SCATS junction), ScatsAdapter.js
    ml/                   gbrt.js, softmax.js, isolationForest.js, models.js
    analytics.js          KPIs, before/after, rollout ranking, cost/benefit, LLM digest
    reports.js            LLM payloads and offline report templates
  pages/                  CommandMap, Tablet, Junctions, JunctionDetail, Analytics, Security, Assistant
  components/evp/         phase diagram, pre-emption timeline, map icons, Markdown renderer
  data/DataProvider.js    boot, model training, simulation loop, retraining
  setupProxy.js           mounts the LLM API on the dev server
server/                   llm.js (Claude endpoints), index.js (production server)
scripts/                  data fetch/build, trip generator, acceptance checks
```

## Limitations

- Traffic, signal timings, incidents and trip history are simulated. Results are indicative until they are calibrated against MBKS SCATS logs and real ambulance GPS data.
- Cost/benefit leaves out the clinical value of faster arrival. Its assumptions can be edited on the Analytics page.
- The KPJ Kuching location is approximate.
