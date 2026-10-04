// Global sailing search: sailors, coaches, regattas, clubs and boats across
// Clubspot (usoda.org and thousands of club sites worldwide) plus Regatta
// Network's event calendar. Every query here hits an index on Clubspot except
// sail-number / boat-name lookups, which are slower and capped by a timeout.

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
export type ClubHit = { id: string; name: string; location: string; url: string };
export type BoatHit = { boat: string; sail: string; sailor: string; regatta: string; regattaId: string; date: string };

export type SearchResults = {
  q: string;
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
    .sort((a, b) => b.regattas - a.regattas || b.lastDate.localeCompare(a.lastDate))
    .slice(0, 30);
}

async function searchPeople(q: string): Promise<SailorHit[]> {
  const tokens = q.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || /^\d+$/.test(q.trim())) return [];
  const first = tokens.length > 1 ? normalize(tokens[0]) : "";
  const last = tokens.length > 1 ? tokens.slice(1).join(" ") : tokens[0];
  const variants = [...new Set([last, titleCase(last.toLowerCase()), last.toLowerCase(), last.toUpperCase()])];
  const [exact, prefix] = await Promise.all([
    registrations({ lastName: { $in: variants } }),
    registrations({ lastName: { $regex: `^${escapeRe(titleCase(last.toLowerCase()))}` } }),
  ]);
  const seen = new Set<string>();
  const rows = [...exact, ...prefix].filter((r) => !seen.has(r.objectId) && seen.add(r.objectId));
  return groupPeople(rows, first);
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
        limit: 25,
      }).then((r) => r.results ?? [], () => [] as RegRow[]),
    ),
  );
  const seen = new Set<string>();
  const rows = batches.flat().filter((r) => !seen.has(r.objectId) && !!seen.add(r.objectId));
  return rows
    .filter((r) => r.regattaObject?.startDate)
    .map((r) => ({
      boat: r.boatName || "",
      sail: r.sailNumber != null ? String(r.sailNumber) : "",
      sailor: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
      regatta: r.regattaObject?.name ?? "",
      regattaId: r.regattaObject!.objectId,
      date: r.regattaObject!.startDate!.iso,
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
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

async function searchClubs(q: string, tokens: string[]): Promise<ClubHit[]> {
  if (!tokens.length) return [];
  const keys = "name,city,state,country,subdomain,customDomain";
  const [byKeyword, byName] = await Promise.all([
    parse<{ results?: ClubRow[] }>("classes/clubs", { _method: "GET", where: { keywords: { $all: tokens } }, keys, limit: 20 }),
    parse<{ results?: ClubRow[] }>("classes/clubs", {
      _method: "GET",
      where: { name: { $regex: `^${escapeRe(titleCase(q.trim().toLowerCase()))}` } },
      keys,
      limit: 20,
    }),
  ]);
  const seen = new Set<string>();
  return [...(byName.results ?? []), ...(byKeyword.results ?? [])]
    .filter((c) => c.name && !seen.has(c.objectId) && seen.add(c.objectId))
    .map((c) => ({
      id: c.objectId,
      name: c.name!.trim(),
      location: [c.city, c.state, c.country && !/^us/i.test(c.country) ? c.country : ""].filter(Boolean).join(", "),
      url: `/club/${c.objectId}`,
    }))
    .slice(0, 20);
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
    want("clubs") ? guard("Clubspot clubs", searchClubs(q, tokens), [] as ClubHit[]) : [],
    // Boat-name / sail-number lookups aren't indexed on Clubspot: cap them.
    // Boat-name lookups are slow on Clubspot (unindexed), so "Everything" only checks sail numbers.
    type === "boats" || (type === "all" && SAIL_LIKE.test(q.trim()))
      ? guard("Clubspot boats", searchBoats(q), [] as BoatHit[], type === "boats" ? 9000 : 6000)
      : [],
  ]);

  const regattas = [...csRegattas, ...rnRegattas].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return {
    q,
    sailors: want("sailors") ? people.filter((p) => !p.coach || p.classes.some((c) => !NON_RACING.test(c))) : [],
    coaches: want("coaches") ? people.filter((p) => p.coach) : [],
    regattas,
    clubs,
    boats,
    sources,
    tookMs: Date.now() - t0,
  };
}
