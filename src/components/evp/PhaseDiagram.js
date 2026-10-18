import React from 'react';
import { SIGNAL_HEX } from './format';

/* SVG plan view of a junction: arms at their real bearings, a signal lamp
   on each approach, and movement arrows for the highlighted phase.
   Left-hand traffic: vehicles approach on the left side of each arm. */

const R = 100;
const pt = (bearing, dist, side = 0) => {
  const a = (bearing * Math.PI) / 180;
  const x = Math.sin(a) * dist;
  const y = -Math.cos(a) * dist;
  // side offset: positive = to the left when looking toward the centre
  const nx = Math.cos(a) * side;
  const ny = Math.sin(a) * side;
  return [x + nx, y + ny];
};

function movementPath(arms, from, to, move) {
  const a = arms.find((x) => x.id === from);
  const b = arms.find((x) => x.id === to);
  if (!a || !b) return null;
  const [x0, y0] = pt(a.bearing, 46, 9);    // inbound lane (left side)
  const [x1, y1] = pt(b.bearing, 46, -9);   // outbound lane
  if (move === 'U') {
    const [cx, cy] = pt(a.bearing, 16, 0);
    return `M ${x0} ${y0} Q ${cx} ${cy} ${x1} ${y1}`;
  }
  return `M ${x0} ${y0} Q 0 0 ${x1} ${y1}`;
}

export default function PhaseDiagram({ junction, phase, armStates = {}, predicted, size = 280, showLabels = true, ped }) {
  const arms = junction.arms;
  const moves = phase ? phase.moves : [];
  return (
    <svg viewBox="-150 -150 300 300" width="100%" style={{ maxWidth: size, display: 'block', margin: '0 auto' }} role="img"
      aria-label={`Plan of ${junction.name}${phase ? `, phase ${phase.id} ${phase.label}` : ''}`}>
      <defs>
        <marker id={`ah-${junction.id}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-primary)" />
        </marker>
        <marker id={`ap-${junction.id}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-accent)" />
        </marker>
      </defs>
      {/* Carriageways */}
      {arms.map((a) => {
        const [x, y] = pt(a.bearing, R + 30);
        const w = 12 + a.lanes * 7;
        return <line key={`road-${a.id}`} x1="0" y1="0" x2={x} y2={y} stroke="var(--color-surface-raised)" strokeWidth={w} strokeLinecap="butt" />;
      })}
      <circle cx="0" cy="0" r="30" fill="var(--color-surface-raised)" />
      {/* Centre lines and stop lines */}
      {arms.map((a) => {
        const [x0, y0] = pt(a.bearing, 34);
        const [x1, y1] = pt(a.bearing, R + 30);
        const w = 12 + a.lanes * 7;
        const [s0x, s0y] = pt(a.bearing, 34, w / 2);
        const [s1x, s1y] = pt(a.bearing, 34, 0);
        return (
          <g key={`mk-${a.id}`}>
            <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--color-border-strong)" strokeWidth="1.2" strokeDasharray="6 5" />
            <line x1={s0x} y1={s0y} x2={s1x} y2={s1y} stroke="var(--color-text-faint)" strokeWidth="2" />
          </g>
        );
      })}
      {/* Pedestrian crossings on arms whose traffic is stopped */}
      {ped && arms.map((a) => {
        if (moves.some(([arm]) => arm === a.id)) return null;
        const w = 12 + a.lanes * 7;
        const [x0, y0] = pt(a.bearing, 40, -w / 2);
        const [x1, y1] = pt(a.bearing, 40, w / 2);
        return <line key={`ped-${a.id}`} x1={x0} y1={y0} x2={x1} y2={y1} stroke={ped === 'WALK' ? SIGNAL_HEX.G : SIGNAL_HEX.A} strokeWidth="6" strokeDasharray="2 3" opacity="0.9" />;
      })}
      {/* Phase movements */}
      {moves.map(([from, move]) => {
        const to = junction.movements[from]?.[move];
        const d = movementPath(arms, from, to, move);
        return d && <path key={`${from}${move}`} d={d} fill="none" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" markerEnd={`url(#ah-${junction.id})`} opacity="0.9" />;
      })}
      {/* Predicted ambulance movement */}
      {predicted && (() => {
        const to = junction.movements[predicted.arm]?.[predicted.move];
        const d = movementPath(arms, predicted.arm, to, predicted.move);
        return d && <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth="5" strokeLinecap="round" strokeDasharray="1 7" markerEnd={`url(#ap-${junction.id})`} />;
      })()}
      {/* Signal lamps + labels */}
      {arms.map((a) => {
        const [lx, ly] = pt(a.bearing, 58, (12 + a.lanes * 7) / 2 + 10);
        const st = armStates[a.id] || 'R';
        const [tx, ty] = pt(a.bearing, R + 40);
        return (
          <g key={`sig-${a.id}`}>
            <circle cx={lx} cy={ly} r="7" fill={SIGNAL_HEX[st]} stroke="var(--color-surface)" strokeWidth="2" />
            {showLabels && (
              <>
                <text x={tx} y={ty - 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--color-text)">{a.id}</text>
                <text x={tx} y={ty + 9} textAnchor="middle" fontSize="8.5" fill="var(--color-text-faint)">{(a.road || 'unnamed').replace('Jalan ', 'Jln ').slice(0, 22)}</text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
