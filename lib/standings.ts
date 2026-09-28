// Pure scoring helpers: turn Clubspot's raw per-registration scores into
// ranked standings and find a sailor in them. No I/O, so it is unit-testable.

export type RawScore = {
  race_number: number;
  points: number | null;
  letterScore?: string | null;
  scores?: number | null; // number of boats in that race's start
  throwout?: boolean;
  start_data?: { fleet_id?: string | null } | null; // which fleet's start the boat sailed in
};

export type RawEntry = {
  registrationObject: {
    objectId?: string;
    firstName?: string;
    lastName?: string;
    participantNames?: unknown[];
    clubName?: string;
    sailNumber?: string | number;
    sailNumber_country?: string;
    assignments?: Record<string, string>;
  };
  scoring_data?: RawScore[];
  total?: number | null;
  net?: number | null;
};

export type RaceScore = {
  race: number;
  points: number | null;
  letter: string | null;
  drop: boolean;
  starters: number | null;
  start?: string | null; // fleet whose start this was (differs between Gold/Silver finals, qualifying groups)
};

export type Standing = {
  id: string;
  name: string;
  sail: string;
  club: string;
  place: number;
  fleet: string | null; // finals fleet (Gold/Silver/...) when the event split into fleets
  net: number | null;
  total: number | null;
  races: RaceScore[];
};

