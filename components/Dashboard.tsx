"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Charts, ordinal } from "./Charts";
import { percentile, type Standing } from "@/lib/standings";
import { isGreenFleet, isOptiFleet } from "@/lib/fleets";
import { allRaces, summary, type RegattaResult } from "@/lib/stats";

type Profile = { name: string; sail: string };
type Registration = {
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
  error?: string;
};
type Unscored = { id: string; name: string; date: string; url: string; fleet: string; club: string };
type Store = {
  results: RegattaResult[];
  unscored: Unscored[]; // registered, but no online scores (PDF results, didn't sail, …)
  checked: Record<string, true>; // regatta:class keys already scanned whose results are final
  excluded: string[]; // keys the user marked "not me"
  scannedAt: string | null;
};

const PROFILE_KEY = "mss:profile";
const FILTER_KEY = "mss:filters";
type Filters = { green: boolean; other: boolean };
const storeKey = (p: Profile) => `mss:v2:${p.name.trim().toLowerCase()}`;
const EMPTY: Store = { results: [], unscored: [], checked: {}, excluded: [], scannedAt: null };
const FINAL_AFTER_DAYS = 14;
const CONCURRENCY = 6;

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage full or blocked: data just won't persist */
  }
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [store, setStore] = useState<Store>(EMPTY);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ green: false, other: false });
  const cancel = useRef(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const fromUrl = q.get("name");
    const p: Profile | null = fromUrl
      ? { name: fromUrl, sail: "" }
      : load<Profile | null>(PROFILE_KEY, null) ??
        (process.env.NEXT_PUBLIC_DEFAULT_SAILOR ? { name: process.env.NEXT_PUBLIC_DEFAULT_SAILOR, sail: "" } : null);
    if (p) {
      setProfile(p);
      setStore({ ...EMPTY, ...load(storeKey(p), EMPTY) });
    }
    setFilters(load(FILTER_KEY, { green: false, other: false }));
    setReady(true);
  }, []);

  const persist = useCallback((p: Profile, s: Store) => {
    setStore(s);
    save(storeKey(p), s);
  }, []);

  const scan = useCallback(
    async (p: Profile, full: boolean) => {
      cancel.current = false;
      setError(null);
      setProgress({ done: 0, total: 0, failed: 0 });
      const prev = { ...EMPTY, ...load(storeKey(p), EMPTY) };
      const base = full ? { ...EMPTY, excluded: prev.excluded } : prev;
      let current: Store = { ...base };
      try {
        const res = await fetch(`/api/sailor?${new URLSearchParams({ name: p.name })}`);
        const body = (await res.json()) as { registrations?: Registration[]; error?: string };
        if (!res.ok || !body.registrations) throw new Error(body.error ?? `HTTP ${res.status}`);
        const key = (r: Registration) => `${r.regattaId}:${r.classId}`;
        const todo = body.registrations.filter((r) => !current.checked[key(r)] && !current.excluded.includes(key(r)));
        setProgress({ done: 0, total: todo.length, failed: 0 });
        let done = 0;
        let failed = 0;
        const queue = [...todo];
        const worker = async () => {
          while (queue.length && !cancel.current) {
            const r = queue.shift()!;
            const id = key(r);
            try {
              let data: RegattaResponse | null = null;
              // "pdf" / "external_link" classes publish results outside Clubspot.
              if (r.method !== "pdf" && r.method !== "external_link") {
                const qs = new URLSearchParams({ class: r.classId, reg: r.registrationId, date: r.date, method: r.method ?? "" });
                const rr = await fetch(`/api/regatta/${r.regattaId}?${qs}`);
                data = (await rr.json()) as RegattaResponse;
                if (!rr.ok) throw new Error(data.error);
              }
              const results = current.results.filter((x) => x.id !== id);
              const unscored = current.unscored.filter((x) => x.id !== id);
              const hasScores = data?.match && data.match.races.some((x) => x.points != null);
              if (data && hasScores) {
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
              } else {
                unscored.push({ id, name: r.regatta, date: r.date, url: r.url, fleet: r.className, club: r.club });
              }
              const final = Date.now() - Date.parse(r.date) > FINAL_AFTER_DAYS * 86400e3;
              current = {
                ...current,
                results,
                unscored,
                checked: final ? { ...current.checked, [id]: true } : current.checked,
              };
            } catch {
              failed += 1;
            }
            done += 1;
            setProgress({ done, total: todo.length, failed });
            persist(p, current);
          }
        };
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
        current = { ...current, scannedAt: new Date().toISOString() };
        persist(p, current);
        if (failed) setError(`${failed} regatta(s) couldn't be loaded — run "Check for new results" to retry them.`);
      } catch (e) {
        setError(`Couldn't reach Clubspot results: ${(e as Error).message}`);
      } finally {
        setProgress(null);
      }
    },
    [persist],
  );

  // First visit for a sailor (e.g. from a shared ?name= link): scan automatically.
  const autoScanned = useRef(false);
  useEffect(() => {
    if (ready && profile && !store.scannedAt && !autoScanned.current) {
      autoScanned.current = true;
      void scan(profile, true);
    }
  }, [ready, profile, store.scannedAt, scan]);

  const onSaveProfile = (p: Profile) => {
    save(PROFILE_KEY, p);
    const s = load(storeKey(p), EMPTY);
    setProfile(p);
    setStore(s);
    const url = new URL(window.location.href);
    url.search = "";
    window.history.replaceState(null, "", url);
    if (!s.scannedAt) {
      autoScanned.current = true;
      void scan(p, true);
    }
  };

  const notMe = (id: string) => {
    if (!profile) return;
    persist(profile, {
      ...store,
      results: store.results.filter((r) => r.id !== id),
      unscored: store.unscored.filter((r) => r.id !== id),
      excluded: [...store.excluded, id],
    });
  };

  if (!ready) return null;

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>⛵ My Sailing Stats</h1>
          <p className="muted">Optimist results · USODA championships and local club regattas on Clubspot</p>
        </div>
        {profile && (
          <ProfileBar
            profile={profile}
            busy={!!progress}
            scannedAt={store.scannedAt}
            onEdit={() => setProfile(null)}
            onUpdate={() => scan(profile, false)}
            onRescan={() => scan(profile, true)}
            onCancel={() => (cancel.current = true)}
          />
        )}
      </header>

      {!profile ? (
        <Setup initial={load<Profile>(PROFILE_KEY, { name: "", sail: "" })} onSave={onSaveProfile} />
      ) : (
        <>
          {progress && (
            <div className="card progress" role="status">
              <div>
                {progress.total
                  ? `Loading results… ${progress.done}/${progress.total} regattas · ${store.results.length} with scores`
                  : "Finding every regatta you've registered for on Clubspot…"}
              </div>
              <div className="bar">
                <span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
              </div>
            </div>
          )}
          {error && <div className="card warn">{error}</div>}
          {store.results.length === 0 && store.unscored.length === 0 && !progress ? (
            <div className="card empty">
              <h2>No regattas found yet</h2>
              <p className="muted">
                Searched Clubspot for <b>{profile.name}</b>. Use your name exactly as it appears on regatta
                registrations (&ldquo;First Last&rdquo;).
              </p>
            </div>
          ) : (
            <Results
              results={store.results}
              unscored={store.unscored}
              filters={filters}
              onFilters={(f) => {
                setFilters(f);
                save(FILTER_KEY, f);
              }}
              onNotMe={notMe}
            />
          )}
        </>
      )}
      <footer className="muted small">
        Data: Clubspot, which runs usoda.org and most US yacht-club regatta sites. Every regatta registered
        under your name is included. Placings are computed from published scores; events with Gold/Silver
        finals rank every Gold boat ahead of every Silver boat. Regattas scored on other systems (Regatta
        Network, Sailwave PDFs, …) aren&rsquo;t included.
      </footer>
    </main>
  );
}

