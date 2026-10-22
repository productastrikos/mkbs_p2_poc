/* ═══════════════════════════════════════════════════════════════════════
   ROUTES: every page in the app, grouped into sidebar sections.

   To add a page:
     1. Create src/pages/MyPage.js
     2. Import it below and add { path, label, icon, element } to a section
   The sidebar, header title, header search and router all read from here.

   icon      a name from src/components/ui/Icon.js
   keywords  extra words for the header search (optional)
   ═══════════════════════════════════════════════════════════════════════ */
import CommandMap from './pages/CommandMap';
import Tablet from './pages/Tablet';
import Junctions from './pages/Junctions';
import JunctionDetail from './pages/JunctionDetail';
import Cctv from './pages/Cctv';
import Analytics from './pages/Analytics';
import Security from './pages/Security';
import Assistant from './pages/Assistant';

export const NAV_SECTIONS = [
  {
    label: 'Operations',
    items: [
      { path: '/', label: 'Live Command Map', icon: 'map', element: <CommandMap />, keywords: 'map live ambulances route corridor signals eta scenarios demo' },
      { path: '/tablet', label: 'Ambulance Tablet', icon: 'tablet', element: <Tablet />, keywords: 'obu on-board unit crew login start evp trip' },
      { path: '/junctions', label: 'Junctions', icon: 'traffic', element: <Junctions />, keywords: 'scats phase signal junction detail timeline recovery' },
      { path: '/cctv', label: 'CCTV', icon: 'video', element: <Cctv />, keywords: 'cctv camera video feed footage wall snapshot' },
    ],
  },
  {
    label: 'Insight',
    items: [
      { path: '/analytics', label: 'Analytics', icon: 'analytics', element: <Analytics />, keywords: 'time saved before after heatmap rollout ranking cost benefit budget model learning' },
      { path: '/security', label: 'Alerts & Security', icon: 'shield', element: <Security />, keywords: 'anomaly spoofing gps blocked unregistered registry quarantine' },
      { path: '/assistant', label: 'AI Assistant & Reports', icon: 'sparkles', element: <Assistant />, keywords: 'llm chat report post-trip monthly summary jkr jkns pdrm' },
    ],
  },
];

export const ROUTES = NAV_SECTIONS.flatMap((s) => s.items);

// Routes that exist but have no sidebar entry.
export const EXTRA_ROUTES = [
  { path: '/junctions/:id', label: 'Junction Detail', parent: '/junctions', element: <JunctionDetail /> },
];

/** The nav item a pathname belongs to (exact match, else longest prefix). */
export function routeFor(pathname) {
  return ROUTES.find((r) => r.path === pathname)
    || ROUTES.filter((r) => r.path !== '/' && pathname.startsWith(r.path)).sort((a, b) => b.path.length - a.path.length)[0];
}
