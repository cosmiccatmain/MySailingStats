// Instant stats for a sailor, shown the moment their name is searched: every
// registration on Clubspot plus finishes from their most recent regattas,
// fetched in parallel on the server. The full dashboard loads everything.

import { fetchResults, findRegistrations } from "./clubspot";
import { fleetTier, isOptiFleet, type Tier } from "./fleets";
import { percentile } from "./standings";

export type QuickResult = {
  regattaId: string;
  regatta: string;
  date: string;
  fleet: string;
  place: number;
  entrants: number;
  pct: number | null;
  tier: Tier;
};

export type QuickStats = {
  name: string;
  regattas: number; // distinct regattas registered for (racing classes, past events)
  sampled: number; // recent regattas whose results were checked
  results: QuickResult[]; // newest first
  best: QuickResult | null;
  avgPct: number | null;
  podiums: number;
  club: string;
  sail: string;
  firstDate: string | null;
  lastDate: string | null;
  fleets: string[];
};

const SAMPLE = 10;
const within = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]).catch(() => null);

export async function quickStats(name: string): Promise<QuickStats> {
  const regs = (await findRegistrations(name)).filter((r) => !/coach|spectator/i.test(r.className));
  const recent = regs.slice(0, SAMPLE);
  const found = await Promise.all(
    recent.map(async (r) => {
      const res = await within(fetchResults(r.regattaId, { id: r.classId, name: r.className, method: r.method }, r.date), 7000);
      const me = res?.standings.find((s) => s.id === r.registrationId);
      if (!res || !me) return null;
      const entrants = res.standings.length;
      return {
        result: {
          regattaId: r.regattaId,
          regatta: r.regatta,
          date: r.date,
          fleet: r.className,
          place: me.place,
          entrants,
          pct: percentile(me.place, entrants),
          tier: fleetTier(r.className),
        } satisfies QuickResult,
        club: me.club,
      };
    }),
  );
  const ok = found.filter((x): x is NonNullable<typeof x> => x != null);
  const results = ok.map((x) => x.result);
  // "Best" weighs the share of the fleet beaten by fleet strength, so a strong Championship result beats a Green win.
  const bonus: Record<Tier, number> = { champ: 30, rwb: 15, open: 10, green: 0 };
  const score = (r: QuickResult) => (r.pct ?? 0) + bonus[r.tier];
  const best = [...results].filter((r) => r.pct != null).sort((a, b) => score(b) - score(a) || a.place - b.place)[0] ?? null;
  const pcts = results.map((r) => r.pct).filter((p): p is number => p != null);
  const clubs = new Map<string, number>();
  for (const x of ok) if (x.club) clubs.set(x.club, (clubs.get(x.club) ?? 0) + 1);
  const fleets = [...new Set(regs.map((r) => r.className.trim()))];
  return {
    name,
    regattas: new Set(regs.map((r) => r.regattaId)).size,
    sampled: recent.length,
    results,
    best,
    avgPct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
    podiums: results.filter((r) => r.place <= 3).length,
    club: [...clubs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? regs[0]?.club ?? "",
    sail: regs.find((r) => r.sail && r.sail !== "TBD")?.sail ?? "",
    firstDate: regs.length ? regs[regs.length - 1].date : null,
    lastDate: regs[0]?.date ?? null,
    fleets: fleets.filter(isOptiFleet).concat(fleets.filter((f) => !isOptiFleet(f))).slice(0, 6),
  };
}
