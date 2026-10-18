import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon, IconButton, Button } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useData } from '../../data/DataProvider';
import { NAV_SECTIONS, EXTRA_ROUTES, routeFor } from '../../routes';
import { APP, USER } from '../../config';
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

// The search index is built from routes.js.
const SEARCH_INDEX = NAV_SECTIONS.flatMap((s) =>
  s.items.map((i) => ({ ...i, section: s.label, haystack: `${i.label} ${s.label} ${i.keywords || ''}`.toLowerCase() })));

function Search() {
  const navigate = useNavigate();
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
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return SEARCH_INDEX
      .map((item) => ({ item, score: words.filter((w) => item.haystack.includes(w)).length }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((r) => r.item);
  }, [query]);

  const go = (path) => { navigate(path); setOpen(false); setQuery(''); inputRef.current?.blur(); };

  return (
    <div className="search hidden sm:flex" ref={ref}>
      <Icon name="search" size={14} className="text-fg-faint" />
      <input
        ref={inputRef}
        value={query}
        placeholder="Search… (Ctrl+K)"
        aria-label="Search"
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) go(results[0].path); }}
      />
      {open && query.trim() && (
        <div className="menu left-0 right-0">
          <div className="menu-section">
            {results.length === 0 && <p className="text-xs text-fg-faint text-center py-3">No results for “{query}”</p>}
            {results.map((r) => (
              <button key={r.path} type="button" className="menu-item" onMouseDown={(e) => { e.preventDefault(); go(r.path); }}>
                <Icon name={r.icon} size={15} />
                <span className="flex-1">
                  <span className="block font-semibold text-fg">{r.label}</span>
                  <span className="block text-[10px] text-fg-faint">{r.section}</span>
                </span>
              </button>
            ))}
          </div>
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
    <span className="hidden md:inline-block font-mono text-xs text-fg-muted px-2 py-1 rounded-md border bg-surface-raised">
      {now.toLocaleTimeString(APP.locale, { hour12: false, timeZone: APP.timeZone })} MYT
    </span>
  );
}

function ProfileMenu({ onOpenNotifications }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { toggleTheme } = useTheme();
  useDismiss(ref, open, () => setOpen(false));

  const item = (icon, label, onClick) => (
    <button type="button" className="menu-item" role="menuitem" onClick={() => { setOpen(false); onClick?.(); }}>
      <Icon name={icon} size={15} />{label}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button type="button" className="avatar" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title={USER.name}>
        {initials(USER.name)}
      </button>
      {open && (
        <div className="menu right-0" role="menu">
          <div className="flex items-center gap-3 px-4 py-3 border-b">
            <div className="avatar">{initials(USER.name)}</div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-fg truncate">{USER.name}</p>
              <p className="text-[10px] text-fg-faint">{USER.role}</p>
            </div>
          </div>
          <div className="menu-section">
            {item('user', 'Profile')}
            {item('bell', 'Notifications', onOpenNotifications)}
            {item('settings', 'Toggle theme', toggleTheme)}
          </div>
          <div className="menu-section">
            {item('logout', 'Sign out')}
          </div>
        </div>
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
      <IconButton icon="menu" label="Toggle sidebar" onClick={onToggleSidebar} />

      <div className="hidden sm:flex flex-col ml-1 mr-2 leading-tight">
        <span className="text-[11px] font-bold uppercase tracking-widest text-fg">{APP.subtitle}</span>
        <span className="text-[10px] text-fg-faint">{pageTitle}</span>
      </div>

      {f.search && <Search />}
      <div className="flex-1" />
      {f.clock && <Clock />}

      {f.themeToggle && (
        <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={toggleTheme} />
      )}

      {f.insights && (
        <Button variant="accent" icon="sparkles" onClick={() => onTogglePanel('insights')} aria-pressed={activePanel === 'insights'}>
          <span className="hidden md:inline">AI Insights</span>
        </Button>
      )}

      {f.notifications && (
        <IconButton icon="bell" label="Notifications" active={activePanel === 'notifications'} onClick={() => onTogglePanel('notifications')}>
          {unread.length > 0 && (
            <span className="notify-count" style={{ background: `var(--color-${hasDanger ? 'danger' : 'warning'})` }}>{unread.length}</span>
          )}
        </IconButton>
      )}

      <ProfileMenu onOpenNotifications={() => activePanel !== 'notifications' && onTogglePanel('notifications')} />
    </header>
  );
}
