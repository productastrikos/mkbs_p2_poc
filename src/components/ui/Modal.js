import React, { useEffect } from 'react';
import { IconButton } from './Button';

function useEscape(onClose) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
}

function PanelHeader({ eyebrow, title, subtitle, extra, onClose }) {
  return (
    <div className="panel-header">
      <div className="min-w-0">
        {eyebrow && <p className="label-caps mb-0.5">{eyebrow}</p>}
        <h2 className="text-base font-bold text-fg leading-tight">{title}</h2>
        {subtitle && <p className="text-xs text-fg-faint mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {extra}
        <IconButton icon="close" label="Close" plain onClick={onClose} />
      </div>
    </div>
  );
}

/** Modal: centred dialog. Render it conditionally: {open && <Modal …/>} */
export default function Modal({ title, eyebrow, subtitle, onClose, footer, width = 440, children }) {
  useEscape(onClose);
  return (
    <div className="overlay overlay-center" onClick={onClose}>
      <div className="modal" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <PanelHeader eyebrow={eyebrow} title={title} subtitle={subtitle} onClose={onClose} />
        <div className="p-5">{children}</div>
        {footer && <div className="panel-footer">{footer}</div>}
      </div>
    </div>
  );
}

/** Drawer: full-height panel that slides in from the right. */
export function Drawer({ title, eyebrow, subtitle, headerExtra, onClose, footer, width = 420, bodyClassName = 'p-5 overflow-y-auto', children }) {
  useEscape(onClose);
  return (
    <div className="overlay overlay-right" onClick={onClose}>
      <div className="drawer" style={{ width }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <PanelHeader eyebrow={eyebrow} title={title} subtitle={subtitle} extra={headerExtra} onClose={onClose} />
        <div className={`flex-1 min-h-0 ${bodyClassName}`}>{children}</div>
        {footer && <div className="panel-footer">{footer}</div>}
      </div>
    </div>
  );
}

/** DetailGrid: label/value tiles, for record details inside modals. */
export function DetailGrid({ items, columns = 2 }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {items.map(({ label, value }) => (
        <div key={label} className="tile">
          <p className="label-caps mb-1">{label}</p>
          <div className="text-sm font-semibold text-fg">{value}</div>
        </div>
      ))}
    </div>
  );
}
