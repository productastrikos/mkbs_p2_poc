import React, { useEffect, useState } from 'react';
import Sidebar, { BrandLockup } from './Sidebar';
import Header from './Header';
import NotificationsPanel from './NotificationsPanel';
import InsightsPanel from './InsightsPanel';
import { useData, useSim } from '../../data/DataProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { ProgressBar, Button, IconButton } from '../ui';
import { APP, ORG, USER } from '../../config';

const NARROW = '(max-width: 1023px)';

function useMediaQuery(query) {
  const [match, setMatch] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

/* Shown after Sign out: the console is locked, the twin keeps running.
   Auth archetype (§13): brand-ink panel on the left, the form on the right. */
function LockScreen() {
  const { operator, signIn } = useData();
  const { theme, toggleTheme } = useTheme();
  const snap = useSim();
  const [name, setName] = useState(operator.name);
  const openAlerts = snap?.alerts.filter((a) => a.status === 'open').length ?? 0;
  const stats = [
    { label: 'EVP trips', value: snap?.trips.length ?? 0 },
    { label: 'Pre-empting', value: Object.values(snap?.junctions || {}).filter((s) => s.mode === 'PREEMPT').length },
    { label: 'Open alerts', value: openAlerts, tone: openAlerts ? 'tone-danger' : '' },
  ];
  return (
    <div className="h-full grid lg:grid-cols-2 bg-page">
      <div className="astk-fixed-dark astk-on-ink astk-aurora bg-astrikos-ink hidden lg:flex flex-col justify-between p-12">
        <BrandLockup />
        <div className="space-y-4 max-w-md">
          <p className="astk-eyebrow">{ORG.nameEn}</p>
          <h1 className="astk-h2">{APP.name}</h1>
          <p className="astk-body1 text-fg-muted">AI-assisted emergency vehicle pre-emption on the {ORG.short} SCATS network: ambulances get a green wave, pedestrians are never cut off, and signals recover on their own.</p>
        </div>
        <p className="text-[11px] text-fg-faint">{ORG.motto}</p>
      </div>

      <div className="relative flex items-center justify-center p-6">
        <div className="absolute top-4 right-4">
          <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={toggleTheme} />
        </div>
        <form className="astk-panel w-full space-y-4" style={{ maxWidth: 380 }} onSubmit={(e) => { e.preventDefault(); if (name.trim()) signIn(name.trim(), USER.role); }}>
          <div className="space-y-1">
            <div className="lg:hidden mb-4"><BrandLockup /></div>
            <h2 className="astk-h3">Console locked</h2>
            <p className="text-xs text-fg-muted">{APP.name} · {APP.subtitle}. The simulation, signals and anomaly guard are still running.</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {stats.map((s) => (
              <div key={s.label} className={`tile py-2 ${s.tone || ''}`}>
                <p className="font-display text-lg font-bold text-fg leading-none">{s.value}</p>
                <p className="text-[10px] text-fg-faint mt-1">{s.label}</p>
              </div>
            ))}
          </div>
          <label className="block"><span className="field-label">Operator</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <Button type="submit" block disabled={!name.trim()}>Sign in</Button>
          <p className="text-[11px] text-fg-faint">Prototype: no password. In production this uses {ORG.short} single sign-on.</p>
        </form>
      </div>
    </div>
  );
}

/* Shown while data loads and the models train in the browser. */
function BootScreen({ status }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="astk-panel w-full max-w-md space-y-4" role="status" aria-live="polite">
        <BrandLockup />
        {status.stage === 'error' ? (
          <div className="tile tone-danger text-xs space-y-1">
            <p className="font-bold">Could not start: {status.message}.</p>
            <p className="text-fg-muted">Check that public/data/ exists: run <code>npm run data</code>, then reload.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <p className="app-loading-text">{status.message}</p>
              <ProgressBar value={status.progress * 100} />
            </div>
            <p className="text-[11px] text-fg-faint">Models train in your browser from the 500 simulated pilot trips; this takes a few seconds.</p>
          </>
        )}
      </div>
    </div>
  );
}

/* App shell: sidebar, header, scrollable content area, and the
   slide-out side panels. Below 1024px the sidebar is an off-canvas drawer. */
export default function Layout({ children }) {
  const narrow = useMediaQuery(NARROW);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [panel, setPanel] = useState(null); // 'notifications' | 'insights' | null
  const { status, ready, operator } = useData();

  useEffect(() => { if (!narrow) setDrawerOpen(false); }, [narrow]);
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const togglePanel = (name) => setPanel((p) => (p === name ? null : name));
  const toggleNav = () => (narrow ? setDrawerOpen((o) => !o) : setCollapsed((c) => !c));
  if (ready && !operator.signedIn) return <LockScreen />;

  return (
    <div className="shell">
      <Sidebar collapsed={collapsed && !narrow} open={narrow && drawerOpen} onNavigate={() => setDrawerOpen(false)} />
      {narrow && drawerOpen && <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          onToggleSidebar={toggleNav}
          activePanel={panel}
          onTogglePanel={togglePanel}
        />
        <main className="app-main">
          <div className="app-content min-h-full flex flex-col">{ready ? children : <BootScreen status={status} />}</div>
        </main>
      </div>

      {panel === 'notifications' && <NotificationsPanel onClose={() => setPanel(null)} />}
      {panel === 'insights' && <InsightsPanel onClose={() => setPanel(null)} />}
    </div>
  );
}
