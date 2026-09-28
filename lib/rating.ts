// Fleet-strength-aware sailor ratings (multi-player Elo), computed from every
// boat in every regatta the app has loaded.
//
// Each race is treated as a round of head-to-head games between boats that
// sailed the same start: finishing ahead of a boat is a win, behind is a loss.
// Beating strong sailors moves your rating more than beating beginners, so a
// mid-fleet finish in a Championship fleet can be worth more than a win in
// Green fleet. A sailor's first rating is seeded from the level of the fleet
// they first appear in (Championship > Red/White/Blue > Open > Green).

import type { FieldRow } from "./field";
import type { Tier } from "./fleets";
import { normalize } from "./standings";

// A 500-point gap means a typical Championship sailor beats a typical Green sailor ~95% of the time.
export const TIER_SEED: Record<Tier, number> = { champ: 1500, rwb: 1300, open: 1250, green: 1000 };
const K = 24; // rating change for a race where you beat (or lost to) everyone vs expectation
const NOT_RACED = /^(DNC|DNS|DNE|BYE)$/i;

export type RatedRegatta = { id: string; date: string; tier: Tier; field: FieldRow[] };
export type RatingPoint = {
  regattaId: string;
  date: string;
  tier: Tier;
  before: number;
  after: number;
  /** Performance rating: the rating these results were "worth" against this field. */
  performance: number;
  /** Average pre-regatta rating of the boats raced against. */
  fieldStrength: number;
};

export const sailorKey = (name: string) => normalize(name);

export function computeRatings(regattas: RatedRegatta[], track: string[]) {
  const rating = new Map<string, number>();
  const tracked = new Set(track);
  const history = new Map<string, RatingPoint[]>(track.map((k) => [k, []]));

  const sorted = [...regattas].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const reg of sorted) {
    const keys = reg.field.map((row) => sailorKey(row.n));
    keys.forEach((k) => {
      if (!rating.has(k)) rating.set(k, TIER_SEED[reg.tier]);
    });
    const before = new Map(keys.map((k) => [k, rating.get(k)!]));
    // Performance-rating accumulators for tracked sailors.
    const perf = new Map<string, { score: number; games: number; opp: number }>();

    const raceCount = Math.max(0, ...reg.field.map((row) => row.r.length));
    for (let ri = 0; ri < raceCount; ri++) {
      // Group boats by the start they sailed in this race.
      const starts = new Map<number, { key: string; pts: number }[]>();
      reg.field.forEach((row, i) => {
        const race = row.r[ri];
        if (!race || race[0] == null || (race[1] && NOT_RACED.test(race[1]))) return;
        const start = race[2] ?? -1;
        if (!starts.has(start)) starts.set(start, []);
        starts.get(start)!.push({ key: keys[i], pts: race[0] });
      });
      for (const boats of starts.values()) {
        const n = boats.length;
        if (n < 2) continue;
        const pre = boats.map((b) => rating.get(b.key)!);
        const deltas = boats.map((b, i) => {
          let expected = 0;
          let actual = 0;
          for (let j = 0; j < n; j++) {
            if (j === i) continue;
            expected += 1 / (1 + 10 ** ((pre[j] - pre[i]) / 400));
            actual += b.pts < boats[j].pts ? 1 : b.pts === boats[j].pts ? 0.5 : 0;
          }
          if (tracked.has(b.key)) {
            const acc = perf.get(b.key) ?? { score: 0, games: 0, opp: 0 };
            acc.score += actual;
            acc.games += n - 1;
            for (let j = 0; j < n; j++) if (j !== i) acc.opp += before.get(boats[j].key) ?? pre[j];
            perf.set(b.key, acc);
          }
          return (K * (actual - expected)) / (n - 1);
        });
        boats.forEach((b, i) => rating.set(b.key, pre[i] + deltas[i]));
      }
    }

    for (const [key, acc] of perf) {
      if (!acc.games) continue;
      const fieldStrength = acc.opp / acc.games;
      const p = acc.score / acc.games; // share of head-to-heads won
      // Linear performance rating (FIDE-style): ±400 around the field's average.
      const performance = fieldStrength + 800 * (p - 0.5);
      history.get(key)!.push({
        regattaId: reg.id,
        date: reg.date,
        tier: reg.tier,
        before: before.get(key)!,
        after: rating.get(key)!,
        performance,
        fieldStrength,
      });
    }
  }
  return { rating, history };
}
