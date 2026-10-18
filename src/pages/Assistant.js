import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Badge, PageHeader, Button, Tabs, IconButton, Icon } from '../components/ui';
import { useData, useSim } from '../data/DataProvider';
import Markdown from '../components/evp/Markdown';
import { streamLLM } from '../services/llm';
import { analyticsDigest } from '../evp/analytics';
import { tripReportPayload, offlineTripReport, offlineMonthlySummary, offlineAnswer, monthLabel, fmtLocal } from '../evp/reports';

const SUGGESTIONS = [
  'Which junction caused the most delay this month?',
  'How much time did EVP save for SGH trips?',
  'Which 8 junctions should go first in the 2027 rollout, and why?',
  'How were priority conflicts between ambulances resolved?',
  'Summarise the security alerts and what the guard did.',
  'Does EVP pay back within the RM2.0M budget?',
];
const AUDIENCES = [
  { value: 'JKR', label: 'JKR (roads)' },
  { value: 'JKNS', label: 'JKNS (health)' },
  { value: 'PDRM', label: 'PDRM (police)' },
];

function LlmBadge({ llm }) {
  if (llm.checking) return <Badge tone="neutral" dot>Checking LLM…</Badge>;
  return llm.available
    ? <Badge tone="success" dot>Claude · {llm.model}</Badge>
    : <Badge tone="warning" dot>Offline templates{llm.reason ? `: ${llm.reason}` : ''}</Badge>;
}

