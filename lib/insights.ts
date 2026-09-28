// Plain-English findings from a sailor's results.

import { fleetTier, TIER_LABEL, TIERS, type Tier } from "./fleets";
import type { RatingPoint } from "./rating";
import { percentile } from "./standings";
import { allRaces, raceBeatPct, type RegattaResult } from "./stats";

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pctOf = (r: RegattaResult) => percentile(r.me.place, r.entrants);

export type TierSummary = {
  tier: Tier;
  regattas: number;
  avgPct: number | null;
  avgPerformance: number | null;
  best: RegattaResult | null;
};

export function tierSummaries(results: RegattaResult[], history: RatingPoint[]): TierSummary[] {
  const perf = new Map(history.map((h) => [h.regattaId, h.performance]));
  return TIERS.map((tier) => {
    const rs = results.filter((r) => fleetTier(r.fleet) === tier);
    const best = [...rs].sort((a, b) => (pctOf(b) ?? -1) - (pctOf(a) ?? -1))[0] ?? null;
    return {
      tier,
      regattas: rs.length,
      avgPct: avg(rs.map(pctOf).filter((x): x is number => x != null)),
      avgPerformance: avg(rs.map((r) => perf.get(r.id)).filter((x): x is number => x != null)),
      best,
    };
  }).filter((t) => t.regattas > 0);
}

/** Average share of the start beaten by race number within a regatta (race 1, race 2, …). */
export function byRaceNumber(results: RegattaResult[]) {
  const m = new Map<number, number[]>();
  for (const r of results)
    for (const race of r.me.races) {
      const p = raceBeatPct(race);
      if (p == null) continue;
      m.set(race.race, [...(m.get(race.race) ?? []), p]);
    }
  return [...m.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([, ps]) => ps.length >= 2)
    .map(([race, ps]) => ({ race: `R${race}`, avg: avg(ps)!, n: ps.length }));
}

export type Insight = { icon: string; text: string };

export function insights(results: RegattaResult[], history: RatingPoint[]): Insight[] {
  const out: Insight[] = [];
  if (!results.length) return out;
  const tiers = tierSummaries(results, history);
  const champ = tiers.find((t) => t.tier === "champ");
  const green = tiers.find((t) => t.tier === "green");
  if (champ?.avgPerformance != null && green?.avgPerformance != null) {
    const d = Math.round(champ.avgPerformance - green.avgPerformance);
    out.push({ icon: "⚖️", text:
      d > 0
        ? `Championship results rate ${d} points above your Green fleet results — tougher fleets count for more.`
        : `Green fleet results still rate ${-d} points above Championship — those fleets are much tougher. Keep going.`
    });
  }
  const byPerf = history.slice().sort((a, b) => b.performance - a.performance);
  const best = byPerf[0] && results.find((r) => r.id === byPerf[0].regattaId);
  if (best) {
    out.push({ icon: "🏆", text:
      `Best performance: ${best.me.place} of ${best.entrants} at ${best.name} (${TIER_LABEL[fleetTier(best.fleet)]}), rated ${Math.round(byPerf[0].performance)}.`
    });
  }
  const chrono = history.slice().sort((a, b) => a.date.localeCompare(b.date));
  if (chrono.length >= 3) {
    const last = chrono[chrono.length - 1];
    const yearAgo = chrono.filter((h) => Date.parse(h.date) <= Date.parse(last.date) - 365 * 864e5).pop() ?? chrono[0];
    const d = Math.round(last.after - yearAgo.before);
    if (Math.abs(d) >= 10) {
      out.push({ icon: "📈", text: `Your rating has ${d > 0 ? "climbed" : "dropped"} ${Math.abs(d)} points since ${new Date(yearAgo.date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}.` });
    }
  }
  const races = allRaces(results);
  const byRace = byRaceNumber(results);
  if (byRace.length >= 3) {
    const top = byRace.slice().sort((a, b) => b.avg - a.avg)[0];
    const first = byRace[0];
    const later = avg(byRace.slice(-3).map((x) => x.avg))!;
    out.push({ icon: "⏱️", text:
      later > first.avg + 5
        ? `You finish strong: ${Math.round(first.avg)}% of the fleet beaten in race 1, ${Math.round(later)}% in the last races.`
        : first.avg > later + 5
          ? `You start fast — ${Math.round(first.avg)}% beaten in race 1 vs ${Math.round(later)}% late in regattas. Finishing strong is the opportunity.`
          : `Consistent through a regatta — your best race number is ${top.race} (${Math.round(top.avg)}% beaten).`
    });
  }
  const penalties = races.filter((r) => r.letter && /^(OCS|UFD|BFD|ZFP|SCP)$/i.test(r.letter)).length;
  const scoredRaces = races.filter((r) => r.points != null).length;
  if (penalties) {
    out.push({ icon: "🚩", text: `${penalties} start penalt${penalties === 1 ? "y" : "ies"} (OCS/UFD/BFD) in ${scoredRaces} races — ${((penalties / scoredRaces) * 100).toFixed(1)}% of starts.` });
  } else if (scoredRaces >= 10) {
    out.push({ icon: "🚩", text: `No start penalties (OCS/UFD/BFD) in ${scoredRaces} races.` });
  }
  const pcts = races.map((r) => r.pct).filter((x): x is number => x != null);
  if (pcts.length >= 10) {
    const topQ = pcts.filter((p) => p >= 75).length;
    out.push({ icon: "🎯", text: `${Math.round((topQ / pcts.length) * 100)}% of your races finished in the top quarter of the start.` });
  }
  return out;
}
