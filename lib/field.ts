// Compact whole-fleet results, sent to the browser for comparisons, rivals,
// club team scores and ratings. Keys are short because a national
// championship has ~300 boats × ~10 races.

import type { Standing } from "./standings";

/** One race: [points, letter score, start index, discarded (1/0)]. */
export type FieldRace = [number | null, string | null, number | null, 0 | 1];

export type FieldRow = {
  id: string; // registration id
  n: string; // name
  s: string; // sail number
  c: string; // club
  p: number; // place
  f: string | null; // finals tier (Gold/Silver/…)
  net: number | null;
  r: (FieldRace | null)[]; // index = race number - 1
};

export function toField(standings: Standing[], raceCount: number): FieldRow[] {
  const starts = new Map<string, number>();
  const startIdx = (id: string | null | undefined) => {
    if (!id) return null;
    if (!starts.has(id)) starts.set(id, starts.size);
    return starts.get(id)!;
  };
  return standings.map((s) => {
    const r: (FieldRace | null)[] = Array.from({ length: raceCount }, () => null);
    for (const race of s.races) {
      if (race.race < 1 || race.race > raceCount) continue;
      r[race.race - 1] = [race.points, race.letter, startIdx(race.start), race.drop ? 1 : 0];
    }
    return { id: s.id, n: s.name, s: s.sail, c: s.club, p: s.place, f: s.fleet, net: s.net, r };
  });
}
