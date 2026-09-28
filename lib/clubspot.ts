// Server-side access to USODA's results. usoda.org is a Clubspot site: the
// results archive and regatta pages are rendered in the browser from
// Clubspot's public Parse API and results service, so we call those directly.

import { computeStandings, type RawEntry, type Standing } from "./standings";

export const USODA_CLUB_ID = "kujycb4Vou";
const PARSE_URL = "https://theclubspot.com/parse";
const PARSE_APP_ID = "myclubspot2017"; // public app id shipped in usoda.org's own page JS
const RESULTS_URL = "https://results.theclubspot.com";
// usoda.org switches to the v5 scorer for regattas starting after this date.
const V5_CUTOFF = Date.parse("2024-12-31T23:59:59.999Z");

export type RegattaSummary = {
  id: string;
  name: string;
  date: string; // ISO start date
  url: string;
  external: string | null;
};

export type BoatClass = { id: string; name: string; method: string | null };

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

// Events on the USODA calendar that never have fleet results.
const NON_RACING = /clinic|practice|horizon|camp|webinar|meeting|training|symposium|coach/i;

export async function listRegattas(): Promise<RegattaSummary[]> {
  type CalEvent = { id: string; title: string; ts: number; external_regatta_url?: string };
  const data = await parse<{ result: CalEvent[] }>("functions/retrieve_regattas_for_calendar_v2", {
    club_id: USODA_CLUB_ID,
    start_timestamp: Date.parse("2010-01-01"),
    end_timestamp: Date.now() + 24 * 3600 * 1000,
    flow: "member_portal",
  });
  const now = Date.now();
  const seen = new Set<string>();
  return (data.result ?? [])
    .filter((e) => e.ts <= now && !NON_RACING.test(e.title) && !seen.has(e.id) && seen.add(e.id))
    .map((e) => ({
      id: e.id,
      name: e.title,
      date: new Date(e.ts).toISOString(),
      url: `https://www.usoda.org/regatta/${e.id}/results`,
      external: e.external_regatta_url || null,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function listBoatClasses(regattaId: string): Promise<BoatClass[]> {
  type Row = { objectId: string; name: string; scoring?: { method?: string } };
  const data = await parse<{ results: Row[] }>("classes/boatClasses", {
    _method: "GET",
    where: {
      regattaObject: { __type: "Pointer", className: "regattas", objectId: regattaId },
      archived: false,
    },
    keys: "name,scoring",
    order: "name",
    limit: 100,
  });
  return (data.results ?? [])
    .filter((c) => c.scoring?.method !== "not_racing")
    .map((c) => ({ id: c.objectId, name: c.name, method: c.scoring?.method ?? null }));
}

/** The Championship fleet: named "champ…" and not the Green (beginner) fleet. */
export function pickChampClass(classes: BoatClass[]): BoatClass | null {
  const racing = classes.filter((c) => !/green|withdrawn|removed|spectator|coach|vendor/i.test(c.name));
  return (
    racing.find((c) => /champ/i.test(c.name)) ??
    racing.find((c) => /\b(opti|optimist)\b/i.test(c.name) && !/team/i.test(c.name)) ??
    null
  );
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
