/* Corridor analytics over completed trips (historical + live).
   Time saved is measured against the no-EVP baseline: the wait each
   ambulance would have had at each junction under the shadow (never
   pre-empted) SCATS controller. */
import { localParts } from './traffic.js';

const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const sum = (xs) => xs.reduce((s, x) => s + x, 0);
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

export const BUDGET = {
  capexRM: 1100000,
  maintenancePerYearRM: 225000,
  years: [2027, 2028, 2029, 2030],
  totalRM: 2000000,
};

export const DEFAULT_ASSUMPTIONS = {
  evpTripsPerYear: 29200,          // 20 ambulances × 4 emergency trips/day
  collisionsPerYear: 1.5,          // 5 reported since 2021 plus unreported
  collisionReduction: 0.6,         // share avoided by green passage
  costPerCollisionRM: 280000,      // ambulance > RM200k + downtime + liability
  ambulanceHourValueRM: 180,       // fleet cost of an ambulance-hour
  dieselRMPerL: 2.15,
};

const DAY_MS = 86400000;

export function buildAnalytics({ trips: allTrips, junctions, hospitals, assumptions = DEFAULT_ASSUMPTIONS }) {
  // Only trips that reached their destination are compared with the baseline:
  // a trip the operator or crew ended early has no comparable duration.
  const trips = allTrips.filter((t) => t.arrived !== false);
  const crossings = trips.flatMap((t) => t.junctions.map((c) => ({ ...c, trip: t })));
  const span = (ts) => (ts.length ? { from: Math.min(...ts.map((t) => t.start)), to: Math.max(...ts.map((t) => t.start)) } : null);
  const period = span(trips);
  const historyPeriod = span(trips.filter((t) => t.source !== 'live'));

  /* KPIs */
  const kpis = {
    trips: trips.length,
    liveTrips: trips.filter((t) => t.source === 'live').length,
    endedEarly: allTrips.length - trips.length,
    tripsWithJunctions: trips.filter((t) => t.junctions.length).length,
    avgSavedS: avg(trips.map((t) => t.saved)),
    totalSavedS: sum(trips.map((t) => t.saved)),
    avgDurationS: avg(trips.map((t) => t.duration)),
    avgBaselineS: avg(trips.map((t) => t.baseline)),
    crossings: crossings.length,
    preempted: crossings.filter((c) => c.preempted).length,
    // A crossing where the no-EVP ambulance would have met a red (> 2 s wait) but passed without stopping.
    conflictsAvoided: sum(trips.map((t) => t.conflictsAvoided || 0)),
    // Each priority conflict is counted once, on the ambulance that yielded.
    priorityConflicts: crossings.filter((c) => c.yieldTo).length,
    phaseCorrections: crossings.filter((c) => c.lineCorrected || c.override === 'PHASE_CORRECTION').length,
    idleSavedH: sum(trips.map((t) => t.idleSavedS || 0)) / 3600,
    fuelSavedL: sum(trips.map((t) => t.fuelSavedL || 0)),
    avgGreenLead: avg(crossings.filter((c) => c.preempted && c.greenLead != null).map((c) => c.greenLead)),
    pedProtect: crossings.filter((c) => c.pedProtect > 0).length,
    overrides: crossings.filter((c) => c.override).length,
    anomalies: sum(trips.map((t) => (t.anomalies || []).length)),
  };
  kpis.preemptRate = kpis.crossings ? kpis.preempted / kpis.crossings : 0;
  kpis.reductionPct = kpis.avgBaselineS ? (kpis.avgSavedS / kpis.avgBaselineS) * 100 : 0;
  kpis.co2Kg = kpis.fuelSavedL * 2.68;

  /* Monthly before/after */
  const months = {};
  trips.forEach((t) => {
    const m = localParts(t.start).monthKey;
    (months[m] || (months[m] = [])).push(t);
  });
  const monthly = Object.keys(months).sort().map((m) => ({
    month: m,
    trips: months[m].length,
    avgDuration: round(avg(months[m].map((t) => t.duration))),
    avgBaseline: round(avg(months[m].map((t) => t.baseline))),
    avgSaved: round(avg(months[m].map((t) => t.saved))),
    preempted: sum(months[m].map((t) => t.junctions.filter((c) => c.preempted).length)),
  }));

  /* Distribution of seconds saved per trip (every trip lands in exactly one bin) */
  const bins = [0, 30, 60, 90, 120, 180, 240, 1e9];
  const savedHistogram = bins.slice(0, -1).map((lo, i) => ({
    label: bins[i + 1] > 1e8 ? `${lo}+` : `${lo}–${bins[i + 1]}`,
    count: trips.filter((t) => t.saved >= lo && t.saved < bins[i + 1]).length,
  }));
  const slower = trips.filter((t) => t.saved < 0).length;
  if (slower) savedHistogram.unshift({ label: '< 0', count: slower });

  /* By hospital */
  const byHospital = hospitals.map((h) => {
    const ts = trips.filter((t) => t.destinationType === 'hospital' && t.destination === h.id);
    return { id: h.id, name: h.name, trips: ts.length, avgSaved: round(avg(ts.map((t) => t.saved))), totalSavedMin: round(sum(ts.map((t) => t.saved)) / 60), avgDuration: round(avg(ts.map((t) => t.duration))) };
  });

  /* By priority */
  const byPriority = ['Critical', 'Urgent', 'Non-urgent'].map((p) => {
    const ts = trips.filter((t) => t.priority === p);
    return { priority: p, trips: ts.length, avgSaved: round(avg(ts.map((t) => t.saved))) };
  });

  /* Per junction */
  const monthsSpan = period ? Math.max(1, (period.to - period.from) / DAY_MS / 30.44) : 1;
  const junctionStats = junctions.map((j) => {
    const cs = crossings.filter((c) => c.j === j.id);
    const byHour = Array.from({ length: 24 }, () => []);
    cs.forEach((c) => byHour[localParts(c.trip.start + c.arrival * 1000).hour].push(c.baseWait));
    const pre = cs.filter((c) => c.preempted);
    return {
      id: j.id, name: j.name, poc: j.poc, scatsSite: j.scatsSite,
      crossings: cs.length,
      preempted: pre.length,
      perMonth: cs.length / monthsSpan,
      avgBaseWait: avg(cs.map((c) => c.baseWait)),
      avgWait: avg(cs.map((c) => c.wait)),
      savedMin: sum(cs.map((c) => c.baseWait - c.wait)) / 60,
      preemptRate: cs.length ? pre.length / cs.length : 0,
      avgGreenLead: avg(pre.map((c) => c.greenLead).filter((x) => x != null)),
      phaseCorrections: cs.filter((c) => c.lineCorrected || c.override === 'PHASE_CORRECTION').length,
      redExposure: cs.length ? cs.filter((c) => c.baseWait > 2).length / cs.length : 0,
      pedProtect: cs.filter((c) => c.pedProtect > 0).length,
      etaMae: avg(cs.map((c) => c.etaMae).filter((x) => x != null)),
      byHour: byHour.map((xs) => (xs.length ? round(avg(xs)) : null)),
      byHourN: byHour.map((xs) => xs.length),
      peakCongestion: Math.max(...j.congestion.weekday),
      arms: j.arms.length,
      incidents: j.incidents,
    };
  });

  /* Rollout ranking: delay exposure + collision risk */
  const maxDelay = Math.max(...junctionStats.map((s) => s.avgBaseWait * s.perMonth), 1);
  const riskRaw = (s) => (s.incidents.ambulanceCollisions * 4 + s.incidents.nearMisses + s.incidents.redLightCrossings / 8)
    * (0.6 + 0.4 * s.redExposure) * (0.7 + 0.3 * s.peakCongestion) * (s.arms >= 4 ? 1.15 : 1);
  const maxRisk = Math.max(...junctionStats.map(riskRaw), 1);
  const ranking = junctionStats
    .map((s) => {
      const delayScore = (s.avgBaseWait * s.perMonth) / maxDelay;
      const riskScore = riskRaw(s) / maxRisk;
      return { ...s, delayScore, riskScore, score: 0.55 * delayScore + 0.45 * riskScore };
    })
    .sort((a, b) => b.score - a.score)
    .map((s, i) => ({ ...s, rank: i + 1, rollout: i < 8 ? 'Phase 1 · 2027' : i < 16 ? 'Phase 2 · 2028' : 'Phase 3 · 2029' }));

  /* Cost / benefit vs RM2.0M */
  const a = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
  const perTripSaved = kpis.avgSavedS;
  const hoursSavedYear = (perTripSaved * a.evpTripsPerYear) / 3600;
  const fuelPerTrip = kpis.trips ? kpis.fuelSavedL / kpis.trips : 0;
  const benefitYear = {
    collisionsRM: a.collisionsPerYear * a.collisionReduction * a.costPerCollisionRM,
    fleetTimeRM: hoursSavedYear * a.ambulanceHourValueRM,
    fuelRM: fuelPerTrip * a.evpTripsPerYear * a.dieselRMPerL,
  };
  benefitYear.totalRM = benefitYear.collisionsRM + benefitYear.fleetTimeRM + benefitYear.fuelRM;
  let cumCost = 0;
  let cumBenefit = 0;
  const costBenefit = BUDGET.years.map((y, i) => {
    const cost = (i === 0 ? BUDGET.capexRM : 0) + BUDGET.maintenancePerYearRM;
    // Benefits ramp with the phased rollout: 8, 16, 22, 22 junctions.
    const coverage = [8, 16, 22, 22][i] / 22;
    const benefit = benefitYear.totalRM * coverage;
    cumCost += cost;
    cumBenefit += benefit;
    return { year: y, cost, benefit: Math.round(benefit), cumCost, cumBenefit: Math.round(cumBenefit), coverage };
  });
  const payback = costBenefit.find((r) => r.cumBenefit >= r.cumCost)?.year || null;

  return {
    kpis, period, historyPeriod, monthsSpan, monthly, savedHistogram, byHospital, byPriority, junctionStats, ranking,
    costBenefit: { rows: costBenefit, benefitYear, hoursSavedYear, payback, assumptions: a, budget: BUDGET, roi: cumBenefit / BUDGET.totalRM },
  };
}

