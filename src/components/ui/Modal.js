import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* Esc closes; Tab stays inside the dialog; focus returns to the trigger on close. */
function useDialog(ref, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const trigger = document.activeElement;
    const el = ref.current;
    if (el && !el.contains(document.activeElement)) (el.querySelector('[autofocus]') || el).focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Escape') { closeRef.current?.(); return; }
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (trigger && typeof trigger.focus === 'function' && document.contains(trigger)) trigger.focus({ preventScroll: true });
    };
  }, [ref]);
}

function PanelHeader({ id, eyebrow, title, subtitle, extra, onClose }) {
  return (
    <div className="panel-header">
      <div className="min-w-0">
        {eyebrow && <p className="label-caps mb-1">{eyebrow}</p>}
        <h2 id={id} className="app-modal-title">{title}</h2>
        {subtitle && <p className="app-modal-subtitle">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {extra}
        <IconButton icon="close" label="Close" onClick={onClose} />
      </div>
    </div>
  );
}

/** Modal: centred dialog. Render it conditionally: {open && <Modal …/>}
 *  width: 420 (sm) | 560 (md, default) | 760 (lg) | 1000 (xl)
 *  Modal and Drawer render into <body>, so page spacing utilities and
 *  transformed ancestors (a card's hover lift) cannot offset the overlay. */
export default function Modal({ title, eyebrow, subtitle, onClose, footer, width = 560, children }) {
  const ref = useRef(null);
  const titleId = useId();
  useDialog(ref, onClose);
  return createPortal(
    <div className="overlay overlay-center" onClick={onClose}>
      <div ref={ref} tabIndex={-1} className="modal" style={{ '--modal-w': `${width}px` }} onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <PanelHeader id={titleId} eyebrow={eyebrow} title={title} subtitle={subtitle} onClose={onClose} />
        <div className="app-modal-body">{children}</div>
        {footer && <div className="panel-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Drawer: full-height panel that slides in from the right (420px, full width below 640px). */
export function Drawer({ title, eyebrow, subtitle, headerExtra, onClose, footer, width = 420, bodyClassName = 'p-5 overflow-y-auto', children }) {
  const ref = useRef(null);
  const titleId = useId();
  useDialog(ref, onClose);
  return createPortal(
    <div className="overlay overlay-right" onClick={onClose}>
      <div ref={ref} tabIndex={-1} className="drawer" style={{ '--drawer-w': `${width}px` }} onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <PanelHeader id={titleId} eyebrow={eyebrow} title={title} subtitle={subtitle} extra={headerExtra} onClose={onClose} />
        <div className={`flex-1 min-h-0 ${bodyClassName}`}>{children}</div>
        {footer && <div className="panel-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** DetailGrid: label/value tiles, for record details inside modals. */
export function DetailGrid({ items, columns = 2 }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {items.map(({ label, value }) => (
        <div key={label} className="tile">
          <p className="label-caps mb-1">{label}</p>
          <div className="text-sm font-bold text-fg">{value}</div>
        </div>
      ))}
    </div>
  );
}
