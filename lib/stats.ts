import type { LoadedRegatta } from "./analysis";
import type { FieldRow } from "./field";
import { isOptiFleet } from "./fleets";
import { percentile, type RaceScore, type Standing } from "./standings";

export type RegattaResult = {
  id: string; // `${regattaId}:${classId}` — a sailor can race one class per regatta
  regattaId: string;
  club: string;
  name: string;
  date: string;
  url: string;
  fleet: string; // boat class name, e.g. "Opti Championship", "Optimist RWB"
  entrants: number;
  raceCount: number;
  winner: { name: string; net: number | null } | null;
  me: Standing;
};

export type RaceRow = RaceScore & {
  regattaId: string;
  regatta: string;
  date: string;
  pct: number | null;
};

export function allRaces(results: RegattaResult[]): RaceRow[] {
  return [...results]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((r) =>
      r.me.races.map((race) => ({
        ...race,
        regattaId: r.id,
        regatta: r.name,
        date: r.date,
        pct: raceBeatPct(race),
      })),
    );
}

/** Share of the start beaten in one race; letter scores (DNF, OCS…) count as 0. */
export function raceBeatPct(r: RaceScore): number | null {
  if (r.points == null || !r.starters) return null;
  if (r.letter) return 0;
  return percentile(r.points, r.starters);
}

export function summary(results: RegattaResult[]) {
  const races = allRaces(results);
  const finishes = races.filter((r) => r.points != null && !r.letter);
  const pcts = results.map((r) => percentile(r.me.place, r.entrants)).filter((x): x is number => x != null);
  const best = [...results].sort(
    (a, b) => (percentile(b.me.place, b.entrants) ?? -1) - (percentile(a.me.place, a.entrants) ?? -1),
  )[0];
  return {
    regattas: results.length,
    races: races.length,
    bestRegatta: best ?? null,
    avgPct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
    bestRace: finishes.length ? Math.min(...finishes.map((r) => r.points as number)) : null,
    top10Races: finishes.filter((r) => (r.points as number) <= 10).length,
    letters: races.filter((r) => r.letter).length,
    clubs: new Set(results.map((r) => r.club).filter(Boolean)).size,
  };
}

export function rollingAverage(values: (number | null)[], window: number): (number | null)[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v != null);
    return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
  });
}

export const FINISH_BUCKETS = [
  { label: "Top 10%", min: 90 },
  { label: "10–25%", min: 75 },
  { label: "25–50%", min: 50 },
  { label: "50–75%", min: 25 },
  { label: "Bottom 25%", min: 0 },
] as const;

export function finishDistribution(races: RaceRow[]) {
  const counts = FINISH_BUCKETS.map((b) => ({ bucket: b.label, races: 0 }));
  let letters = 0;
  for (const r of races) {
    if (r.letter) {
      letters += 1;
      continue;
    }
    if (r.pct == null) continue;
    const i = FINISH_BUCKETS.findIndex((b) => (r.pct as number) >= b.min);
    counts[i === -1 ? counts.length - 1 : i].races += 1;
  }
  return [...counts, { bucket: "Letter score", races: letters }];
}

export function byYear(results: RegattaResult[]) {
  const m = new Map<string, number[]>();
  for (const r of results) {
    const p = percentile(r.me.place, r.entrants);
    if (p == null) continue;
    const y = r.date.slice(0, 4);
    m.set(y, [...(m.get(y) ?? []), p]);
  }
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, ps]) => ({ year, avg: ps.reduce((a, b) => a + b, 0) / ps.length, regattas: ps.length }));
}

/**
 * Regattas with whole-fleet results, ready for ratings / head-to-head / clubs.
 * The sailor's own row is renamed to `canonicalName` so a nickname or typo on
 * one registration doesn't split their history. Optimist fleets only.
 */
export function toLoaded(
  results: RegattaResult[],
  fields: Record<string, FieldRow[]>,
  canonicalName: string,
): LoadedRegatta[] {
  return results
    .filter((r) => fields[r.id] && isOptiFleet(r.fleet))
    .map((r) => ({
      id: r.id,
      name: r.name,
      date: r.date,
      fleet: r.fleet,
      url: r.url,
      field: fields[r.id].map((row) => (row.id === r.me.id ? { ...row, n: canonicalName } : row)),
    }));
}

const FLEET_SIZES = [
  { label: "Under 30", max: 29 },
  { label: "30–79", max: 79 },
  { label: "80–149", max: 149 },
  { label: "150+", max: Infinity },
];

/** Average share of the fleet beaten, by fleet size. Buckets with no regattas are dropped. */
export function byFleetSize(results: RegattaResult[]) {
  return FLEET_SIZES.map((b, i) => {
    const min = i ? FLEET_SIZES[i - 1].max + 1 : 0;
    const ps = results
      .filter((r) => r.entrants >= min && r.entrants <= b.max)
      .map((r) => percentile(r.me.place, r.entrants))
      .filter((x): x is number => x != null);
    return { label: b.label, regattas: ps.length, avg: ps.length ? Math.round(ps.reduce((a, c) => a + c, 0) / ps.length) : null };
  }).filter((b) => b.regattas > 0);
}

export type SeasonRow = { year: string; regattas: number; races: number; avgPct: number | null; best: RegattaResult | null; podiums: number; topTen: number };

/** One row per calendar year, newest first. */
export function seasons(results: RegattaResult[]): SeasonRow[] {
  const by = new Map<string, RegattaResult[]>();
  for (const r of results) by.set(r.date.slice(0, 4), [...(by.get(r.date.slice(0, 4)) ?? []), r]);
  return [...by.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, rs]) => {
      const pcts = rs.map((r) => percentile(r.me.place, r.entrants)).filter((x): x is number => x != null);
      const best = [...rs].sort((a, b) => (percentile(b.me.place, b.entrants) ?? -1) - (percentile(a.me.place, a.entrants) ?? -1))[0] ?? null;
      return {
        year,
        regattas: rs.length,
        races: rs.reduce((n, r) => n + r.me.races.length, 0),
        avgPct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
        best,
        podiums: rs.filter((r) => r.me.place <= 3).length,
        topTen: rs.filter((r) => r.me.place <= 10).length,
      };
    });
}

/** Spread of race finishes (standard deviation of share beaten); lower = more consistent. */
export function consistency(results: RegattaResult[]): number | null {
  const ps = allRaces(results)
    .map((r) => r.pct)
    .filter((x): x is number => x != null);
  if (ps.length < 8) return null;
  const mean = ps.reduce((a, b) => a + b, 0) / ps.length;
  return Math.sqrt(ps.reduce((a, b) => a + (b - mean) ** 2, 0) / ps.length);
}
