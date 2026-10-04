// Global sailing search: sailors, coaches, regattas, clubs and boats across
// Clubspot (usoda.org and thousands of club sites worldwide) plus Regatta
// Network's event calendar. Every query here hits an index on Clubspot except
// sail-number / boat-name lookups, which are slower and capped by a timeout.

import { clubKey, clubQueryVariants, isAbbreviation } from "./clubs";
import { escapeRe, parse, titleCase } from "./clubspot";
import { searchRegattaNetwork } from "./regattanetwork";
import { normalize } from "./standings";

import type { SearchType } from "./search-types";
export { SEARCH_TYPES, type SearchType } from "./search-types";

export type SailorHit = {
  name: string;
  regattas: number;
  clubs: string[];
  sail: string;
  lastRegatta: string;
  lastDate: string;
  classes: string[];
  coach: boolean;
  /** How the name relates to the query: the person searched for, a near-miss, a similar first name, or just the same surname. */
  match: "exact" | "close" | "similar" | "surname";
};
export type RegattaHit = {
  id: string;
  name: string;
  date: string | null;
  club: string;
  location: string;
  source: "Clubspot" | "Regatta Network";
  url: string;
  external: boolean;
};
export type ClubHit = { id: string; name: string; location: string; url: string; match: "name" | "initials" };
// One boat = one sailor racing one sail number; their regattas are rolled up rather than listed.
export type BoatHit = {
  boat: string;
  sail: string;
  sailor: string;
  regatta: string; // most recent regatta
  regattaId: string;
  date: string; // most recent regatta date
  firstDate: string;
  regattas: number;
};

export type SearchResults = {
  q: string;
  /** The sailor the query names (exact full name, or the closest spelling). */
  best: SailorHit | null;
  sailors: SailorHit[];
  coaches: SailorHit[];
  regattas: RegattaHit[];
  clubs: ClubHit[];
  boats: BoatHit[];
  sources: { name: string; ok: boolean }[];
  tookMs: number;
};

type Ptr = { objectId: string };
const within = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]).catch(() => fallback);

function words(q: string): string[] {
  return normalize(q)
    .split(" ")
    .filter((w) => w.length >= 2)
    .slice(0, 5);
}

// ---------- people ----------

type RegRow = {
  objectId: string;
  firstName?: string;
  lastName?: string;
  sailNumber?: string | number;
  boatName?: string;
  regattaObject?: Ptr & { name?: string; startDate?: { iso: string }; clubObject?: Ptr & { name?: string } };
  boatClassObject?: Ptr & { name?: string; scoring?: { method?: string } };
};
const REG_KEYS = [
  "firstName", "lastName", "sailNumber", "boatName",
  "regattaObject.name", "regattaObject.startDate", "regattaObject.clubObject.name",
  "boatClassObject.name", "boatClassObject.scoring",
].join(",");
const REG_INCLUDE = "regattaObject,regattaObject.clubObject,boatClassObject";

async function registrations(where: Record<string, unknown>, limit = 400): Promise<RegRow[]> {
  const r = await parse<{ results?: RegRow[] }>("classes/registrations", {
    _method: "GET",
    where: { ...where, regattaObject: { $exists: true } },
    include: REG_INCLUDE,
    keys: REG_KEYS,
    limit,
  });
  return r.results ?? [];
}

const SAIL_LIKE = /^[a-z]{0,3}\s?\d{2,6}$/i;

// Registrations that aren't a sailor racing a boat.
const NON_RACING = /coach|spectator|withdrawn|removed|parent|volunteer|support boat/i;
const isCoachClass = (row: RegRow) => /coach/i.test(row.boatClassObject?.name ?? "");

