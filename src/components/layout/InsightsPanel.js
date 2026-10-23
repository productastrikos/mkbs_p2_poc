import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Icon, IconButton, Tabs, EmptyState } from '../ui';
import { useData, useSim } from '../../data/DataProvider';
import { ACTION_FORMS } from '../../data/actionForms';
import { liveAdvisories } from '../../data/insights';
import { APP } from '../../config';

const PRIORITY_TONE = { critical: 'danger', high: 'warning', medium: 'info', low: 'neutral' };

function Section({ title, children }) {
  return (
    <div className="px-4 py-3">
      <p className="label-caps mb-2">{title}</p>
      {children}
    </div>
  );
}

/* Default form values drawn from the insight, so the operator edits rather than retypes. */
function prefill(action, insight) {
  const values = {};
  ACTION_FORMS[action].fields.forEach((f) => { values[f.key] = f.options?.[0] ?? ''; });
  const evidence = insight.evidence.join('; ');
  if (action === 'notify') values.message = `${insight.title}.\n\n${insight.causes.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nRecommendation: ${insight.recommendations[0]}.`;
  if (action === 'task') {
    values.title = insight.recommendations[0] || insight.title;
    values.team = insight.category === 'AI model' ? 'Data & AI' : insight.category === 'Safety' ? 'MBKS traffic engineering' : 'SCATS operations';
    values.details = `${insight.title}. Evidence: ${evidence}.`;
  }
  if (action === 'survey') {
    values.junction = insight.junctionId || '';
    values.notes = `Rollout site survey. ${evidence}.`;
  }
  return values;
}

