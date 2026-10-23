import React from 'react';
import Icon from './Icon';
import Badge from './Badge';
import { STATUS } from '../../utils';

/**
 * StatCard: KPI tile.
 *   label, value, unit
 *   icon       icon name (see Icon.js)
 *   trend      % change, shown with a directional icon
 *   inverted   lower is better: a falling trend shows green
 *   status     'normal' | 'warning' | 'critical' (footer badge)
 *   subValues  [{ label, value }] secondary metrics
 *   onDetails  shows a "View details" link when provided
 */
export default function StatCard({ label, value, unit, icon = 'barChart', trend, inverted = false, status = 'normal', subValues, onDetails }) {
  const hasTrend = trend !== null && trend !== undefined;
  const s = STATUS[status] || STATUS.normal;
  const trendGood = inverted ? trend <= 0 : trend >= 0;

  return (
    <div className="card stat-card">
      <div className="stat-card-head">
        <div className="stat-card-icon"><Icon name={icon} size={18} /></div>
        <p className="stat-card-label">{label}</p>
        {hasTrend && (
          <span className={`trend ${trendGood ? 'trend-up' : 'trend-down'}`}>
            <Icon name={trend >= 0 ? 'trendUp' : 'trendDown'} size={14} />
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>

      <div className="stat-card-value">
        <span className="stat-card-number astk-numeric">{value}</span>
        {unit && <span className="stat-card-unit">{unit}</span>}
      </div>

      {subValues?.length > 0 && (
        <div className="stat-card-subs">
          {subValues.map((sv) => (
            <div key={sv.label} className="flex flex-col gap-0.5">
              <span className="stat-card-sub-label">{sv.label}</span>
              <span className="stat-card-sub-value">{sv.value}</span>
            </div>
          ))}
        </div>
      )}

      <div className="stat-card-spacer" />
      <div className="stat-card-foot">
        <Badge tone={s.tone} dot plain>{s.label}</Badge>
        {onDetails && (
          <button type="button" className="link-btn" onClick={onDetails} aria-label={`Details for ${label}`}>
            View details
          </button>
        )}
      </div>
    </div>
  );
}
