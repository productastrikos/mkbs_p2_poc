import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, IconButton, EmptyState } from '../ui';
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
    <aside className="side-panel" aria-label="Notifications">
      <div className="panel-header">
        <div>
          <h2 className="side-panel-title">Notifications</h2>
          <p className="text-xs text-fg-faint">{unread.length} unread</p>
        </div>
        <div className="flex items-center gap-3">
          {unread.length > 0 && <button type="button" className="link-btn" onClick={markAllRead}>Mark all read</button>}
          <IconButton icon="close" label="Close notifications" onClick={onClose} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {GROUPS.map(({ tone, label }) => {
          const items = unread.filter((n) => n.tone === tone);
          if (!items.length) return null;
          return (
            <div key={tone} className="space-y-2">
              <Badge tone={tone} plain dot>{label} ({items.length})</Badge>
              {items.map((n) => (
                <div key={n.id} className={`notice tone-${tone}`}>
                  <p className="notice-title">{n.title}</p>
                  <p className="notice-body">{n.message}</p>
                  <div className="flex items-center justify-between mt-2 gap-2">
                    <span className="text-[10px] text-fg-faint">{timeAgo(n.createdAt)}</span>
                    <span className="flex gap-3">
                      {n.link && <button type="button" className="link-btn" onClick={() => { markRead(n.id); navigate(n.link); onClose(); }}>View</button>}
                      <button type="button" className="link-btn" onClick={() => markRead(n.id)}>Mark as read</button>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
        {unread.length === 0 && (
          <EmptyState icon="bell" title="You're all caught up">
            Alerts from the anomaly guard and the decision engine appear here as they happen.
          </EmptyState>
        )}
      </div>
    </aside>
  );
}