function groupPeople(rows: RegRow[], firstFilter: string): SailorHit[] {
  const people = new Map<string, SailorHit & { regattaIds: Set<string>; clubSet: Set<string>; classSet: Set<string> }>();
  for (const r of rows) {
    const name = `${r.firstName ?? ""} ${r.lastName ?? ""}`.replace(/\s+/g, " ").trim();
    if (!name || !r.regattaObject?.startDate) continue;
    const key = normalize(name);
    if (firstFilter && !normalize(r.firstName ?? "").startsWith(firstFilter)) continue;
    const p = people.get(key) ?? {
      name,
      regattas: 0,
      clubs: [],
      sail: "",
      lastRegatta: "",
      lastDate: "",
      classes: [],
      coach: false,
      match: "surname" as SailorHit["match"],
      regattaIds: new Set<string>(),
      clubSet: new Set<string>(),
      classSet: new Set<string>(),
    };
    p.regattaIds.add(r.regattaObject.objectId);
    if (r.regattaObject.clubObject?.name) p.clubSet.add(r.regattaObject.clubObject.name);
    if (r.boatClassObject?.name) p.classSet.add(r.boatClassObject.name.trim());
    if (isCoachClass(r)) p.coach = true;
    const date = r.regattaObject.startDate.iso;
    if (date > p.lastDate) {
      p.lastDate = date;
      p.lastRegatta = r.regattaObject.name ?? "";
      if (r.sailNumber) p.sail = String(r.sailNumber);
    }
    people.set(key, p);
  }
  return [...people.values()]
    .map(({ regattaIds, clubSet, classSet, ...p }) => ({
      ...p,
      regattas: regattaIds.size,
      clubs: [...clubSet].slice(0, 4),
      classes: [...classSet].slice(0, 6),
    }))
    .sort((a, b) => b.regattas - a.regattas || b.lastDate.localeCompare(a.lastDate));
}

/** Edit distance, for "Wil" vs "Will" or "Margo" vs "Margot". */
function distance(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}

async function searchPeople(q: string): Promise<SailorHit[]> {
  const tokens = q.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || /^\d+$/.test(q.trim())) return [];
  const first = tokens.length > 1 ? tokens[0] : "";
  const last = tokens.length > 1 ? tokens.slice(1).join(" ") : tokens[0];
  const variants = [...new Set([last, titleCase(last.toLowerCase()), last.toLowerCase(), last.toUpperCase()])];
  const firstPrefix = first ? titleCase(first.slice(0, 3).toLowerCase()) : "";
  const [named, surname, prefix] = await Promise.all([
    // The person themselves: never crowded out by a common surname's other registrations.
    first ? registrations({ lastName: { $in: variants }, firstName: { $regex: `^${escapeRe(firstPrefix)}` } }, 600) : [],
    registrations({ lastName: { $in: variants } }),
    registrations({ lastName: { $regex: `^${escapeRe(titleCase(last.toLowerCase()))}` } }, 200),
  ]);
  const seen = new Set<string>();
  const rows = [...named, ...surname, ...prefix].filter((r) => !seen.has(r.objectId) && seen.add(r.objectId));
  const people = groupPeople(rows, "");
  if (!first) return people.slice(0, 40);

  // Rank against the full name that was typed.
  const wantFirst = normalize(first);
  const wantLast = normalize(last);
  for (const p of people) {
    const [f, ...rest] = normalize(p.name).split(" ");
    const l = rest.join(" ");
    if (l !== wantLast && !l.endsWith(` ${wantLast}`)) continue;
    if (f === wantFirst) p.match = "exact";
    else if (f.startsWith(wantFirst) || wantFirst.startsWith(f)) p.match = "similar";
    else if (wantFirst.length >= 4 && distance(f, wantFirst) <= (wantFirst.length >= 7 ? 2 : 1)) p.match = "close";
  }
  const order = { exact: 0, close: 1, similar: 2, surname: 3 } as const;
  return people.sort((a, b) => order[a.match] - order[b.match] || b.regattas - a.regattas).slice(0, 40);
}

// ---------- boats ----------

