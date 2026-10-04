// Head-to-head records, rivals and club team results, computed from the
// whole-fleet results of each regatta.

import type { FieldRow } from "./field";
import { sailorKey } from "./rating";
import { clubResolver } from "./clubs";
import { percentile } from "./standings";

export type LoadedRegatta = {
  id: string; // `${regattaId}:${classId}`
  name: string;
  date: string;
  fleet: string;
  url: string;
  field: FieldRow[];
};

const NOT_RACED = /^(DNC|DNS|DNE|BYE)$/i;

export function findRow(field: FieldRow[], key: string): FieldRow | undefined {
  return field.find((r) => sailorKey(r.n) === key);
}

export type H2HRegatta = {
  id: string;
  name: string;
  date: string;
  fleet: string;
  a: FieldRow;
  b: FieldRow;
  entrants: number;
  racesA: number; // races where A finished ahead in the same start
  racesB: number;
};

export type H2H = {
  regattas: H2HRegatta[];
  regattasA: number; // regattas where A placed ahead
  regattasB: number;
  racesA: number;
  racesB: number;
  racesTied: number;
};

/** Head-to-head between two sailors across every regatta both sailed in the same fleet. */
export function headToHead(regattas: LoadedRegatta[], keyA: string, keyB: string): H2H {
  const out: H2H = { regattas: [], regattasA: 0, regattasB: 0, racesA: 0, racesB: 0, racesTied: 0 };
  for (const reg of [...regattas].sort((x, y) => y.date.localeCompare(x.date))) {
    const a = findRow(reg.field, keyA);
    const b = findRow(reg.field, keyB);
    if (!a || !b) continue;
    let ra = 0;
    let rb = 0;
    for (let i = 0; i < Math.max(a.r.length, b.r.length); i++) {
      const x = a.r[i];
      const y = b.r[i];
      // Only compare races sailed in the same start (Gold vs Silver finals aren't comparable).
      if (!x || !y || x[0] == null || y[0] == null || x[2] !== y[2]) continue;
      if ((x[1] && NOT_RACED.test(x[1])) || (y[1] && NOT_RACED.test(y[1]))) continue;
      if (x[0] < y[0]) ra++;
      else if (y[0] < x[0]) rb++;
      else out.racesTied++;
    }
    out.racesA += ra;
    out.racesB += rb;
    if (a.p < b.p) out.regattasA++;
    else if (b.p < a.p) out.regattasB++;
    out.regattas.push({ id: reg.id, name: reg.name, date: reg.date, fleet: reg.fleet, a, b, entrants: reg.field.length, racesA: ra, racesB: rb });
  }
  return out;
}

export type Rival = {
  key: string;
  name: string;
  club: string;
  shared: number;
  ahead: number; // regattas where you placed ahead of them
  behind: number;
  lastDate: string;
  avgGap: number; // average (their place - your place) as share of fleet, + means you're ahead
};

/** Sailors you've raced against most often, with your record against each. */
export function rivals(regattas: LoadedRegatta[], meKey: string, limit = 40): Rival[] {
  const map = new Map<string, Rival & { gapSum: number }>();
  for (const reg of regattas) {
    const me = findRow(reg.field, meKey);
    if (!me) continue;
    const n = reg.field.length;
    for (const row of reg.field) {
      const key = sailorKey(row.n);
      if (key === meKey) continue;
      const r = map.get(key) ?? {
        key,
        name: row.n,
        club: row.c,
        shared: 0,
        ahead: 0,
        behind: 0,
        lastDate: reg.date,
        avgGap: 0,
        gapSum: 0,
      };
      r.shared++;
      if (me.p < row.p) r.ahead++;
      else if (row.p < me.p) r.behind++;
      r.gapSum += (row.p - me.p) / Math.max(1, n);
      if (reg.date >= r.lastDate) {
        r.lastDate = reg.date;
        r.club = row.c || r.club;
      }
      map.set(key, r);
    }
  }
  return [...map.values()]
    .map(({ gapSum, ...r }) => ({ ...r, avgGap: gapSum / r.shared }))
    .filter((r) => r.shared >= 2)
    // Most-shared first; among equals, the closest battles.
    .sort((a, b) => b.shared - a.shared || Math.abs(a.avgGap) - Math.abs(b.avgGap))
    .slice(0, limit);
}

