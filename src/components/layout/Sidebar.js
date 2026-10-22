import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../ui';
import { NAV_SECTIONS, routeFor } from '../../routes';
import { APP } from '../../config';
import { useData } from '../../data/DataProvider';
import { initials } from '../../utils';

export function BrandMark() {
  return APP.logo
    ? <img src={APP.logo} alt={APP.name} style={{ height: 32, width: 'auto' }} />
    : <div className="brand-mark">{APP.logoInitials || initials(APP.name)}</div>;
}

export default function Sidebar({ collapsed }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = routeFor(pathname)?.path;
  const { operator } = useData();

  return (
    <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="sidebar-brand" onClick={() => navigate('/')}>
        <BrandMark />
        {!collapsed && <span className="brand-name">{APP.name}</span>}
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
                onClick={() => navigate(item.path)}
                title={collapsed ? item.label : undefined}
              >
                <Icon name={item.icon} size={18} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="sidebar-user">
          <div className="avatar" style={{ width: 30, height: 30, fontSize: 11, borderRadius: 8 }}>{initials(operator.name)}</div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-fg truncate">{operator.name}</p>
            <p className="text-[10px] text-fg-faint truncate">{operator.role}</p>
          </div>
        </div>
      )}
    </aside>
  );
}