const FLEET_LABELS = ["Gold", "Silver", "Bronze", "Emerald"];

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function median(xs: number[]): number {
  if (!xs.length) return Number.POSITIVE_INFINITY;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Racing Rules of Sailing A8 tie-break, as Clubspot applies it:
 * A8.1 — compare each boat's race scores, best to worst, excluding discards;
 * the first difference decides. A8.2 — then the last race, next-to-last, …
 * (discards included).
 */
export function tieBreakA8(a: RawEntry, b: RawEntry): number {
  const scores = (e: RawEntry, withDiscards: boolean) =>
    (e.scoring_data ?? []).filter((s) => num(s.points) !== null && (withDiscards || !s.throwout));
  const bestFirst = (e: RawEntry) => scores(e, false).map((s) => s.points as number).sort((x, y) => x - y);
  const A = bestFirst(a);
  const B = bestFirst(b);
  for (let i = 0; i < Math.min(A.length, B.length); i++) if (A[i] !== B[i]) return A[i] - B[i];
  const lastFirst = (e: RawEntry) => scores(e, true).sort((x, y) => y.race_number - x.race_number);
  const LA = lastFirst(a);
  const LB = lastFirst(b);
  for (let i = 0; i < Math.min(LA.length, LB.length); i++) {
    if (LA[i].points !== LB[i].points) return (LA[i].points as number) - (LB[i].points as number);
  }
  return 0;
}

function byScore(a: RawEntry, b: RawEntry): number {
  const an = num(a.net) ?? Number.POSITIVE_INFINITY;
  const bn = num(b.net) ?? Number.POSITIVE_INFINITY;
  if (an !== bn) return an - bn;
  return tieBreakA8(a, b);
}

/** An entry counts once it has at least one scored race (Clubspot hides the rest). */
const hasScores = (e: RawEntry) => (e.scoring_data ?? []).some((s) => num(s.points) !== null);

/**
 * Clubspot scores a race a boat has no result for as DNC (entries + 1 points)
 * — "unscored boats: treat as DNC" — but the raw data only lists races the boat
 * has a score in, and its `net` ignores the gaps. Fill them in and recompute
 * net with the class's discard count, as the official results page does.
 */
export function fillMissingRaces(entries: RawEntry[]): RawEntry[] {
  const raceNumbers = [...new Set(entries.flatMap((e) => (e.scoring_data ?? []).map((s) => s.race_number)))];
  const dnc = entries.length + 1;
  const discards = Math.max(0, ...entries.map((e) => (e.scoring_data ?? []).filter((s) => s.throwout).length));
  return entries.map((e) => {
    const have = new Set((e.scoring_data ?? []).map((s) => s.race_number));
    const missing = raceNumbers.filter((n) => !have.has(n));
    if (!missing.length) return e;
    const data: RawScore[] = [
      ...(e.scoring_data ?? []).map((s) => ({ ...s, throwout: false })),
      ...missing.map((n) => ({ race_number: n, points: dnc, letterScore: "DNC", scores: null, throwout: false })),
    ];
    // Discard the worst `discards` scores.
    const worst = data
      .map((s, i) => ({ i, p: num(s.points) ?? 0 }))
      .sort((a, b) => b.p - a.p || b.i - a.i)
      .slice(0, discards);
    worst.forEach(({ i }) => (data[i].throwout = true));
    const total = data.reduce((sum, s) => sum + (num(s.points) ?? 0), 0);
    const net = total - worst.reduce((sum, w) => sum + w.p, 0);
    return { ...e, scoring_data: data, total, net };
  });
}

/**
 * Order finals fleets into tiers (Gold, Silver, …). Boats were assigned to
 * finals fleets by their qualifying-series rank, so we rank everyone on
 * qualifying points (races sailed outside their finals fleet) and order the
 * fleets by the median qualifying rank of their boats. Fleets that are parallel
 * splits of one tier — e.g. "Silver A/B/C" at the 2025 Nationals — draw from
 * the same qualifying range; they are merged and scored together, as Clubspot does.
 * Falls back to median net score when there is no qualifying series.
 */
export function finalsTiers(fleets: RawEntry[][], finalsOf: (e: RawEntry) => string | undefined): RawEntry[][] {
  const qualifying = (e: RawEntry) =>
    (e.scoring_data ?? []).filter(
      (s) => num(s.points) !== null && s.start_data?.fleet_id && s.start_data.fleet_id !== finalsOf(e),
    );
  const all = fleets.flat();
  if (!all.some((e) => qualifying(e).length > 0)) {
    return [...fleets].sort(
      (a, b) => median(a.map((e) => num(e.net) ?? Infinity)) - median(b.map((e) => num(e.net) ?? Infinity)),
    );
  }
  const qualPoints = (e: RawEntry) => qualifying(e).reduce((sum, s) => sum + (s.points as number), 0);
  const rankOf = new Map([...all].sort((a, b) => qualPoints(a) - qualPoints(b)).map((e, i) => [e, i + 1]));
  const stats = fleets
    .map((g) => {
      const ranks = g.map((e) => rankOf.get(e) as number).sort((x, y) => x - y);
      return { g, ranks, med: median(ranks) };
    })
    .sort((a, b) => a.med - b.med);
  const tiers: RawEntry[][] = [];
  let prev: (typeof stats)[number] | null = null;
  for (const f of stats) {
    // A distinct lower tier has (almost) no boats that qualified ahead of the previous fleet's median.
    const overlap = prev ? f.ranks.filter((r) => r < prev!.med).length / f.ranks.length : 0;
    if (prev && overlap > 0.2) tiers[tiers.length - 1].push(...f.g);
    else tiers.push([...f.g]);
    prev = f;
  }
  return tiers;
}

/**
 * Rank entries. Clubspot returns them unsorted and without a place, so we
 * compute it the way Clubspot's results pages do: when the event used
 * qualifying + finals fleets, every boat in a better finals tier places ahead
 * of every boat in a worse one (labelled Gold/Silver/Bronze/Emerald — Clubspot
 * doesn't expose the names publicly). Within a tier — or the whole event when
 * there were no finals — sort by net points, breaking ties with RRS A8.
 * Checked boat-for-boat against Clubspot's rendered results for national,
 * regional and club events (see README).
 */
export function computeStandings(entries: RawEntry[], scoringMethod?: string): Standing[] {
  const scored = fillMissingRaces(entries.filter(hasScores));
  const finalsOf = (e: RawEntry) => e.registrationObject.assignments?.finals;
  const withFinals = scored.filter((e) => finalsOf(e)).length;
  const useFleets =
    (scoringMethod === undefined || scoringMethod === "one_design_with_fleets") &&
    withFinals > 0 &&
    withFinals >= scored.length * 0.5;

  const groups: { label: string | null; entries: RawEntry[] }[] = [];
  if (useFleets) {
    const map = new Map<string, RawEntry[]>();
    const none: RawEntry[] = [];
    for (const e of scored) {
      const f = finalsOf(e);
      if (!f) none.push(e);
      else map.set(f, [...(map.get(f) ?? []), e]);
    }
    const tiers = finalsTiers([...map.values()], finalsOf);
    const multi = tiers.length > 1;
    tiers.forEach((g, i) =>
      groups.push({ label: multi ? FLEET_LABELS[i] ?? `Fleet ${i + 1}` : null, entries: g }),
    );
    if (none.length) groups.push({ label: null, entries: none });
  } else {
    groups.push({ label: null, entries: scored });
  }

  const out: Standing[] = [];
  let place = 0;
  for (const g of groups) {
    for (const e of [...g.entries].sort(byScore)) {
      place += 1;
      const r = e.registrationObject;
      out.push({
        id: r.objectId ?? `${place}`,
        name:
          [r.firstName, r.lastName].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() ||
          participantName(r) ||
          "Unknown",
        sail: r.sailNumber != null ? String(r.sailNumber) : "",
        club: (r.clubName ?? "").trim(),
        place,
        fleet: g.label,
        net: num(e.net),
        total: num(e.total),
        races: (e.scoring_data ?? [])
          .map((s) => ({
            race: s.race_number,
            points: num(s.points),
            letter: s.letterScore ? String(s.letterScore) : null,
            drop: !!s.throwout,
            starters: num(s.scores),
            start: s.start_data?.fleet_id ?? null,
          }))
          .sort((a, b) => a.race - b.race),
      });
    }
  }
  return out;
}

function participantName(r: RawEntry["registrationObject"]): string {
  const p = r.participantNames?.[0];
  if (typeof p === "string") return p;
  if (p && typeof p === "object") {
    const o = p as Record<string, unknown>;
    return [o.firstName, o.lastName].filter((x) => typeof x === "string").join(" ");
  }
  return "";
}

/** Every token of the query must appear as a name token (prefix match allowed). */
export function nameMatches(fullName: string, query: string): boolean {
  const q = normalize(query).split(" ").filter(Boolean);
  if (!q.length) return false;
  const tokens = normalize(fullName).split(" ");
  return q.every((t) => tokens.some((n) => n === t || (t.length >= 3 && n.startsWith(t))));
}

export function findSailor(standings: Standing[], name?: string, sail?: string): Standing | null {
  const s = sail ? sail.replace(/\D/g, "") : "";
  if (name && name.trim()) {
    const hits = standings.filter((x) => nameMatches(x.name, name));
    if (hits.length <= 1 || !s) return hits[0] ?? null;
    return hits.find((x) => x.sail.replace(/\D/g, "") === s) ?? hits[0];
  }
  if (s) return standings.find((x) => x.sail.replace(/\D/g, "") === s) ?? null;
  return null;
}

/** Share of the fleet beaten, 0–100 (100 = won). */
export function percentile(place: number, of: number): number | null {
  if (!of || of < 2 || !place) return null;
  return Math.max(0, Math.min(100, ((of - place) / (of - 1)) * 100));
}
