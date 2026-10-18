import React from 'react';

const normalise = (t) => (typeof t === 'string' ? { value: t, label: t } : t);

/**
 * Tabs
 *   tabs:    ['A', 'B'] or [{ value, label }]
 *   variant: 'segmented' (pill group) | 'underline'
 *   size:    'md' | 'sm'
 */
export default function Tabs({ tabs, value, onChange, variant = 'segmented', size = 'md', className = '' }) {
  const classes = ['tabs', variant === 'underline' && 'tabs-underline', size === 'sm' && 'tabs-sm', className]
    .filter(Boolean).join(' ');
  return (
    <div className={classes} role="tablist">
      {tabs.map(normalise).map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          className={`tab ${value === t.value ? 'is-active' : ''}`}
          onClick={() => onChange(t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** FilterChips: a row of toggle pills with an optional leading label. */
export function FilterChips({ label, options, value, onChange, className = '' }) {
  return (
    <div className={`flex items-center flex-wrap gap-1.5 ${className}`}>
      {label && <span className="label-caps mr-1">{label}</span>}
      {options.map(normalise).map((o) => (
        <button
          key={o.value}
          type="button"
          className={`chip ${value === o.value ? 'is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
