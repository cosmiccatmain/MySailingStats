// Server-side access to sailing results on Clubspot. usoda.org and most US
// yacht-club regatta sites (local junior regattas included) run on Clubspot;
// their pages render in the browser from Clubspot's public Parse API and
// results service, so we call those directly.

import { computeStandings, normalize, type RawEntry, type Standing } from "./standings";

const PARSE_URL = "https://theclubspot.com/parse";
const PARSE_APP_ID = "myclubspot2017"; // public app id shipped in every Clubspot site's page JS
const RESULTS_URL = "https://results.theclubspot.com";
// Clubspot's results pages switch to the v5 scorer for regattas starting after this date.
const V5_CUTOFF = Date.parse("2024-12-31T23:59:59.999Z");

export type BoatClass = { id: string; name: string; method: string | null };

/** One regatta the sailor registered for, in the class (fleet) they sailed. */
export type Registration = {
  registrationId: string;
  regattaId: string;
  regatta: string;
  date: string; // ISO start date
  club: string;
  url: string;
  classId: string;
  className: string;
  method: string | null;
  sail: string;
};

async function parse<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${PARSE_URL}/${path}`, {
    method: "POST",
    headers: { "X-Parse-Application-Id": PARSE_APP_ID, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Clubspot ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

type Ptr = { objectId: string };
type RegRow = {
  objectId: string;
  firstName?: string;
  lastName?: string;
  sailNumber?: string | number;
  status?: string;
  archived?: boolean;
  regattaObject?: Ptr & {
    name?: string;
    startDate?: { iso: string };
    archived?: boolean;
    clubObject?: Ptr & { name?: string };
  };
  boatClassObject?: Ptr & { name?: string; scoring?: { method?: string } };
};

const titleCase = (s: string) => s.replace(/(^|[\s'-])(\p{L})/gu, (m) => m.toUpperCase());
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Every Clubspot regatta registration under this sailor's name, across all
 * clubs. The last name is matched exactly (in a few capitalisations, plus a
 * prefix match — these hit Clubspot's index, so it's fast); the first name is
 * then checked loosely so "Max" finds "Maxwell".
 */
export async function findRegistrations(fullName: string): Promise<Registration[]> {
  const tokens = fullName.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const first = tokens.length > 1 ? tokens[0] : "";
  const lastCandidates = new Set<string>();
  const rest = tokens.slice(tokens.length > 1 ? 1 : 0).join(" ");
  const lastWord = tokens[tokens.length - 1];
  for (const l of [rest, lastWord]) {
    for (const v of [l, titleCase(l.toLowerCase()), l.toLowerCase(), l.toUpperCase()]) lastCandidates.add(v);
  }

  // Two indexed lookups run in parallel ($or across them is far slower on Clubspot).
  const query = (lastName: unknown) =>
    parse<{ results?: RegRow[]; error?: string }>("classes/registrations", {
      _method: "GET",
      where: { lastName, regattaObject: { $exists: true } },
      include: "regattaObject,regattaObject.clubObject,boatClassObject",
      keys: [
        "firstName", "lastName", "sailNumber", "status", "archived",
        "regattaObject.name", "regattaObject.startDate", "regattaObject.archived",
        "regattaObject.clubObject.name", "boatClassObject.name", "boatClassObject.scoring",
      ].join(","),
      limit: 1000,
    });
  const [exact, prefix] = await Promise.all([
    query({ $in: [...lastCandidates] }),
    query({ $regex: `^${escapeRe(rest)}` }),
  ]);
  if (exact.error) throw new Error(exact.error);
  const rows = new Map<string, RegRow>();
  for (const r of [...(exact.results ?? []), ...(prefix.results ?? [])]) rows.set(r.objectId, r);

  const wantFirst = normalize(first);
  const wantLast = normalize(rest);
  const now = Date.now();
  const byKey = new Map<string, Registration & { confirmed: boolean }>();
  for (const r of rows.values()) {
    const rg = r.regattaObject;
    const bc = r.boatClassObject;
    if (!rg?.startDate?.iso || !bc?.objectId || rg.archived || r.archived) continue;
    if (Date.parse(rg.startDate.iso) > now) continue;
    if (bc.scoring?.method === "not_racing") continue;
    const last = normalize(r.lastName ?? "");
    if (last !== wantLast && last !== normalize(lastWord) && !last.startsWith(wantLast)) continue;
    if (wantFirst) {
      const f = normalize(r.firstName ?? "");
      if (!(f.startsWith(wantFirst) || (f.length >= 2 && wantFirst.startsWith(f)))) continue;
    }
    const key = `${rg.objectId}:${bc.objectId}`;
    const confirmed = r.status === "confirmed";
    const prev = byKey.get(key);
    if (prev && (prev.confirmed || !confirmed)) continue;
    byKey.set(key, {
      registrationId: r.objectId,
      regattaId: rg.objectId,
      regatta: rg.name ?? "Regatta",
      date: rg.startDate.iso,
      club: rg.clubObject?.name ?? "",
      url: `https://theclubspot.com/regatta/${rg.objectId}/results`,
      classId: bc.objectId,
      className: bc.name ?? "",
      method: bc.scoring?.method ?? null,
      sail: r.sailNumber != null ? String(r.sailNumber) : "",
      confirmed,
    });
  }
  return [...byKey.values()]
    .map(({ confirmed: _c, ...reg }) => reg)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function fetchResults(
  regattaId: string,
  boatClass: BoatClass,
  startDate: string,
): Promise<{ standings: Standing[]; raceCount: number }> {
  const version = Date.parse(startDate) > V5_CUTOFF ? "v5" : "v3";
  const res = await fetch(
    `${RESULTS_URL}/clubspot-results-${version}/${regattaId}?boatClassIDs=${boatClass.id}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Results ${regattaId} failed: ${res.status}`);
  const json = (await res.json()) as { scoresByRegistration?: RawEntry[]; races?: unknown[] };
  const standings = computeStandings(json.scoresByRegistration ?? [], boatClass.method ?? undefined);
  const raceCount = Math.max(json.races?.length ?? 0, ...standings.map((s) => s.races.length), 0);
  return { standings, raceCount };
}