async function searchBoats(q: string): Promise<BoatHit[]> {
  const t = q.trim();
  if (!t) return [];
  const sailLike = SAIL_LIKE.test(t);
  // sailNumber and boatName aren't indexed on Clubspot: $in / $exists force a full scan (10s+), while a
  // plain equality with a small limit stops as soon as it has enough matches. So run one query per variant.
  const variants = sailLike
    ? [...new Set([t.replace(/^[a-z]+\s?/i, ""), t.toUpperCase().replace(/\s+/g, "")])]
    : [...new Set([t, titleCase(t.toLowerCase())])];
  const field = sailLike ? "sailNumber" : "boatName";
  const batches = await Promise.all(
    variants.map((v) =>
      parse<{ results?: RegRow[] }>("classes/registrations", {
        _method: "GET",
        where: { [field]: v },
        include: REG_INCLUDE,
        keys: REG_KEYS,
        limit: 60,
      }).then((r) => r.results ?? [], () => [] as RegRow[]),
    ),
  );
  const seen = new Set<string>();
  const rows = batches
    .flat()
    .filter((r) => !seen.has(r.objectId) && !!seen.add(r.objectId))
    .filter((r) => r.regattaObject?.startDate && !NON_RACING.test(r.boatClassObject?.name ?? ""))
    .sort((a, b) => b.regattaObject!.startDate!.iso.localeCompare(a.regattaObject!.startDate!.iso));
  const boats = new Map<string, BoatHit & { ids: Set<string> }>();
  for (const r of rows) {
    const sailor = `${r.firstName ?? ""} ${r.lastName ?? ""}`.replace(/\s+/g, " ").trim();
    const sail = r.sailNumber != null ? String(r.sailNumber).trim() : "";
    const key = `${normalize(sailor)}|${sail.toUpperCase()}`;
    const regattaId = r.regattaObject!.objectId;
    const date = r.regattaObject!.startDate!.iso;
    let b = boats.get(key);
    if (!b) {
      b = { boat: r.boatName || "", sail, sailor, regatta: r.regattaObject?.name ?? "", regattaId, date, firstDate: date, regattas: 0, ids: new Set() };
      boats.set(key, b);
    }
    if (!b.boat && r.boatName) b.boat = r.boatName;
    if (b.ids.has(regattaId)) continue; // same regatta entered in two fleets
    b.ids.add(regattaId);
    b.regattas++;
    b.firstDate = date;
  }
  return [...boats.values()]
    .map(({ ids: _ids, ...b }) => b)
    .sort((a, b) => b.regattas - a.regattas || b.date.localeCompare(a.date))
    .slice(0, 30);
}

// ---------- regattas & clubs ----------

type RegattaRow = Ptr & {
  name?: string;
  startDate?: { iso: string };
  archived?: boolean;
  location?: { name?: string; city?: string; state?: string } | string;
  clubObject?: Ptr & { name?: string; city?: string; state?: string; country?: string };
};

async function searchClubspotRegattas(tokens: string[]): Promise<RegattaHit[]> {
  if (!tokens.length) return [];
  // Clubspot keywords are word prefixes, so "nationals" misses "National Championship": search the singular.
  const stems = tokens.map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
  const r = await parse<{ results?: RegattaRow[] }>("classes/regattas", {
    _method: "GET",
    where: { keywords: { $all: stems }, archived: { $ne: true } },
    include: "clubObject",
    keys: "name,startDate,archived,clubObject.name,clubObject.city,clubObject.state,clubObject.country",
    order: "-startDate",
    limit: 40,
  });
  // Clubs keep placeholder copies ("TEMPLATE | …", "… (Test)") they clone new events from.
  const placeholder = /^\s*template\b|\(test\)/i;
  return (r.results ?? []).filter((g) => !placeholder.test(g.name ?? "")).map((g) => {
    const c = g.clubObject;
    return {
      id: g.objectId,
      name: (g.name ?? "Regatta").trim(),
      date: g.startDate?.iso ?? null,
      club: c?.name ?? "",
      location: [c?.city, c?.state, c?.country && c.country !== "US" && c.country !== "USA" ? c.country : ""].filter(Boolean).join(", "),
      source: "Clubspot" as const,
      url: `/regatta/${g.objectId}`,
      external: false,
    };
  });
}

type ClubRow = Ptr & { name?: string; city?: string; state?: string; country?: string; subdomain?: string; customDomain?: string };

