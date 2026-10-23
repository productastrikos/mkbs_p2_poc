import React from 'react';
import { toneColor } from '../../utils';

/**
 * Badge: a small coloured status pill.
 *   tone:  'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary' | 'accent'
 *   dot:   show a leading dot
 *   plain: text only, without background or border
 */
export default function Badge({ tone = 'neutral', dot = false, plain = false, className = '', title, children }) {
  if (plain) {
    return (
      <span className={`status-text ${className}`} style={{ color: toneColor(tone) }} title={title}>
        {dot && <span className="badge-dot" />}
        {children}
      </span>
    );
  }
  return (
    <span className={`badge tone-${tone} ${className}`} title={title}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}
