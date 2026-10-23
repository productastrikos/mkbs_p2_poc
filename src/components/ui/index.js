import React from 'react';
import Icon from './Icon';
import { toneColor } from '../../utils';

// UI kit. Import from here: import { Card, Button, Badge } from '../components/ui';
export { default as Icon } from './Icon';
export { default as Card } from './Card';
export { default as Button, IconButton } from './Button';
export { default as Badge } from './Badge';
export { default as StatCard } from './StatCard';
export { default as Tabs, FilterChips } from './Tabs';
export { default as Modal, Drawer, DetailGrid } from './Modal';
export { default as DataTable } from './DataTable';

/** ProgressBar: tone is a status colour name (success, warning, danger, primary…). */
export function ProgressBar({ value, max = 100, tone = 'primary', className = '' }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={`progress ${className}`}>
      <div className="progress-bar" style={{ width: `${pct}%`, background: toneColor(tone) }} />
    </div>
  );
}

/** PageHeader: every page opens with this block (title, subtitle, actions). */
export function PageHeader({ title, subtitle, actions, breadcrumb }) {
  return (
    <div className="page-header-block">
      <div className="min-w-0">
        {breadcrumb}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}

/** StatGrid: KPI row, repeat(auto-fit, minmax(220px, 1fr)) with equal-height cards. */
export function StatGrid({ children }) {
  return <div className="app-kpi-row">{children}</div>;
}

/** EmptyState: what is missing and the next action (§7.19). */
export function EmptyState({ icon = 'info', title, children, action, compact = false }) {
  return (
    <div className={`app-empty ${compact ? 'app-empty-sm' : ''}`}>
      <Icon name={icon} size={44} strokeWidth={1.5} className="app-empty-icon" />
      {title && <p className="app-empty-title">{title}</p>}
      {children && <div className="app-empty-text">{children}</div>}
      {action}
    </div>
  );
}

/** Field: a label and value row inside cards. */
export function Field({ label, children }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-fg-faint">{label}</span>
      <span className="text-fg font-medium">{children}</span>
    </div>
  );
}