async function searchClubs(q: string): Promise<ClubHit[]> {
  const variants = clubQueryVariants(q); // "California Yacht Club" ↔ "California YC"
  if (!variants.length) return [];
  const keys = "name,city,state,country,subdomain,customDomain";
  const find = (where: Record<string, unknown>, limit = 20) =>
    parse<{ results?: ClubRow[] }>("classes/clubs", { _method: "GET", where, keys, limit }).then((r) => r.results ?? [], () => []);
  const abbr = isAbbreviation(q) ? normalize(q) : "";
  const [byName, byKeyword, byInitials] = await Promise.all([
    Promise.all(variants.map((ws) => find({ name: { $regex: `^${escapeRe(titleCase(ws.join(" ")))}` } }))).then((x) => x.flat()),
    Promise.all(variants.map((ws) => find({ keywords: { $all: ws } }))).then((x) => x.flat()),
    // Initials are only a hint ("CYC" could be California, Columbia or Chicago YC), so these are labelled as possible matches.
    abbr
      ? find({ name: { $regex: `^${[...abbr].map((c) => `${c}[a-z.']*`).join("\\s+(?:of\\s+|the\\s+)?")}\\b`, $options: "i" } }, 30)
      : Promise.resolve([] as ClubRow[]),
  ]);
  const want = clubKey(q);
  const seen = new Set<string>();
  const hits: ClubHit[] = [];
  const add = (rows: ClubRow[], match: ClubHit["match"]) => {
    for (const c of rows) {
      if (!c.name || seen.has(c.objectId)) continue;
      seen.add(c.objectId);
      hits.push({
        id: c.objectId,
        name: c.name.trim(),
        location: [c.city, c.state, c.country && !/^us/i.test(c.country) ? c.country : ""].filter(Boolean).join(", "),
        url: `/club/${c.objectId}`,
        match,
      });
    }
  };
  add(byName, "name");
  add(byKeyword, "name");
  add(byInitials, "initials");
  // For a bare abbreviation, only a club that actually uses those letters in its name is a name match;
  // Clubspot's keyword index also matches by initials, which are just possibilities.
  if (abbr) for (const h of hits) h.match = new RegExp(`\\b${abbr}\\b`).test(normalize(h.name)) ? "name" : "initials";
  // Exact name (in any spelling) first, then other name matches, then initials.
  const rank = (h: ClubHit) => (clubKey(h.name) === want ? 0 : h.match === "name" ? 1 : 2);
  return hits.sort((a, b) => rank(a) - rank(b)).slice(0, 30);
}

// ---------- everything ----------

export async function search(q: string, type: SearchType = "all"): Promise<SearchResults> {
  const t0 = Date.now();
  const tokens = words(q);
  const want = (k: SearchType) => type === "all" || type === k;
  const sources: { name: string; ok: boolean }[] = [];
  // Each source reports whether it answered in time; a slow or failing source never blocks the rest.
  const guard = <T,>(name: string, p: Promise<T>, fallback: T, ms = 9000): Promise<T> => {
    let done = false;
    return within(
      p.then((v) => {
        done = true;
        sources.push({ name, ok: true });
        return v;
      }),
      ms,
      fallback,
    ).then((v) => {
      if (!done) sources.push({ name, ok: false });
      return v;
    });
  };

  const [people, csRegattas, rnRegattas, clubs, boats] = await Promise.all([
    want("sailors") || want("coaches") ? guard("Clubspot sailors", searchPeople(q), [] as SailorHit[]) : [],
    want("regattas") ? guard("Clubspot regattas", searchClubspotRegattas(tokens), [] as RegattaHit[]) : [],
    want("regattas")
      ? guard(
          "Regatta Network",
          searchRegattaNetwork(tokens).then((events) =>
            events.map(
              (e): RegattaHit => ({
                id: `rn-${e.id}`,
                name: e.name,
                date: e.date,
                club: e.club,
                location: e.state,
                source: "Regatta Network",
                url: e.url,
                external: true,
              }),
            ),
          ),
          [] as RegattaHit[],
        )
      : [],
    want("clubs") ? guard("Clubspot clubs", searchClubs(q), [] as ClubHit[]) : [],
    // Boat-name / sail-number lookups aren't indexed on Clubspot: cap them.
    // Boat-name lookups are slow on Clubspot (unindexed), so "Everything" only checks sail numbers.
    type === "boats" || (type === "all" && SAIL_LIKE.test(q.trim()))
      ? guard("Clubspot boats", searchBoats(q), [] as BoatHit[], type === "boats" ? 9000 : 6000)
      : [],
  ]);

  const regattas = [...csRegattas, ...rnRegattas].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const racers = people.filter((p) => !p.coach || p.classes.some((c) => !NON_RACING.test(c)));
  // A full name picks out one person; a near-miss spelling is offered only when nobody matches exactly.
  const best = want("sailors") ? (racers.find((p) => p.match === "exact") ?? racers.find((p) => p.match === "close") ?? null) : null;
  return {
    q,
    best,
    sailors: want("sailors") ? racers.filter((p) => p !== best) : [],
    coaches: want("coaches") ? people.filter((p) => p.coach) : [],
    regattas,
    clubs,
    boats,
    sources,
    tookMs: Date.now() - t0,
  };
}
