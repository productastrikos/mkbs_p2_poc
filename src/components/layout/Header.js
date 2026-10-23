import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon, IconButton, Button, Modal, DetailGrid } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useData, useSim } from '../../data/DataProvider';
import { NAV_SECTIONS, EXTRA_ROUTES, routeFor } from '../../routes';
import { APP, ORG } from '../../config';
import { initials } from '../../utils';

// Closes a popup when clicking outside `ref` or pressing Escape.
function useDismiss(ref, open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && onClose();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, open, onClose]);
}

// Pages come from routes.js; junctions, ambulances, hospitals and trips from the data.
const PAGE_INDEX = NAV_SECTIONS.flatMap((s) =>
  s.items.map((i) => ({ key: i.path, path: i.path, icon: i.icon, label: i.label, section: `Page · ${s.label}`, haystack: `${i.label} ${s.label} ${i.keywords || ''}`.toLowerCase() })));

function useSearchIndex() {
  const { data, allTrips } = useData();
  return useMemo(() => {
    if (!data) return { fixed: PAGE_INDEX, trips: [] };
    const junctions = data.junctions.map((j) => ({
      key: j.id, path: `/junctions/${j.id}`, icon: 'traffic', label: `${j.id} · ${j.name}`, section: `Junction · SCATS ${j.scatsSite}${j.poc ? ' · proof of concept' : ''}`,
      haystack: `${j.id} ${j.name} ${j.scatsSite} ${j.arms.map((a) => a.road).join(' ')} junction`.toLowerCase(),
    }));
    const ambulances = data.ambulances.map((a) => ({
      key: a.id, path: `/?focus=${a.id}`, icon: 'ambulance', label: `${a.id} · ${a.callsign}`, section: `Ambulance · ${a.operator} · ${a.plate}`,
      haystack: `${a.id} ${a.callsign} ${a.plate} ${a.obuId} ${a.operator} ambulance unit`.toLowerCase(),
    }));
    const hospitals = data.hospitals.map((h) => ({
      key: h.id, path: `/?focus=${h.id}`, icon: 'hospital', label: h.name, section: `Hospital · ${h.type}`,
      haystack: `${h.id} ${h.short} ${h.name} hospital`.toLowerCase(),
    }));
    const cameras = data.cameras.map((c) => {
      const j = data.junctions.find((x) => x.id === c.junctionId);
      const road = j?.arms.find((a) => a.id === c.arm)?.road;
      return {
        key: c.id, path: `/cctv?cam=${c.id}`, icon: 'video', label: `${c.id} · ${c.arm} approach${road ? `, ${road}` : ''}`, section: `CCTV camera · ${j ? `${j.id} ${j.name}` : c.junctionId}${c.type === 'PTZ' ? ' · PTZ' : ''}`,
        haystack: `${c.id} ${c.junctionId} ${j?.name || ''} ${road || ''} cctv camera`.toLowerCase(),
      };
    });
    const trips = allTrips.map((t) => ({
      key: t.id, path: `/assistant?trip=${t.id}`, icon: 'file', label: `${t.id} · ${t.ambulanceId} → ${t.destinationName}`, section: `Trip report · ${Math.round(t.saved)} s saved`,
      haystack: t.id.toLowerCase(),
    }));
    return { fixed: [...PAGE_INDEX, ...junctions, ...cameras, ...ambulances, ...hospitals], trips };
  }, [data, allTrips]);
}

