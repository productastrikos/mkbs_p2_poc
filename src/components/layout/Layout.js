import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import NotificationsPanel from './NotificationsPanel';
import InsightsPanel from './InsightsPanel';
import { useData } from '../../data/DataProvider';
import { ProgressBar } from '../ui';
import { APP } from '../../config';

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
            <p className="text-[10px] text-fg-faint">Models train in your browser from 500 simulated pilot trips; this takes a few seconds.</p>
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
  const { status, ready } = useData();

  const togglePanel = (name) => setPanel((p) => (p === name ? null : name));

  return (
    <div className="shell">
      <Sidebar collapsed={collapsed} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          onToggleSidebar={() => setCollapsed((c) => !c)}
          activePanel={panel}
          onTogglePanel={togglePanel}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-5">{ready ? children : <BootScreen status={status} />}</main>
      </div>

      {panel === 'notifications' && <NotificationsPanel onClose={() => setPanel(null)} />}
      {panel === 'insights' && <InsightsPanel onClose={() => setPanel(null)} />}
    </div>
  );
}
