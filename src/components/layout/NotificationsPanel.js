import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, IconButton } from '../ui';
import { useData } from '../../data/DataProvider';
import { timeAgo } from '../../utils';

const GROUPS = [
  { tone: 'danger',  label: 'Critical' },
  { tone: 'warning', label: 'Warning' },
  { tone: 'info',    label: 'Info' },
];

export default function NotificationsPanel({ onClose }) {
  const { notifications, markRead, markAllRead } = useData();
  const navigate = useNavigate();
  const unread = notifications.filter((n) => !n.read);

  return (
    <aside className="side-panel w-80 max-w-full">
      <div className="panel-header">
        <div>
          <h3 className="text-sm font-semibold text-fg">Notifications</h3>
          <p className="text-xs text-fg-faint">{unread.length} unread</p>
        </div>
        <div className="flex items-center gap-2">
          {unread.length > 0 && <button type="button" className="link-btn" onClick={markAllRead}>MARK ALL READ</button>}
          <IconButton icon="close" label="Close" plain onClick={onClose} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {GROUPS.map(({ tone, label }) => {
          const items = unread.filter((n) => n.tone === tone);
          if (!items.length) return null;
          return (
            <div key={tone} className="space-y-2">
              <Badge tone={tone} plain>{label.toUpperCase()} ({items.length})</Badge>
              {items.map((n) => (
                <div key={n.id} className={`tile tone-${tone}`}>
                  <p className="text-xs font-semibold text-fg">{n.title}</p>
                  <p className="text-[11px] text-fg-muted mt-0.5">{n.message}</p>
                  <div className="flex items-center justify-between mt-2 gap-2">
                    <span className="text-[10px] text-fg-faint">{timeAgo(n.createdAt)}</span>
                    <span className="flex gap-3">
                      {n.link && <button type="button" className="link-btn" onClick={() => { markRead(n.id); navigate(n.link); onClose(); }}>VIEW</button>}
                      <button type="button" className="link-btn" onClick={() => markRead(n.id)}>MARK AS READ</button>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
        {unread.length === 0 && <p className="text-center text-sm text-fg-faint py-8">You're all caught up. Alerts from the anomaly guard and the decision engine appear here.</p>}
      </div>
    </aside>
  );
}