function Search() {
  const navigate = useNavigate();
  const index = useSearchIndex();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const inputRef = useRef(null);
  useDismiss(ref, open, () => { setOpen(false); setQuery(''); });

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inputRef.current?.focus(); setOpen(true); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const scored = index.fixed
      .map((item) => {
        const hits = words.filter((w) => item.haystack.includes(w)).length;
        // An exact ID ("j16", "amb-11", "sgh") ranks first.
        const exact = item.key.toLowerCase() === q ? 10 : item.haystack.startsWith(q) ? 2 : 0;
        return { item, score: hits === words.length ? hits + exact : 0 };
      })
      .filter((r) => r.score > 0);
    // Trip IDs match by prefix only (there are hundreds).
    const trips = q.length >= 3 ? index.trips.filter((t) => t.haystack.startsWith(q)).slice(0, 5).map((item) => ({ item, score: 1 })) : [];
    return [...scored, ...trips].sort((a, b) => b.score - a.score).slice(0, 8).map((r) => r.item);
  }, [query, index]);

  const go = (path) => { navigate(path); setOpen(false); setQuery(''); inputRef.current?.blur(); };

  return (
    <div className="header-search hidden sm:flex" ref={ref}>
      <Icon name="search" size={14} />
      <input
        ref={inputRef}
        value={query}
        placeholder="Search junctions, units, trips… (Ctrl+K)"
        aria-label="Search"
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) go(results[0].path); }}
      />
      {open && query.trim() && (
        <div className="search-dropdown">
          {results.length === 0 && <p className="search-dropdown-empty">No junction, camera, unit, hospital, trip or page matches “{query}”. Try an ID such as J01 or AMB-11.</p>}
          {results.map((r) => (
            <button key={`${r.key}-${r.path}`} type="button" className="search-dropdown-item" onMouseDown={(e) => { e.preventDefault(); go(r.path); }}>
              <span className="sdi-icon"><Icon name={r.icon} size={15} /></span>
              <span className="sdi-text">
                <span className="sdi-label">{r.label}</span>
                <span className="sdi-desc">{r.section}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="app-readout hidden md:inline-flex" title="Wall clock, Kuching time (MYT, UTC+8)">
      <b>{now.toLocaleTimeString(APP.locale, { hour12: false, timeZone: APP.timeZone })}</b> MYT
    </span>
  );
}

function sinceLabel(ms) {
  return new Date(ms).toLocaleString(APP.locale, { timeZone: APP.timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

/* Operator profile: who is on the console and what they have done this session. */
function ProfileModal({ onClose }) {
  const { operator, actions, notifications, liveTrips } = useData();
  const snap = useSim();
  const mine = (snap?.alerts || []).filter((a) => a.ackBy === operator.name || a.resolvedBy === operator.name);
  const mins = Math.max(0, Math.round((Date.now() - operator.signedInAt) / 60000));
  return (
    <Modal eyebrow="Operator profile" title={operator.name} subtitle={`${operator.role} · ${APP.subtitle}`} onClose={onClose}
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="space-y-4">
        <DetailGrid items={[
          { label: 'Signed in', value: `${sinceLabel(operator.signedInAt)} (${mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`})` },
          { label: 'Organisation', value: `${ORG.name} (${ORG.nameEn})` },
          { label: 'Console', value: `${ORG.short} Traffic Command, Kuching South` },
          { label: 'Alerts handled', value: `${mine.length} acknowledged or resolved` },
          { label: 'Actions submitted', value: actions.filter((a) => a.by === operator.name).length },
          { label: 'Live trips completed', value: liveTrips.length },
          { label: 'Unread notifications', value: notifications.filter((n) => !n.read).length },
        ]} />
        <div>
          <p className="label-caps mb-1.5">Permissions on this console</p>
          <ul className="text-xs text-fg-muted space-y-1 list-disc list-inside">
            <li>Monitor EVP trips, junction controllers and the SCATS adapter log</li>
            <li>Acknowledge and resolve security alerts; reinstate quarantined units</li>
            <li>End or divert trips and run demo scenarios on the simulated network</li>
            <li>Generate post-trip reports and monthly stakeholder summaries</li>
          </ul>
        </div>
        <p className="text-[11px] text-fg-faint">Prototype: no authentication. Signing out locks the console; the twin keeps running.</p>
      </div>
    </Modal>
  );
}

function ProfileMenu({ onOpenNotifications }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const ref = useRef(null);
  const { toggleTheme } = useTheme();
  const { operator, signOut } = useData();
  useDismiss(ref, open, () => setOpen(false));

  const item = (icon, label, onClick, danger = false) => (
    <button type="button" className={`profile-menu-item ${danger ? 'danger' : ''}`} role="menuitem" onClick={() => { setOpen(false); onClick?.(); }}>
      <Icon name={icon} size={16} />{label}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button type="button" className="profile-trigger" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={`Operator menu: ${operator.name}`} title={operator.name}>
        {initials(operator.name)}
      </button>
      {open && (
        <div className="profile-menu" role="menu">
          <div className="profile-menu-header">
            <div className="avatar">{initials(operator.name)}</div>
            <div className="min-w-0">
              <p className="name truncate">{operator.name}</p>
              <p className="role truncate">{operator.role}</p>
              <span className="status">Signed in</span>
            </div>
          </div>
          <div className="profile-menu-section">
            {item('user', 'Profile', () => setProfile(true))}
            {item('bell', 'Notifications', onOpenNotifications)}
            {item('settings', 'Toggle theme', toggleTheme)}
          </div>
          <div className="profile-menu-section">
            {item('logout', 'Sign out', () => setConfirmOut(true), true)}
          </div>
        </div>
      )}
      {profile && <ProfileModal onClose={() => setProfile(false)} />}
      {confirmOut && (
        <Modal title="Sign out of the console?" width={420} onClose={() => setConfirmOut(false)}
          footer={<><Button variant="secondary" onClick={() => setConfirmOut(false)}>Cancel</Button><Button variant="danger" icon="logout" onClick={() => { setConfirmOut(false); signOut(); }}>Sign out</Button></>}>
          <p className="text-sm text-fg-muted">The console locks until an operator signs in. Ambulances, signals and the anomaly guard keep running; alerts raised meanwhile wait in the queue.</p>
        </Modal>
      )}
    </div>
  );
}

export default function Header({ onToggleSidebar, activePanel, onTogglePanel }) {
  const { pathname } = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { notifications } = useData();
  const f = APP.features;

  const unread = notifications.filter((n) => !n.read);
  const hasDanger = unread.some((n) => n.tone === 'danger');
  const extra = EXTRA_ROUTES.find((r) => pathname.startsWith(r.parent + '/'));
  const pageTitle = extra?.label || routeFor(pathname)?.label || '';

  return (
    <header className="header">
      <IconButton icon="menu" label="Toggle navigation" onClick={onToggleSidebar} />

      <div className="header-context hidden sm:flex">
        <span className="astk-eyebrow">{APP.subtitle}</span>
        <span className="header-context-title">{pageTitle}</span>
      </div>

      {f.search && <Search />}
      <div className="flex-1" />

      <div className="header-actions">
        {f.clock && <Clock />}

        {f.themeToggle && (
          <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={toggleTheme} />
        )}

        {f.insights && (
          <button type="button" className={`app-advisory-btn ${activePanel === 'insights' ? 'is-on' : ''}`} onClick={() => onTogglePanel('insights')}
            aria-pressed={activePanel === 'insights'} aria-label="AI insights">
            <Icon name="sparkles" size={16} />
            <span className="hidden md:inline">AI insights</span>
          </button>
        )}

        {f.notifications && (
          <IconButton icon="bell" label={`Notifications${unread.length ? `: ${unread.length} unread` : ''}`} active={activePanel === 'notifications'} onClick={() => onTogglePanel('notifications')}>
            {unread.length > 0 && (
              <span className={`notify-count ${hasDanger ? 'is-danger' : 'is-warning'}`} aria-hidden="true">{unread.length}</span>
            )}
          </IconButton>
        )}

        <ProfileMenu onOpenNotifications={() => activePanel !== 'notifications' && onTogglePanel('notifications')} />
      </div>
    </header>
  );
}
