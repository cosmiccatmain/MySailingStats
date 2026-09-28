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
  const byId = new Map<string, RegattaSummary>();
  for (const e of data.result ?? []) {
    if (e.ts > now || NON_RACING.test(e.title)) continue;
    const ext = e.external_regatta_url || null;
    // Many "external" entries point at the host club's Clubspot site
    // (theclubspot.com/regatta/<id>, abyc.org/regatta/<id>, …) — same API, so follow them.
    const hosted = ext?.match(/\/regatta\/([A-Za-z0-9]{10})(?:[/?#]|$)/)?.[1];
    const id = hosted ?? e.id;
    if (byId.has(id)) continue;
    byId.set(id, {
      id,
      name: e.title,
      date: new Date(e.ts).toISOString(),
      url: hosted ? `${ext!.split(/[?#]/)[0].replace(/\/$/, "")}/results` : `https://www.usoda.org/regatta/${id}/results`,
      external: hosted ? null : ext,
    });
  }
  return [...byId.values()].sort((a, b) => b.date.localeCompare(a.date));
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

/**
 * The Championship-fleet classes. Usually one "Opti Championship" class; some
 * host clubs instead split the champ fleet into e.g. "Opti Gold"/"Opti Silver".
 * Green (beginner) fleet and team racing are never included.
 */
export function pickChampClasses(classes: BoatClass[]): BoatClass[] {
  const racing = classes.filter(
    (c) => !/green|withdrawn|removed|spectator|coach|vendor|team ?rac|parent/i.test(c.name),
  );
  const champ = racing.filter((c) => /champ/i.test(c.name));
  if (champ.length) return champ;
  return racing.filter((c) => /\b(opti|optimist)\b/i.test(c.name) || racing.length === 1);
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