function ProfileBar(props: {
  profile: Profile;
  busy: boolean;
  scannedAt: string | null;
  onEdit: () => void;
  onUpdate: () => void;
  onRescan: () => void;
  onCancel: () => void;
}) {
  const { profile, busy } = props;
  return (
    <div className="profile">
      <div>
        <b>{profile.name || "—"}</b>
        <div className="muted small">
          {props.scannedAt ? `Updated ${fmtDate(props.scannedAt)}` : "Not scanned yet"}
        </div>
      </div>
      <div className="btns">
        {busy ? (
          <button onClick={props.onCancel}>Stop</button>
        ) : (
          <>
            <button className="primary" onClick={props.onUpdate}>
              Check for new results
            </button>
            <button onClick={props.onRescan}>Rescan all</button>
            <button onClick={props.onEdit}>Change sailor</button>
          </>
        )}
      </div>
    </div>
  );
}

function Setup({ initial, onSave }: { initial: Profile; onSave: (p: Profile) => void }) {
  const [name, setName] = useState(initial.name);
  return (
    <form
      className="card setup"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSave({ name: name.trim(), sail: "" });
      }}
    >
      <h2>Who&rsquo;s sailing?</h2>
      <p className="muted">
        Enter your name as it appears on regatta registrations. We&rsquo;ll find every regatta you&rsquo;ve
        registered for on Clubspot — USODA championships and local club regattas. Everything is stored only in
        this browser.
      </p>
      <label>
        Sailor name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First Last" autoFocus />
      </label>
      <button className="primary" type="submit" disabled={name.trim().split(/\s+/).length < 2}>
        Find my regattas
      </button>
    </form>
  );
}

