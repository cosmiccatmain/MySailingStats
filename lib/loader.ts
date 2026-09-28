// Browser-side loading and caching of a sailor's results: every Clubspot
// regatta they registered for, their row, and the whole fleet for each.

import type { FieldRow } from "./field";
import type { Standing } from "./standings";
import type { RegattaResult } from "./stats";

export type Registration = {
  registrationId: string;
  regattaId: string;
  regatta: string;
  date: string;
  club: string;
  url: string;
  classId: string;
  className: string;
  method: string | null;
};

type RegattaResponse = {
  entrants: number;
  raceCount: number;
  winner: { name: string; net: number | null } | null;
  match: Standing | null;
  field?: FieldRow[];
  error?: string;
};

export type Unscored = { id: string; name: string; date: string; url: string; fleet: string; club: string };

export type Store = {
  results: RegattaResult[];
  unscored: Unscored[]; // registered, but no online scores (PDF results, didn't sail, …)
  checked: Record<string, true>; // regatta:class keys already loaded whose results are final
  excluded: string[]; // keys the user marked "not me"
  scannedAt: string | null;
};
export type Fields = Record<string, FieldRow[]>; // whole-fleet results by RegattaResult.id

export const EMPTY: Store = { results: [], unscored: [], checked: {}, excluded: [], scannedAt: null };

// v3: results carry whole-fleet data and RRS A8 tie-breaks; older caches are ignored (rescanned).
const storeKey = (name: string) => `mss:v3:${name.trim().toLowerCase()}`;
const fieldsKey = (name: string) => `mss:v3:fields:${name.trim().toLowerCase()}`;
const FINAL_AFTER_DAYS = 14;
const CONCURRENCY = 6;

export function readJson<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function writeJson(key: string, v: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(v));
    return true;
  } catch {
    return false; // storage full or blocked: data just won't persist
  }
}

export function loadCached(name: string): { store: Store; fields: Fields } {
  return { store: { ...EMPTY, ...readJson(storeKey(name), EMPTY) }, fields: readJson<Fields>(fieldsKey(name), {}) };
}
export function saveCached(name: string, store: Store, fields: Fields) {
  writeJson(storeKey(name), store);
  if (!writeJson(fieldsKey(name), fields)) {
    // Too big for this browser's storage: keep the most recent fleets.
    const recent = Object.fromEntries(
      store.results
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 20)
        .filter((r) => fields[r.id])
        .map((r) => [r.id, fields[r.id]]),
    );
    writeJson(fieldsKey(name), recent);
  }
}

export class StaleAppError extends Error {
  constructor() {
    super("the app was updated — please reload the page");
  }
}

/** fetch + JSON that survives non-JSON replies (e.g. a page left open across an app update). */
export async function getJson<T>(url: string): Promise<{ ok: boolean; status: number; body: T & { error?: string } }> {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, body: JSON.parse(text) };
  } catch {
    if (res.status === 404) throw new StaleAppError();
    throw new Error(`unexpected reply from server (HTTP ${res.status}) — try reloading the page`);
  }
}

export type Progress = { done: number; total: number; failed: number };

/**
 * Load (or refresh) a sailor. `full` starts over; otherwise only regattas not
 * yet final are fetched. Calls `onUpdate` as results arrive so the UI fills in.
 */
export async function scanSailor(
  name: string,
  opts: {
    full: boolean;
    onUpdate?: (store: Store, fields: Fields, progress: Progress) => void;
    isCancelled?: () => boolean;
  },
): Promise<{ store: Store; fields: Fields; failed: number }> {
  const prev = loadCached(name);
  let store: Store = opts.full ? { ...EMPTY, excluded: prev.store.excluded } : prev.store;
  const fields: Fields = opts.full ? {} : { ...prev.fields };

  const res = await getJson<{ registrations?: Registration[] }>(`/api/sailor?${new URLSearchParams({ name })}`);
  if (!res.ok || !res.body.registrations) throw new Error(res.body.error ?? `HTTP ${res.status}`);
  const key = (r: Registration) => `${r.regattaId}:${r.classId}`;
  // Re-fetch regattas whose whole-fleet data is missing (e.g. trimmed from storage).
  const todo = res.body.registrations.filter(
    (r) => !store.excluded.includes(key(r)) && (!store.checked[key(r)] || (!fields[key(r)] && store.results.some((x) => x.id === key(r)))),
  );
  const progress: Progress = { done: 0, total: todo.length, failed: 0 };
  opts.onUpdate?.(store, fields, progress);

  const queue = [...todo];
  const worker = async () => {
    while (queue.length && !opts.isCancelled?.()) {
      const r = queue.shift()!;
      const id = key(r);
      try {
        let data: RegattaResponse | null = null;
        // "pdf" / "external_link" classes publish results outside Clubspot.
        if (r.method !== "pdf" && r.method !== "external_link") {
          const qs = new URLSearchParams({ class: r.classId, reg: r.registrationId, date: r.date, method: r.method ?? "" });
          const rr = await getJson<RegattaResponse>(`/api/regatta/${r.regattaId}?${qs}`);
          if (!rr.ok) throw new Error(rr.body.error);
          data = rr.body;
        }
        const results = store.results.filter((x) => x.id !== id);
        const unscored = store.unscored.filter((x) => x.id !== id);
        const scored = data?.match && data.match.races.some((x) => x.points != null);
        if (data && scored) {
          results.push({
            id,
            regattaId: r.regattaId,
            club: r.club,
            name: r.regatta,
            date: r.date,
            url: r.url,
            fleet: r.className,
            entrants: data.entrants,
            raceCount: data.raceCount,
            winner: data.winner,
            me: data.match!,
          });
          if (data.field) fields[id] = data.field;
        } else {
          unscored.push({ id, name: r.regatta, date: r.date, url: r.url, fleet: r.className, club: r.club });
        }
        const final = Date.now() - Date.parse(r.date) > FINAL_AFTER_DAYS * 86400e3;
        store = { ...store, results, unscored, checked: final ? { ...store.checked, [id]: true } : store.checked };
      } catch (e) {
        if (e instanceof StaleAppError) throw e;
        progress.failed += 1;
      }
      progress.done += 1;
      if (progress.done % 5 === 0) saveCached(name, store, fields);
      opts.onUpdate?.(store, fields, { ...progress });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  store = { ...store, scannedAt: new Date().toISOString() };
  saveCached(name, store, fields);
  return { store, fields, failed: progress.failed };
}
