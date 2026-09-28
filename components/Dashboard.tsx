"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Charts, ordinal } from "./Charts";
import { percentile, type Standing } from "@/lib/standings";
import { allRaces, summary, type RegattaResult } from "@/lib/stats";

type Profile = { name: string; sail: string };
type RegattaSummary = { id: string; name: string; date: string; url: string; external: string | null };
type RegattaResponse = {
  id: string;
  fleet: string | null;
  entrants: number;
  raceCount: number;
  winner: { name: string; net: number | null } | null;
  match: Standing | null;
  error?: string;
};
type Store = {
  results: RegattaResult[];
  checked: Record<string, true>; // regattas already scanned whose results are final
  excluded: string[]; // regatta ids the user marked "not me"
  scannedAt: string | null;
};

const PROFILE_KEY = "mss:profile";
const storeKey = (p: Profile) => `mss:v1:${p.name.trim().toLowerCase()}|${p.sail.trim()}`;
const EMPTY: Store = { results: [], checked: {}, excluded: [], scannedAt: null };
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
  const cancel = useRef(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const fromUrl = q.get("name") || q.get("sail");
    const p: Profile | null = fromUrl
      ? { name: q.get("name") ?? "", sail: q.get("sail") ?? "" }
      : load<Profile | null>(PROFILE_KEY, null) ??
        (process.env.NEXT_PUBLIC_DEFAULT_SAILOR ? { name: process.env.NEXT_PUBLIC_DEFAULT_SAILOR, sail: "" } : null);
    if (p) {
      setProfile(p);
      setStore(load(storeKey(p), EMPTY));
    }
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
      const prev = load(storeKey(p), EMPTY);
      const base = full ? { ...EMPTY, excluded: prev.excluded } : prev;
      let current: Store = { ...base, results: [...base.results], checked: { ...base.checked } };
      try {
        const res = await fetch("/api/regattas");
        const body = (await res.json()) as { regattas?: RegattaSummary[]; error?: string };
        if (!res.ok || !body.regattas) throw new Error(body.error ?? `HTTP ${res.status}`);
        const todo = body.regattas.filter((r) => !r.external && !current.checked[r.id]);
        setProgress({ done: 0, total: todo.length, failed: 0 });
        let done = 0;
        let failed = 0;
        const queue = [...todo];
        const worker = async () => {
          while (queue.length && !cancel.current) {
            const r = queue.shift()!;
            try {
              const qs = new URLSearchParams({ date: r.date, name: p.name, sail: p.sail });
              const rr = await fetch(`/api/regatta/${r.id}?${qs}`);
              const data = (await rr.json()) as RegattaResponse;
              if (!rr.ok) throw new Error(data.error);
              const results = current.results.filter((x) => x.id !== r.id);
              if (data.match && data.fleet && !current.excluded.includes(r.id)) {
                results.push({
                  id: r.id,
                  name: r.name,
                  date: r.date,
                  url: r.url,
                  fleet: data.fleet,
                  entrants: data.entrants,
                  raceCount: data.raceCount,
                  winner: data.winner,
                  me: data.match,
                });
              }
              const final = Date.now() - Date.parse(r.date) > FINAL_AFTER_DAYS * 86400e3;
              current = {
                ...current,
                results,
                checked: final ? { ...current.checked, [r.id]: true } : current.checked,
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
        setError(`Couldn't reach USODA results: ${(e as Error).message}`);
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
      excluded: [...store.excluded, id],
    });
  };

  if (!ready) return null;

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>⛵ My Sailing Stats</h1>
          <p className="muted">USODA Optimist · Championship fleet · every regatta in the usoda.org results archive</p>
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
                Scanning the USODA archive… {progress.done}/{progress.total} regattas ·{" "}
                {store.results.length} found
              </div>
              <div className="bar">
                <span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
              </div>
            </div>
          )}
          {error && <div className="card warn">{error}</div>}
          {store.results.length === 0 && !progress ? (
            <div className="card empty">
              <h2>No Champ fleet results found yet</h2>
              <p className="muted">
                Searched for <b>{profile.name || `sail #${profile.sail}`}</b>. Check the spelling matches your
                USODA registration (e.g. &ldquo;First Last&rdquo;), or search by sail number instead.
              </p>
            </div>
          ) : (
            store.results.length > 0 && <Results results={store.results} onNotMe={notMe} />
          )}
        </>
      )}
      <footer className="muted small">
        Data: USODA results archive (usoda.org, hosted on Clubspot). Placings are computed from published
        scores; events with Gold/Silver finals rank every Gold boat ahead of every Silver boat.
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
        {profile.sail && <span className="muted"> · #{profile.sail}</span>}
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
  const [sail, setSail] = useState(initial.sail);
  return (
    <form
      className="card setup"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() || sail.trim()) onSave({ name: name.trim(), sail: sail.trim() });
      }}
    >
      <h2>Who&rsquo;s sailing?</h2>
      <p className="muted">
        Enter your name as it appears on USODA registrations. Sail number is optional — it helps tell apart
        sailors with the same name. Everything is stored only in this browser.
      </p>
      <label>
        Sailor name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First Last" autoFocus />
      </label>
      <label>
        Sail number (optional)
        <input value={sail} onChange={(e) => setSail(e.target.value)} placeholder="e.g. 23456" inputMode="numeric" />
      </label>
      <button className="primary" type="submit" disabled={!name.trim() && !sail.trim()}>
        Scan USODA archive
      </button>
    </form>
  );
}

function Results({ results, onNotMe }: { results: RegattaResult[]; onNotMe: (id: string) => void }) {
  const s = useMemo(() => summary(results), [results]);
  const sorted = useMemo(() => [...results].sort((a, b) => b.date.localeCompare(a.date)), [results]);
  const [tab, setTab] = useState<"regattas" | "races">("regattas");

  return (
    <>
      <div className="tiles">
        <Tile label="Regattas" value={s.regattas} />
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

      <Charts results={results} />

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "regattas"} onClick={() => setTab("regattas")}>
          Regattas ({results.length})
        </button>
        <button role="tab" aria-selected={tab === "races"} onClick={() => setTab("races")}>
          All races ({s.races})
        </button>
      </div>
      {tab === "regattas" ? <RegattaList results={sorted} onNotMe={onNotMe} /> : <RaceTable results={results} />}
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
                  {fmtDate(r.date)} · {r.fleet}
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
