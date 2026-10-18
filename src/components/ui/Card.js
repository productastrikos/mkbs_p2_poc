import React from 'react';

/**
 * Card: the standard panel surface.
 *   title / subtitle / actions render a header row with a divider.
 *   padded=false removes body padding (for tables and edge-to-edge content).
 *   hoverable lifts the card on hover.
 */
export default function Card({
  title, subtitle, actions, children,
  padded = true, hoverable = false, className = '', bodyClassName = '', style,
}) {
  const hasHeader = title || subtitle || actions;
  return (
    <div className={`card ${hoverable ? 'card-hoverable' : ''} ${padded ? '' : 'overflow-hidden'} ${className}`} style={style}>
      {hasHeader && (
        <div className="card-header">
          <div className="flex-1 min-w-0">
            {title && <h3 className="card-title">{title}</h3>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={`${padded ? 'card-body' : ''} ${bodyClassName}`}>{children}</div>
    </div>
  );
}