function ActionForm({ form, onChange, onSubmit, onCancel, busy }) {
  const cfg = ACTION_FORMS[form.action];
  const missing = cfg.fields.filter((f) => f.required && !String(form.values[f.key] || '').trim());
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-surface-elevated animate-fade-in">
      <div className="px-5 py-3 border-b">
        <p className="font-display text-sm font-bold text-fg">{cfg.title}</p>
        <p className="text-[11px] text-fg-faint mt-0.5 line-clamp-1">{form.insightTitle}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {cfg.fields.map((f) => {
          const common = { value: form.values[f.key] || '', onChange: (e) => onChange(f.key, e.target.value), placeholder: f.placeholder };
          return (
            <label key={f.key} className="block">
              <span className="app-label">{f.label}{f.required && <span className="req" aria-hidden="true">*</span>}</span>
              {f.type === 'select' && <select className="select" {...common}>{f.options.map((o) => <option key={o}>{o}</option>)}</select>}
              {f.type === 'textarea' && <textarea className="textarea" rows={5} {...common} />}
              {f.type === 'text' && <input className="input" {...common} />}
            </label>
          );
        })}
      </div>
      <div className="panel-footer flex-col items-stretch">
        {missing.length > 0 && <p className="app-help">Fill in: {missing.map((f) => f.label).join(', ')}</p>}
        <Button block onClick={onSubmit} disabled={busy || missing.length > 0}>{busy ? 'Submitting…' : cfg.title}</Button>
        <Button block variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function InsightCard({ ins, open, onToggle, onAction, onLink }) {
  return (
    <div className="card" style={ins.priority === 'critical' ? { borderColor: 'var(--app-danger-border)' } : undefined}>
      <button type="button" className="w-full text-left px-4 py-3.5" onClick={onToggle} aria-expanded={open}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Badge tone={PRIORITY_TONE[ins.priority] || 'neutral'}>{ins.priority.toUpperCase()}</Badge>
            <span className="text-[10px] text-fg-faint">{ins.category}</span>
          </div>
          <Icon name="chevronDown" size={14} className={`text-fg-faint transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
        <p className="text-[13px] font-bold text-fg leading-snug">{ins.title}</p>
      </button>
      {open && (
        <div className="border-t divide-y divide-line">
          <Section title="Root cause">
            <div className="space-y-1.5 pl-2 border-l-2 border-accent">
              {ins.causes.map(([k, v]) => (
                <p key={k} className="text-xs text-fg-muted"><span className="font-bold text-fg">{k}: </span>{v}</p>
              ))}
            </div>
          </Section>
          <Section title="Evidence">
            <ol className="space-y-1 list-decimal list-inside text-xs text-fg-muted">
              {ins.evidence.map((e) => <li key={e}>{e}</li>)}
            </ol>
          </Section>
          <Section title="Recommendations">
            <ul className="space-y-1.5">
              {ins.recommendations.map((r) => <li key={r} className="text-xs text-fg-muted pl-2 border-l-2 border-line-strong">{r}</li>)}
            </ul>
          </Section>
          {ins.impact && (
            <Section title="Projected impact">
              <p className="tile tone-success text-xs font-semibold">{ins.impact}</p>
            </Section>
          )}
          <Section title="Actions">
            <div className="space-y-1.5">
              {ins.link && (
                <Button variant="soft" block className="justify-between" onClick={() => onLink(ins.link.to)}>
                  {ins.link.label}<Icon name="arrowRight" size={14} />
                </Button>
              )}
              {ins.actions.map((a) => (
                <Button key={a} variant="soft" block className="justify-between" onClick={() => onAction(a, ins)}>
                  {ACTION_FORMS[a].title}<Icon name="chevronRight" size={14} />
                </Button>
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

export default function InsightsPanel({ onClose }) {
  const { insights, runAction, actions } = useData();
  const snap = useSim();
  const navigate = useNavigate();
  const live = useMemo(() => liveAdvisories(snap), [snap]);
  const all = [...live, ...insights];
  const [tab, setTab] = useState('insights');
  const [expanded, setExpanded] = useState(all[0]?.id);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const openForm = (action, insight) => setForm({ action, insight, insightTitle: insight.title, values: prefill(action, insight) });

  const submit = async () => {
    setBusy(true);
    try {
      const rec = await runAction(form.insight, form.action, form.values);
      setToast(`${rec.title} ${rec.id} submitted. Listed under Actions.`);
    } finally {
      setBusy(false);
      setForm(null);
      setTimeout(() => setToast(null), 3500);
    }
  };

  const go = (to) => { navigate(to); onClose(); };

  return (
    <aside className="side-panel" aria-label="AI insights">
      <div className="panel-header">
        <div>
          <h2 className="side-panel-title"><Icon name="sparkles" size={16} />AI insights</h2>
          <p className="text-xs text-fg-faint">{live.length} live advisor{live.length === 1 ? 'y' : 'ies'} · {insights.length} from corridor analytics</p>
        </div>
        <IconButton icon="close" label="Close AI insights" onClick={onClose} />
      </div>
      <div className="relative flex-1 min-h-0 flex flex-col">
        <div className="px-4 pt-4">
          <Tabs size="sm" value={tab} onChange={setTab} tabs={[{ value: 'insights', label: `Insights (${all.length})` }, { value: 'actions', label: `Actions (${actions.length})` }]} />
        </div>

        {toast && (
          <div className="app-toast app-toast-success absolute top-3 left-4 right-4 z-20" role="status">
            <p className="app-toast-title"><Icon name="check" size={14} />Action submitted</p>
            <p className="app-toast-body">{toast}</p>
          </div>
        )}

        {form && (
          <ActionForm
            form={form}
            busy={busy}
            onChange={(k, v) => setForm((f) => ({ ...f, values: { ...f.values, [k]: v } }))}
            onSubmit={submit}
            onCancel={() => setForm(null)}
          />
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {tab === 'insights' && all.map((ins) => (
            <InsightCard key={ins.id} ins={ins} open={expanded === ins.id} onToggle={() => setExpanded(expanded === ins.id ? null : ins.id)} onAction={openForm} onLink={go} />
          ))}
          {tab === 'insights' && !all.length && <EmptyState icon="sparkles" title="No insights yet">Advisories appear as the corridor analytics and the live twin find something worth acting on.</EmptyState>}
          {tab === 'actions' && (actions.length ? actions.map((a) => (
            <div key={a.id} className="tile space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-fg">{a.id}</span>
                <Badge tone="info">{a.title}</Badge>
                <span className="flex-1" />
                <span className="text-[10px] text-fg-faint">{new Date(a.at).toLocaleTimeString(APP.locale, { timeZone: APP.timeZone, hour12: false })}</span>
              </div>
              <p className="text-[11px] text-fg-muted">On: {a.insightTitle}</p>
              <p className="text-[11px] text-fg-muted">{Object.entries(a.values).filter(([, v]) => v).map(([k, v]) => `${k}: ${String(v).split('\n')[0]}`).join(' · ')}</p>
              <p className="text-[10px] text-fg-faint">By {a.by} · {a.status} (prototype: recorded in the console log, not sent to an external system)</p>
            </div>
          )) : <EmptyState icon="clipboard" title="No actions submitted yet">Open an insight and choose an action to notify a stakeholder, raise a task or schedule a survey.</EmptyState>)}
        </div>
      </div>
    </aside>
  );
}