/** ETA accuracy on live trips: predicted vs actual at each horizon. */
export function etaAccuracy(trips) {
  const pts = [];
  trips.forEach((t) => t.junctions.forEach((c) => (c.preds || []).forEach(([tp, eta, lo, hi]) => {
    const actual = c.arrival - tp;
    if (actual >= 0) pts.push({ actual, eta, inBand: actual >= lo && actual <= hi, err: Math.abs(eta - actual), model: t.models?.eta ?? 0 });
  })));
  const buckets = [[0, 15], [15, 30], [30, 60], [60, 120]].map(([lo, hi]) => {
    const p = pts.filter((x) => x.actual >= lo && x.actual < hi);
    return { range: `${lo}–${hi} s`, mae: p.length ? round(avg(p.map((x) => x.err))) : null, coverage: p.length ? p.filter((x) => x.inBand).length / p.length : null, n: p.length };
  });
  return { n: pts.length, mae: pts.length ? round(avg(pts.map((x) => x.err))) : null, coverage: pts.length ? pts.filter((x) => x.inBand).length / pts.length : null, buckets, points: pts };
}

/** Compact facts for the LLM assistant and monthly summaries. */
export function analyticsDigest(an, { trips: allTrips, junctions, hospitals, alerts = [], quarantined = [], models = {}, month }) {
  const jName = Object.fromEntries(junctions.map((j) => [j.id, j.name]));
  const hName = Object.fromEntries(hospitals.map((h) => [h.id, h.name]));
  const trips = allTrips.filter((t) => t.arrived !== false);
  const monthTrips = month ? trips.filter((t) => localParts(t.start).monthKey === month) : [];
  const day = (ms) => localParts(ms).dateKey;
  const perJunctionMonth = {};
  monthTrips.forEach((t) => t.junctions.forEach((c) => {
    const s = perJunctionMonth[c.j] || (perJunctionMonth[c.j] = { crossings: 0, residualWaitS: 0, baselineWaitS: 0 });
    s.crossings++; s.residualWaitS += c.wait; s.baselineWaitS += c.baseWait;
  }));
  const k = an.kpis;
  const open = alerts.filter((a) => a.status === 'open');
  return {
    scope: 'GreenLight EVP prototype, MBKS Kuching South. Simulated pilot data on the real road network.',
    asOf: day(Date.now()),
    period: an.period ? { from: day(an.period.from), to: day(an.period.to) } : null,
    definitions: {
      conflictingMovementsAvoided: 'Junction crossings where the ambulance would have met a red without EVP (> 2 s wait) but passed without stopping.',
      priorityConflictsResolved: 'Times one ambulance yielded to a higher-priority (or nearer) ambulance at the same junction.',
      phaseCorrections: 'Greens re-targeted because the ambulance took a different movement than predicted.',
      preempted: 'Crossings where the EVP green was already showing for the ambulance\'s movement when it arrived.',
    },
    kpis: {
      trips: k.trips, liveTrips: k.liveTrips, tripsEndedEarlyExcluded: k.endedEarly, avgSecondsSavedPerTrip: round(k.avgSavedS), totalHoursSaved: round(k.totalSavedS / 3600),
      avgTripS: round(k.avgDurationS), avgBaselineTripS: round(k.avgBaselineS), reductionPct: round(k.reductionPct),
      junctionCrossings: k.crossings, preemptedPct: round(k.preemptRate * 100), conflictingMovementsAvoided: k.conflictsAvoided,
      priorityConflictsResolved: k.priorityConflicts, phaseCorrections: k.phaseCorrections, avgGreenLeadS: round(k.avgGreenLead), pedestrianProtectionEvents: k.pedProtect,
      safetyOverrides: k.overrides, fuelSavedL: round(k.fuelSavedL), idleHoursSaved: round(k.idleSavedH),
    },
    monthly: an.monthly,
    byHospital: an.byHospital.map((h) => ({ ...h, name: hName[h.id] })),
    byPriority: an.byPriority,
    junctionsAllTime: an.junctionStats.map((s) => ({ id: s.id, name: s.name, crossings: s.crossings, avgBaselineWaitS: round(s.avgBaseWait), avgResidualWaitS: round(s.avgWait), totalMinutesSaved: round(s.savedMin), preemptedPct: round(s.preemptRate * 100), pedProtect: s.pedProtect, poc: s.poc })),
    month: month ? {
      month, trips: monthTrips.length,
      junctions: Object.entries(perJunctionMonth).map(([id, s]) => ({ id, name: jName[id], ...s, residualWaitS: round(s.residualWaitS), baselineWaitS: round(s.baselineWaitS) })).sort((a, b) => b.baselineWaitS - a.baselineWaitS),
    } : null,
    rolloutTop10: an.ranking.slice(0, 10).map((r) => ({ rank: r.rank, id: r.id, name: r.name, phase: r.rollout, delayScore: round(r.delayScore, 2), riskScore: round(r.riskScore, 2), collisions: r.incidents.ambulanceCollisions, nearMisses: r.incidents.nearMisses })),
    costBenefit: {
      budgetRM: BUDGET.totalRM, benefitPerYearRM: Math.round(an.costBenefit.benefitYear.totalRM), cumulativeBenefitBy2030RM: an.costBenefit.rows[an.costBenefit.rows.length - 1].cumBenefit,
      benefitToBudgetRatio: round(an.costBenefit.roi, 2), paybackYear: an.costBenefit.payback, assumptions: an.costBenefit.assumptions,
    },
    security: {
      scope: 'This live session only',
      alerts: alerts.length, open: open.length, quarantinedUnits: quarantined,
      repeatsFolded: alerts.reduce((s, a) => s + Math.max(0, (a.count || 1) - 1), 0),
      byType: alerts.reduce((m, a) => { m[a.type] = (m[a.type] || 0) + 1; return m; }, {}),
    },
    models,
    recentLiveTrips: trips.filter((t) => t.source === 'live').slice(0, 8).map((t) => ({ id: t.id, ambulance: t.ambulanceId, to: t.destinationName, priority: t.priority, durationS: t.duration, savedS: t.saved, junctions: t.junctions.map((c) => c.j).join(' ') })),
  };
}