function Results(props: {
  results: RegattaResult[];
  unscored: Unscored[];
  filters: Filters;
  onFilters: (f: Filters) => void;
  onNotMe: (id: string) => void;
}) {
  const { filters, onNotMe } = props;
  // Default view: Optimist racing fleets only (no Green fleet, no other boats like 420s).
  const visible = (fleet: string) =>
    isOptiFleet(fleet) ? filters.green || !isGreenFleet(fleet) : filters.other;
  const all = [...props.results, ...props.unscored];
  const greenCount = all.filter((r) => isOptiFleet(r.fleet) && isGreenFleet(r.fleet)).length;
  const otherCount = all.filter((r) => !isOptiFleet(r.fleet)).length;
  const results = useMemo(
    () => props.results.filter((r) => visible(r.fleet)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.results, filters],
  );
  const unscored = props.unscored.filter((r) => visible(r.fleet));
  const s = useMemo(() => summary(results), [results]);
  const sorted = useMemo(() => [...results].sort((a, b) => b.date.localeCompare(a.date)), [results]);
  const [tab, setTab] = useState<"regattas" | "races">("regattas");

  return (
    <>
      <div className="tiles">
        <Tile label="Regattas" value={s.regattas} sub={`at ${s.clubs} club${s.clubs === 1 ? "" : "s"}`} />
        <Tile label="Races sailed" value={s.races} />
        <Tile
          label="Best regatta"
          value={s.bestRegatta ? `${ordinal(s.bestRegatta.me.place)}/${s.bestRegatta.entrants}` : "—"}
          sub={s.bestRegatta?.name}
        />
        <Tile label="Avg. fleet beaten" value={s.avgPct != null ? `${Math.round(s.avgPct)}%` : "—"} />
        <Tile label="Best race finish" value={s.bestRace != null ? ordinal(s.bestRace) : "—"} />
        <Tile label="Top-10 race finishes" value={s.top10Races} sub={`${s.letters} letter scores`} />
      </div>

      {(greenCount > 0 || otherCount > 0) && (
        <div className="toggles">
          {greenCount > 0 && (
            <label className="toggle small">
              <input
                type="checkbox"
                checked={filters.green}
                onChange={(e) => props.onFilters({ ...filters, green: e.target.checked })}
              />
              Include Green fleet ({greenCount})
            </label>
          )}
          {otherCount > 0 && (
            <label className="toggle small">
              <input
                type="checkbox"
                checked={filters.other}
                onChange={(e) => props.onFilters({ ...filters, other: e.target.checked })}
              />
              Include other boats, e.g. 420 ({otherCount})
            </label>
          )}
        </div>
      )}

      {results.length > 0 && <Charts results={results} />}

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "regattas"} onClick={() => setTab("regattas")}>
          Regattas ({results.length})
        </button>
        <button role="tab" aria-selected={tab === "races"} onClick={() => setTab("races")}>
          All races ({s.races})
        </button>
      </div>
      {tab === "regattas" ? <RegattaList results={sorted} onNotMe={onNotMe} /> : <RaceTable results={results} />}

      {unscored.length > 0 && (
        <details className="card unscored">
          <summary>
            {unscored.length} more regatta{unscored.length === 1 ? "" : "s"} registered without online scores
          </summary>
          <p className="muted small">
            Results for these were posted outside Clubspot (PDF or another site), or you didn&rsquo;t race.
          </p>
          <ul>
            {[...unscored]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((u) => (
                <li key={u.id}>
                  <a href={u.url} target="_blank" rel="noreferrer">
                    {u.name}
                  </a>{" "}
                  <span className="muted small">
                    · {fmtDate(u.date)} · {u.fleet}
                    {u.club ? ` · ${u.club}` : ""}
                  </span>
                </li>
              ))}
          </ul>
        </details>
      )}
    </>
  );
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="card tile">
      <div className="muted small">{label}</div>
      <div className="big">{value}</div>
      {sub && <div className="muted small ellipsis">{sub}</div>}
    </div>
  );
}

