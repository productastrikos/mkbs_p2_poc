import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../ui';
import { NAV_SECTIONS, routeFor } from '../../routes';
import { APP, ORG } from '../../config';
import { useData } from '../../data/DataProvider';
import { initials } from '../../utils';

export function BrandMark() {
  return APP.logo
    ? <img src={APP.logo} alt={ORG.name} className="brand-logo" />
    : <div className="brand-mark">{APP.logoInitials || initials(APP.name)}</div>;
}

/* Logo lockup (§6): mark | rule | council short name, product, council name. */
export function BrandLockup({ compact = false }) {
  return (
    <div className="astk-lockup">
      <BrandMark />
      {!compact && (
        <>
          <span className="astk-lockup-rule" aria-hidden="true" />
          <span className="astk-lockup-text">
            <span className="astk-lockup-name">{ORG.short}</span>
            <span className="astk-lockup-product">{APP.name}</span>
            <span className="astk-lockup-descriptor" title={ORG.name}>{ORG.name}</span>
          </span>
        </>
      )}
    </div>
  );
}

/** collapsed: icon rail (desktop). open: off-canvas drawer shown (below 1024px). */
export default function Sidebar({ collapsed, open = false, onNavigate }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = routeFor(pathname)?.path;
  const { operator } = useData();
  const go = (path) => { navigate(path); onNavigate?.(); };

  return (
    <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''} ${open ? 'is-open' : ''}`} aria-label="Main navigation">
      <div className="sidebar-brand" onClick={() => go('/')} title={`${APP.name} · ${ORG.name}`}>
        <BrandLockup compact={collapsed} />
      </div>

      <nav className="nav">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {collapsed ? <div className="h-3" /> : <p className="nav-section-label">{section.label}</p>}
            {section.items.map((item) => (
              <button
                key={item.path}
                type="button"
                className={`nav-item ${active === item.path ? 'is-active' : ''}`}
                aria-current={active === item.path ? 'page' : undefined}
                onClick={() => go(item.path)}
                title={collapsed ? item.label : undefined}
                aria-label={collapsed ? item.label : undefined}
              >
                <Icon name={item.icon} size={16} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="sidebar-user">
          <div className="avatar avatar-sm">{initials(operator.name)}</div>
          <div className="min-w-0">
            <p className="sidebar-user-name truncate">{operator.name}</p>
            <p className="text-[10px] text-fg-faint truncate">{operator.role}</p>
          </div>
        </div>
      )}
    </aside>
  );
}