// ---------- clubs ----------

export { clubKey } from "./clubs";

/** One resolver over every club name in these regattas, so "AYC" joins a full name only when unambiguous. */
export function resolverFor(regattas: LoadedRegatta[]): (name: string) => string {
  return clubResolver(regattas.flatMap((r) => r.field.map((row) => row.c)));
}

export type ClubTeam = {
  key: string;
  club: string; // display name (most common spelling)
  sailors: FieldRow[];
  best: number;
  teamScore: number | null; // sum of the best 3 places (lower is better), like a team trophy
  teamRank: number | null;
};

export const TEAM_SIZE = 3;

/** Club team results for one regatta, ranked by the sum of each club's best three places. */
export function clubTeams(field: FieldRow[], resolve = clubResolver(field.map((r) => r.c))): ClubTeam[] {
  const map = new Map<string, FieldRow[]>();
  for (const row of field) {
    if (!row.c) continue;
    const k = resolve(row.c);
    if (!k) continue;
    map.set(k, [...(map.get(k) ?? []), row]);
  }
  const teams: ClubTeam[] = [...map.entries()].map(([key, rows]) => {
    const sailors = [...rows].sort((a, b) => a.p - b.p);
    const names = new Map<string, number>();
    rows.forEach((r) => names.set(r.c, (names.get(r.c) ?? 0) + 1));
    const club = [...names.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const teamScore =
      sailors.length >= TEAM_SIZE ? sailors.slice(0, TEAM_SIZE).reduce((s, r) => s + r.p, 0) : null;
    return { key, club, sailors, best: sailors[0].p, teamScore, teamRank: null };
  });
  const ranked = teams.filter((t) => t.teamScore != null).sort((a, b) => a.teamScore! - b.teamScore! || a.best - b.best);
  ranked.forEach((t, i) => (t.teamRank = i + 1));
  return teams.sort(
    (a, b) => (a.teamRank ?? Infinity) - (b.teamRank ?? Infinity) || b.sailors.length - a.sailors.length || a.best - b.best,
  );
}

export type ClubSeason = {
  regatta: LoadedRegatta;
  team: ClubTeam;
  teamsRanked: number;
  avgPct: number | null;
};

/** One club across every loaded regatta: its sailors, team score and rank each time. */
export function clubHistory(regattas: LoadedRegatta[], key: string, resolve = resolverFor(regattas)): ClubSeason[] {
  const out: ClubSeason[] = [];
  for (const reg of regattas) {
    const teams = clubTeams(reg.field, resolve);
    const team = teams.find((t) => t.key === key);
    if (!team) continue;
    const pcts = team.sailors.map((s) => percentile(s.p, reg.field.length)).filter((p): p is number => p != null);
    out.push({
      regatta: reg,
      team,
      teamsRanked: teams.filter((t) => t.teamRank != null).length,
      avgPct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
    });
  }
  return out.sort((a, b) => b.regatta.date.localeCompare(a.regatta.date));
}

/** Every club seen in the loaded regattas, most frequent first. */
export function allClubs(
  regattas: LoadedRegatta[],
  resolve = resolverFor(regattas),
): { key: string; club: string; entries: number; regattas: number }[] {
  const map = new Map<string, { names: Map<string, number>; entries: number; regattas: Set<string> }>();
  for (const reg of regattas) {
    for (const row of reg.field) {
      if (!row.c) continue;
      const k = resolve(row.c);
      if (!k) continue;
      const m = map.get(k) ?? { names: new Map(), entries: 0, regattas: new Set<string>() };
      m.names.set(row.c, (m.names.get(row.c) ?? 0) + 1);
      m.entries++;
      m.regattas.add(reg.id);
      map.set(k, m);
    }
  }
  return [...map.entries()]
    .map(([key, m]) => ({
      key,
      club: [...m.names.entries()].sort((a, b) => b[1] - a[1])[0][0],
      entries: m.entries,
      regattas: m.regattas.size,
    }))
    .sort((a, b) => b.regattas - a.regattas || b.entries - a.entries);
}