function RegattaList({ results, onNotMe }: { results: RegattaResult[]; onNotMe: (id: string) => void }) {
  return (
    <div className="list">
      {results.map((r) => {
        const pct = percentile(r.me.place, r.entrants);
        return (
          <details key={r.id} className="card regatta">
            <summary>
              <div className="rg-main">
                <div className="rg-name">{r.name}</div>
                <div className="muted small">
                  {fmtDate(r.date)}
                  {r.club ? ` · ${r.club}` : ""} · {r.fleet}
                  {r.me.fleet ? ` · ${r.me.fleet} fleet` : ""} · sail #{r.me.sail}
                </div>
              </div>
              <div className="rg-place">
                <div className="big">
                  {ordinal(r.me.place)}
                  <span className="muted small"> / {r.entrants}</span>
                </div>
                <div className="muted small">
                  {r.me.net != null ? `${r.me.net} pts net` : ""}
                  {pct != null ? ` · beat ${Math.round(pct)}%` : ""}
                </div>
              </div>
            </summary>
            <div className="races">
              {r.me.races.map((race) => (
                <div key={race.race} className={`race${race.drop ? " drop" : ""}${race.letter ? " letter" : ""}`}>
                  <div className="muted small">R{race.race}</div>
                  <div className="race-pts">
                    {race.drop ? "(" : ""}
                    {race.letter ?? race.points ?? "–"}
                    {race.drop ? ")" : ""}
                  </div>
                  {race.starters ? <div className="muted tiny">of {race.starters}</div> : null}
                </div>
              ))}
            </div>
            <div className="rg-foot small">
              <span className="muted">
                {r.winner ? `Winner: ${r.winner.name}${r.winner.net != null ? ` (${r.winner.net})` : ""} · ` : ""}
                {r.me.club}
              </span>
              <span className="btns">
                <a href={r.url} target="_blank" rel="noreferrer">
                  Full results ↗
                </a>
                <button className="link" onClick={() => onNotMe(r.id)} title="Remove a wrong name match">
                  Not me
                </button>
              </span>
            </div>
          </details>
        );
      })}
    </div>
  );
}

function RaceTable({ results }: { results: RegattaResult[] }) {
  const races = useMemo(() => allRaces(results).reverse(), [results]);
  return (
    <div className="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Regatta</th>
            <th className="num">Race</th>
            <th className="num">Finish</th>
            <th className="num">Starters</th>
            <th className="num">Beat</th>
          </tr>
        </thead>
        <tbody>
          {races.map((r) => (
            <tr key={`${r.regattaId}-${r.race}`} className={r.drop ? "drop" : ""}>
              <td className="nowrap">{fmtDate(r.date)}</td>
              <td>{r.regatta}</td>
              <td className="num">{r.race}</td>
              <td className="num">
                {r.letter ? `${r.letter} (${r.points ?? "–"})` : r.points ?? "–"}
                {r.drop ? " ✕" : ""}
              </td>
              <td className="num">{r.starters ?? "–"}</td>
              <td className="num">{r.pct != null ? `${Math.round(r.pct)}%` : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">✕ = discarded (throwout). Letter scores show penalty points in brackets.</p>
    </div>
  );
}
