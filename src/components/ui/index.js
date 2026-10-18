import React from 'react';

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
      <div className="progress-bar" style={{ width: `${pct}%`, background: `var(--color-${tone})` }} />
    </div>
  );
}

/** PageHeader: page title, optional subtitle and right-aligned actions. */
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-4">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

/** StatGrid: responsive grid for a row of StatCards. */
export function StatGrid({ children, cols = 4 }) {
  const lg = { 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' }[cols] || 'lg:grid-cols-4';
  return <div className={`grid grid-cols-1 sm:grid-cols-2 ${lg} gap-4`}>{children}</div>;
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
