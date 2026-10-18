/* Junction geometry, movements and SCATS-style phase plans.

   Malaysia drives on the left: a LEFT turn is the short kerbside turn and a
   RIGHT turn crosses opposing traffic. Arms are labelled by compass point
   (N, NE, E, …) of the direction the arm leaves the junction. A movement is
   (approach arm, L | S | R | U). */
import { angleDiff, compass8 } from './geo.js';
import { spanAt } from './network.js';

export const MOVES = ['L', 'S', 'R', 'U'];
export const MOVE_LABEL = { L: 'Left', S: 'Straight', R: 'Right', U: 'U-turn' };

/** Classify a heading change (deg, clockwise positive) into a movement. */
export function moveFromTurn(turn) {
  const a = Math.abs(turn);
  if (a > 150) return 'U';
  if (a <= 35) return 'S';
  return turn > 0 ? 'R' : 'L';
}

/** For an approach arm, the exit arm of each possible movement. */
export function armMovements(arms, fromArm) {
  const heading = (fromArm.bearing + 180) % 360;
  const best = {};
  arms.forEach((b) => {
    if (b.id === fromArm.id) return;
    const turn = angleDiff(heading, b.bearing);
    const move = moveFromTurn(turn);
    if (move === 'U') return;
    const ideal = { L: -90, S: 0, R: 90 }[move];
    const err = Math.abs(turn - ideal);
    if (!best[move] || err < best[move].err) best[move] = { arm: b.id, err };
  });
  const out = { U: fromArm.id };
  Object.entries(best).forEach(([m, v]) => { out[m] = v.arm; });
  return out;
}

/** Label arms with unique compass points. */
export function labelArms(arms) {
  const used = new Set();
  return arms
    .slice()
    .sort((a, b) => a.bearing - b.bearing)
    .map((a) => {
      let id = compass8(a.bearing);
      if (used.has(id)) id = `${id}${2}`;
      used.add(id);
      return { ...a, id };
    });
}

const CLASS_RANK = { trunk: 0, primary: 1, secondary: 2, tertiary: 3, unclassified: 4, link: 5 };

/**
 * SCATS-style phase plan from the junction arms.
 *   Normal phases run in sequence under adaptive control.
 *   Exclusive phases (one approach, all movements) are used only for
 *   pre-emption when the predicted movement is uncertain.
 */
export function buildPhasePlan(arms) {
  const moves = Object.fromEntries(arms.map((a) => [a.id, armMovements(arms, a)]));
  const has = (arm, m) => Boolean(moves[arm]?.[m]);

  // Pair opposite arms into axes (through movements share a phase).
  const candidates = [];
  for (let i = 0; i < arms.length; i++) {
    for (let j = i + 1; j < arms.length; j++) {
      const d = Math.abs(angleDiff(arms[i].bearing, arms[j].bearing));
      if (d >= 135) candidates.push([180 - d, arms[i], arms[j]]);
    }
  }
  candidates.sort((a, b) => a[0] - b[0]);
  const paired = new Set();
  const axes = [];
  candidates.forEach(([, a, b]) => {
    if (paired.has(a.id) || paired.has(b.id)) return;
    paired.add(a.id); paired.add(b.id);
    axes.push([a, b]);
  });
  const importance = (list) => Math.min(...list.map((a) => CLASS_RANK[a.cls] ?? 4)) - list.reduce((s, a) => s + a.lanes, 0) * 0.01;
  axes.sort((x, y) => importance(x) - importance(y));
  const lone = arms.filter((a) => !paired.has(a.id)).sort((x, y) => importance([x]) - importance([y]));

  const phases = [];
  let letter = 65;
  const next = () => String.fromCharCode(letter++);
  axes.forEach(([a, b], axisIdx) => {
    const thru = [a, b].flatMap((x) => ['S', 'L'].filter((m) => has(x.id, m)).map((m) => [x.id, m]));
    phases.push({ id: next(), kind: 'normal', label: `${a.id}/${b.id} through + left`, moves: thru, ped: true, weight: axisIdx === 0 ? 3 : 2 });
    const right = [a, b].flatMap((x) => ['R', 'U'].filter((m) => has(x.id, m)).map((m) => [x.id, m]));
    if (right.some(([, m]) => m === 'R')) {
      phases.push({ id: next(), kind: 'normal', label: `${a.id}/${b.id} right-turn arrows`, moves: right, ped: false, weight: 1 });
    } else {
      phases[phases.length - 1].moves.push(...right);
    }
  });
  lone.forEach((x) => {
    phases.push({ id: next(), kind: 'normal', label: `${x.id} approach (all movements)`, moves: MOVES.filter((m) => has(x.id, m)).map((m) => [x.id, m]), ped: true, weight: 1.6 });
  });
  arms.forEach((x) => {
    phases.push({ id: `X${x.id}`, kind: 'exclusive', label: `EVP exclusive: ${x.id} approach`, moves: MOVES.filter((m) => has(x.id, m)).map((m) => [x.id, m]), ped: false, weight: 0 });
  });
  return { phases, moves, sequence: phases.filter((p) => p.kind === 'normal').map((p) => p.id) };
}

