import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import NotificationsPanel from './NotificationsPanel';
import InsightsPanel from './InsightsPanel';
import { useData, useSim } from '../../data/DataProvider';
import { ProgressBar, Button } from '../ui';
import { APP, USER } from '../../config';

/* Shown after Sign out: the console is locked, the twin keeps running. */
function LockScreen() {
  const { operator, signIn } = useData();
  const snap = useSim();
  const [name, setName] = useState(operator.name);
  const openAlerts = snap?.alerts.filter((a) => a.status === 'open').length ?? 0;
  return (
    <div className="overlay overlay-center" style={{ background: 'var(--color-bg)' }}>
      <form className="card card-body w-full max-w-sm space-y-4" onSubmit={(e) => { e.preventDefault(); if (name.trim()) signIn(name.trim(), USER.role); }}>
        <div className="text-center space-y-1">
          <img src={APP.logo} alt="" className="w-12 h-12 mx-auto" />
          <p className="text-base font-bold text-fg">{APP.name} · {APP.subtitle}</p>
          <p className="text-xs text-fg-faint">Console locked. The simulation, signals and anomaly guard are still running.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="tile py-1.5"><p className="text-lg font-bold text-fg">{snap?.trips.length ?? 0}</p><p className="text-[10px] text-fg-faint">EVP trips</p></div>
          <div className="tile py-1.5"><p className="text-lg font-bold text-fg">{Object.values(snap?.junctions || {}).filter((s) => s.mode === 'PREEMPT').length}</p><p className="text-[10px] text-fg-faint">Pre-empting</p></div>
          <div className={`tile py-1.5 ${openAlerts ? 'tone-danger' : ''}`}><p className="text-lg font-bold text-fg">{openAlerts}</p><p className="text-[10px] text-fg-faint">Open alerts</p></div>
        </div>
        <label className="block"><span className="label-caps field-label">Operator</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <Button type="submit" block disabled={!name.trim()}>Sign in</Button>
        <p className="text-[10.5px] text-fg-faint text-center">Prototype: no password. In production this uses MBKS single sign-on.</p>
      </form>
    </div>
  );
}

/* Shown while data loads and the models train in the browser. */
function BootScreen({ status }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="card card-body w-full max-w-md text-center space-y-4" role="status" aria-live="polite">
        <img src={APP.logo} alt="" className="w-14 h-14 mx-auto" />
        <div>
          <p className="text-base font-bold text-fg">{APP.name}</p>
          <p className="text-xs text-fg-faint">{APP.subtitle}</p>
        </div>
        {status.stage === 'error' ? (
          <p className="tile tone-danger text-xs text-left">Could not start: {status.message}. Check that public/data/ exists (run <code>npm run data</code>).</p>
        ) : (
          <>
            <ProgressBar value={status.progress * 100} />
            <p className="text-xs text-fg-muted">{status.message}</p>
            <p className="text-[10px] text-fg-faint">Models train in your browser from the 500 simulated pilot trips; this takes a few seconds.</p>
          </>
        )}
      </div>
    </div>
  );
}

/* App shell: sidebar, header, scrollable content area, and the
   slide-out side panels. */
export default function Layout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [panel, setPanel] = useState(null); // 'notifications' | 'insights' | null
  const { status, ready, operator } = useData();

  const togglePanel = (name) => setPanel((p) => (p === name ? null : name));
  if (ready && !operator.signedIn) return <LockScreen />;

  return (
    <div className="shell">
      <Sidebar collapsed={collapsed} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          onToggleSidebar={() => setCollapsed((c) => !c)}
          activePanel={panel}
          onTogglePanel={togglePanel}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{ready ? children : <BootScreen status={status} />}</main>
      </div>

      {panel === 'notifications' && <NotificationsPanel onClose={() => setPanel(null)} />}
      {panel === 'insights' && <InsightsPanel onClose={() => setPanel(null)} />}
    </div>
  );
}