function useDigest(month) {
  const { analytics, allTrips, data, modelInfo } = useData();
  const snap = useSim();
  const alertCount = snap?.alerts.length || 0;
  return useMemo(() => analyticsDigest(analytics, {
    trips: allTrips, junctions: data.junctions, hospitals: data.hospitals, alerts: snap?.alerts || [], month,
    models: { etaVersion: modelInfo.eta.version, etaHoldoutMaeS: modelInfo.eta.mae, movementVersion: modelInfo.movement.version, movementAccuracyPct: Math.round(modelInfo.movement.accuracy * 1000) / 10 },
  }), [analytics, allTrips, data, modelInfo, month, alertCount]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* Run an LLM stream with an offline fallback; returns { text, source }. */
async function generate({ llm, path, body, offline, onText, signal }) {
  if (llm.available) {
    try {
      const text = await streamLLM(path, body, onText, signal);
      if (text.trim()) return { text, source: 'llm' };
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      const text = offline();
      onText(text);
      return { text, source: 'offline', error: e.message };
    }
  }
  const text = offline();
  onText(text);
  return { text, source: 'offline' };
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ─── Chat ─────────────────────────────────────────────────── */
function Chat({ latestMonth }) {
  const { llm } = useData();
  const digest = useDigest(latestMonth);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages]);

  const ask = async (question) => {
    const q = question.trim();
    if (!q || busy) return;
    setInput('');
    const history = [...messages, { role: 'user', content: q }];
    setMessages([...history, { role: 'assistant', content: '', pending: true }]);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const update = (text, extra = {}) => setMessages((m) => [...m.slice(0, -1), { role: 'assistant', content: text, ...extra }]);
    try {
      const res = await generate({
        llm, path: 'chat', signal: ctrl.signal,
        body: { digest, messages: history.map(({ role, content }) => ({ role, content })).slice(-12) },
        offline: () => offlineAnswer(q, digest),
        onText: (t) => update(t, { pending: true }),
      });
      update(res.text, { source: res.source, error: res.error });
    } catch (e) {
      if (e.name !== 'AbortError') update(`Error: ${e.message}`, { source: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Operator assistant" subtitle="Answers from the pilot data: trips, junctions, alerts, rollout and cost-benefit"
      actions={messages.length > 0 && <Button size="sm" variant="ghost" icon="refresh" onClick={() => { abortRef.current?.abort(); setMessages([]); }}>New chat</Button>}
      className="flex flex-col" bodyClassName="flex flex-col gap-3">
      <div className="space-y-3 overflow-y-auto pr-1" style={{ minHeight: 320, maxHeight: 560 }}>
        {!messages.length && (
          <div className="space-y-3">
            <p className="text-xs text-fg-muted">Ask about the corridor. Try:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => <button key={s} type="button" className="chip" onClick={() => ask(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role === 'assistant' && <span className="mt-1 text-primary shrink-0"><Icon name="sparkles" size={16} /></span>}
            <div className={`rounded-xl px-3 py-2 text-sm max-w-[85%] ${m.role === 'user' ? 'bg-primary text-white' : 'tile'}`}>
              {m.role === 'user' ? m.content : (m.content ? <Markdown text={m.content} /> : <span className="text-fg-faint text-xs">Thinking…</span>)}
              {m.role === 'assistant' && !m.pending && m.source && (
                <p className="text-[10px] text-fg-faint mt-1">{m.source === 'llm' ? `Claude ${llm.model}` : m.source === 'offline' ? `Offline rule-based answer${m.error ? ` (LLM error: ${m.error})` : ''}` : ''}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <input className="input flex-1" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Which junction caused the most delay this month?" aria-label="Question" disabled={busy} />
        {busy
          ? <Button variant="secondary" icon="stop" onClick={() => abortRef.current?.abort()}>Stop</Button>
          : <Button type="submit" icon="send" disabled={!input.trim()}>Ask</Button>}
      </form>
    </Card>
  );
}

/* ─── Reports ──────────────────────────────────────────────── */
function ReportOutput({ result, busy, filename }) {
  const { llm } = useData();
  if (!result && !busy) return <p className="text-xs text-fg-faint">Choose the options above and generate a report.</p>;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {busy ? <Badge tone="primary" dot>Writing…</Badge> : result?.source === 'llm' ? <Badge tone="success">Claude {llm.model}</Badge> : <Badge tone="warning">Offline template{result?.error ? `: LLM error (${result.error})` : ''}</Badge>}
        <span className="flex-1" />
        {result?.text && !busy && (
          <>
            <IconButton icon="clipboard" label="Copy Markdown" plain onClick={() => navigator.clipboard?.writeText(result.text)} />
            <IconButton icon="download" label="Download .md" plain onClick={() => download(filename, result.text)} />
          </>
        )}
      </div>
      <div className="tile overflow-y-auto" style={{ maxHeight: 600 }}><Markdown text={result?.text || ''} /></div>
    </div>
  );
}

function TripReport({ initialTrip }) {
  const { llm, liveTrips, history, data } = useData();
  const options = useMemo(() => [...liveTrips, ...history.slice().sort((a, b) => b.start - a.start).filter((t) => t.junctions.length).slice(0, 60)], [liveTrips, history]);
  const [tripId, setTripId] = useState(initialTrip || options[0]?.id);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef(null);
  const trip = options.find((t) => t.id === tripId) || [...liveTrips, ...history].find((t) => t.id === tripId);
  const ctx = useMemo(() => ({ junctions: data.junctions, hospitals: data.hospitals, ambulances: data.ambulances }), [data]);

  const run = async (t = trip) => {
    if (!t || busy) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setResult({ text: '' });
    try {
      const res = await generate({
        llm, path: 'trip-report', signal: ctrl.signal,
        body: { trip: tripReportPayload(t, ctx) },
        offline: () => offlineTripReport(t, ctx),
        onText: (text) => setResult({ text }),
      });
      setResult(res);
    } catch (e) {
      if (e.name !== 'AbortError') setResult({ text: `Error: ${e.message}`, source: 'offline' });
    } finally { setBusy(false); }
  };

  useEffect(() => { if (initialTrip && trip) run(trip); }, [initialTrip]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap items-end">
        <label className="block flex-1 min-w-[220px]"><span className="label-caps field-label">Trip</span>
          <select className="select" value={tripId || ''} onChange={(e) => { setTripId(e.target.value); setResult(null); }}>
            {liveTrips.length > 0 && <optgroup label="Live trips (this session)">{liveTrips.map((t) => <option key={t.id} value={t.id}>{t.id} · {t.ambulanceId} → {t.destinationName} · {Math.round(t.saved)} s saved</option>)}</optgroup>}
            <optgroup label="Historical trips">{options.filter((t) => t.source !== 'live').map((t) => <option key={t.id} value={t.id}>{t.id} · {fmtLocal(t.start)} · {t.ambulanceId} → {t.destinationName}</option>)}</optgroup>
          </select>
        </label>
        <Button icon="sparkles" onClick={() => run()} disabled={!trip || busy}>Generate report</Button>
      </div>
      {trip && <p className="text-[11px] text-fg-faint">{trip.priority} · {trip.junctions.length} junctions · {Math.round(trip.duration)} s with EVP vs {Math.round(trip.baseline)} s baseline</p>}
      <ReportOutput result={result} busy={busy} filename={`${tripId}-post-trip-report.md`} />
    </div>
  );
}

function MonthlyReport({ months }) {
  const { llm } = useData();
  const [month, setMonth] = useState(months[months.length - 1]);
  const [audience, setAudience] = useState('JKR');
  const digest = useDigest(month);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const run = async () => {
    if (busy) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setResult({ text: '' });
    try {
      const res = await generate({
        llm, path: 'monthly', signal: ctrl.signal,
        body: { digest, audience },
        offline: () => offlineMonthlySummary(digest, audience),
        onText: (text) => setResult({ text }),
      });
      setResult(res);
    } catch (e) {
      if (e.name !== 'AbortError') setResult({ text: `Error: ${e.message}`, source: 'offline' });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap items-end">
        <label className="block"><span className="label-caps field-label">Month</span>
          <select className="select" value={month} onChange={(e) => { setMonth(e.target.value); setResult(null); }}>
            {months.slice().reverse().map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </label>
        <div><span className="label-caps field-label">Audience</span><Tabs tabs={AUDIENCES} value={audience} onChange={(a) => { setAudience(a); setResult(null); }} size="sm" /></div>
        <Button icon="sparkles" onClick={run} disabled={busy}>Generate summary</Button>
      </div>
      <ReportOutput result={result} busy={busy} filename={`greenlight-evp-${month}-${audience}.md`} />
    </div>
  );
}

export default function Assistant() {
  const { llm, analytics } = useData();
  const [params] = useSearchParams();
  const initialTrip = params.get('trip');
  const [tab, setTab] = useState('trip');
  const months = analytics.monthly.map((m) => m.month);

  return (
    <div className="space-y-5">
      <PageHeader title="AI Assistant & Reports" subtitle="Generative AI over the pilot data: operator Q&A, post-trip reports and monthly stakeholder summaries"
        actions={<LlmBadge llm={llm} />} />
      {!llm.checking && !llm.available && (
        <p className="tile tone-warning text-xs">No LLM is configured, so answers and reports use built-in templates. Add <code>ANTHROPIC_API_KEY</code> to <code>.env.local</code> and restart <code>npm start</code> to use Claude.</p>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <Chat latestMonth={months[months.length - 1]} />
        <Card title="Reports" subtitle="Facts come from the trip record or the monthly digest; the model is told not to add numbers"
          actions={<Tabs tabs={[{ value: 'trip', label: 'Post-trip' }, { value: 'monthly', label: 'Monthly summary' }]} value={tab} onChange={setTab} size="sm" />}>
          {tab === 'trip' ? <TripReport initialTrip={initialTrip} /> : <MonthlyReport months={months} />}
        </Card>
      </div>
    </div>
  );
}