export const phaseServes = (phase, arm, move) => phase.moves.some(([a, m]) => a === arm && m === move);

/**
 * Smallest phase serving every movement in `moves` from `arm`.
 * Normal phases are preferred (other compatible traffic keeps flowing);
 * the exclusive approach phase is the fallback that covers everything.
 */
export function phaseCovering(junction, arm, moves) {
  const ok = (p) => moves.every((m) => phaseServes(p, arm, m));
  return junction.phases.find((p) => p.kind === 'normal' && ok(p))
    || junction.phases.find((p) => p.kind === 'exclusive' && ok(p))
    || junction.phases.find((p) => p.kind === 'exclusive' && p.moves.some(([a]) => a === arm));
}

/** Arm whose bearing is closest to `deg` (within `tol`). */
export function nearestArm(arms, deg, tol = 60) {
  let best = null;
  let bestErr = tol;
  arms.forEach((a) => {
    const e = Math.abs(angleDiff(a.bearing, deg));
    if (e <= bestErr) { bestErr = e; best = a; }
  });
  return best;
}

/**
 * Junction crossings along a route.
 *   route  = { nodes, edges } from RoadNetwork
 *   line   = Polyline of the route, spans = per-edge distances
 * Returns crossings ordered by distance:
 *   { junctionId, dStop, dCenter, dExit, fromArm, toArm, move, turn }
 */
export function analyseRoute(route, line, spans, junctions) {
  const out = [];
  junctions.forEach((j) => {
    // Geometric test: the route passes through the junction box at grade.
    const hit = line.locate(j.lat, j.lng);
    if (hit.off > j.radius + 6) return;
    if (spanAt(spans, hit.d).edge.elevated) return;
    const dCenter = hit.d;
    const dStop = Math.max(0, dCenter - j.stopOffset);
    const dExit = Math.min(line.length, dCenter + j.stopOffset + 10);
    const inB = line.bearingBetween(dStop - 45, dStop);
    const outB = line.bearingBetween(dExit, dExit + 45);
    const fromArm = nearestArm(j.arms, (inB + 180) % 360, 70);
    const toArm = nearestArm(j.arms, outB, 70);
    if (!fromArm || dStop <= 1) return;
    const turn = angleDiff(inB, outB);
    let move = moveFromTurn(turn);
    if (toArm && toArm.id === fromArm.id) move = 'U';
    out.push({ junctionId: j.id, dStop, dCenter, dExit, fromArm: fromArm.id, toArm: toArm?.id || null, move, turn: Math.round(turn) });
  });
  return out.sort((a, b) => a.dStop - b.dStop);
}
