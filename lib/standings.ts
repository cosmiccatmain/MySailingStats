// Pure scoring helpers: turn Clubspot's raw per-registration scores into
// ranked standings and find a sailor in them. No I/O, so it is unit-testable.

export type RawScore = {
  race_number: number;
  points: number | null;
  letterScore?: string | null;
  scores?: number | null; // number of boats in that race's start
  throwout?: boolean;
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

function byScore(a: RawEntry, b: RawEntry): number {
  const an = num(a.net) ?? Number.POSITIVE_INFINITY;
  const bn = num(b.net) ?? Number.POSITIVE_INFINITY;
  if (an !== bn) return an - bn;
  return (num(a.total) ?? Infinity) - (num(b.total) ?? Infinity);
}

/**
 * Rank entries. Clubspot returns them unsorted and without a place, so we
 * compute it: when the event used qualifying + finals fleets, every boat in a
 * better finals fleet places ahead of every boat in a worse one (Clubspot
 * doesn't expose fleet names publicly, so fleets are ordered by the median net
 * score of their boats and labelled Gold/Silver/Bronze/Emerald). Within a
 * fleet — or the whole event when there were no finals — sort by net, then total.
 */
export function computeStandings(entries: RawEntry[], scoringMethod?: string): Standing[] {
  const scored = entries.filter((e) => (e.scoring_data?.length ?? 0) > 0 || num(e.net) !== null);
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
    const ordered = [...map.values()].sort(
      (a, b) =>
        median(a.map((e) => num(e.net) ?? Infinity)) - median(b.map((e) => num(e.net) ?? Infinity)),
    );
    const multi = ordered.length > 1;
    ordered.forEach((g, i) =>
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
        name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || participantName(r) || "Unknown",
        sail: r.sailNumber != null ? String(r.sailNumber) : "",
        club: r.clubName ?? "",
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
