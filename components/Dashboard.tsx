"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DistributionChart, RaceChart, RaceNumberChart } from "./Charts";
import { Overview } from "./Overview";
import { Clubs } from "./Clubs";
import { Compare } from "./Compare";
import { RaceTable, RegattaList } from "./Regattas";
import { clubKey } from "@/lib/analysis";
import { fleetTier, isGreenFleet, isOptiFleet } from "@/lib/fleets";
import { fmtDate } from "@/lib/format";
import {
  EMPTY,
  loadCached,
  readJson,
  saveCached,
  scanSailor,
  StaleAppError,
  writeJson,
  type Fields,
  type Progress,
  type Store,
  type Unscored,
} from "@/lib/loader";
import { computeRatings, sailorKey, type RatingPoint } from "@/lib/rating";
import { toLoaded, type RegattaResult } from "@/lib/stats";

type Profile = { name: string };
type Filters = { green: boolean; other: boolean };
type Tab = "overview" | "regattas" | "races" | "compare" | "clubs";

const PROFILE_KEY = "mss:profile";
const FILTER_KEY = "mss:filters";
const TABS: [Tab, string][] = [
  ["overview", "Overview"],
  ["regattas", "Regattas"],
  ["races", "Races"],
  ["compare", "Compare"],
  ["clubs", "Clubs"],
];

function recentlyReloaded(): boolean {
  try {
    const last = Number(sessionStorage.getItem("mss:reloadedAt") ?? 0);
    if (Date.now() - last < 60_000) return true;
    sessionStorage.setItem("mss:reloadedAt", String(Date.now()));
  } catch {
    /* storage blocked: allow the reload */
  }
  return false;
}

export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [store, setStore] = useState<Store>(EMPTY);
  const [fields, setFields] = useState<Fields>({});
  const [filters, setFilters] = useState<Filters>({ green: false, other: false });
  const [season, setSeason] = useState("all");
  const [tab, setTab] = useState<Tab>("overview");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancel = useRef(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const fromUrl = q.get("name");
    const saved = readJson<Profile | null>(PROFILE_KEY, null);
    const p: Profile | null = fromUrl
      ? { name: fromUrl }
      : saved?.name
        ? { name: saved.name }
        : process.env.NEXT_PUBLIC_DEFAULT_SAILOR
          ? { name: process.env.NEXT_PUBLIC_DEFAULT_SAILOR }
          : null;
    if (p) {
      const c = loadCached(p.name);
      setProfile(p);
      setStore(c.store);
      setFields(c.fields);
    }
    setFilters(readJson(FILTER_KEY, { green: false, other: false }));
    const t = q.get("tab") as Tab | null;
    if (t && TABS.some(([k]) => k === t)) setTab(t);
    setReady(true);
  }, []);

  const scan = useCallback(async (p: Profile, full: boolean) => {
    cancel.current = false;
    setError(null);
    setProgress({ done: 0, total: 0, failed: 0 });
    try {
      const { store: s, fields: f, failed } = await scanSailor(p.name, {
        full,
        isCancelled: () => cancel.current,
        onUpdate: (s, f, pr) => {
          setStore(s);
          setFields({ ...f });
          setProgress(pr);
        },
      });
      setStore(s);
      setFields(f);
      if (failed) setError(`${failed} regatta(s) couldn't be loaded — run "Check for new results" to retry them.`);
    } catch (e) {
      if (e instanceof StaleAppError && !recentlyReloaded()) {
        window.location.reload();
        return;
      }
      setError(`Couldn't load results from Clubspot: ${(e as Error).message}`);
    } finally {
      setProgress(null);
    }
  }, []);

  // First visit for a sailor (or cache from an older app version): scan automatically.
  const autoScanned = useRef(false);
  useEffect(() => {
    if (ready && profile && !store.scannedAt && !autoScanned.current) {
      autoScanned.current = true;
      void scan(profile, true);
    }
  }, [ready, profile, store.scannedAt, scan]);

  const onSaveProfile = (p: Profile) => {
    writeJson(PROFILE_KEY, p);
    const c = loadCached(p.name);
    setProfile(p);
    setStore(c.store);
    setFields(c.fields);
    setSeason("all");
    const url = new URL(window.location.href);
    url.search = "";
    window.history.replaceState(null, "", url);
    if (!c.store.scannedAt) {
      autoScanned.current = true;
      void scan(p, true);
    }
  };

  const notMe = (id: string) => {
    if (!profile) return;
    const next = {
      ...store,
      results: store.results.filter((r) => r.id !== id),
      unscored: store.unscored.filter((r) => r.id !== id),
      excluded: [...store.excluded, id],
    };
    const nextFields = { ...fields };
    delete nextFields[id];
    setStore(next);
    setFields(nextFields);
    saveCached(profile.name, next, nextFields);
  };

  // ---- derived data ----
  const name = profile?.name ?? "";
  const meKey = sailorKey(name);
  // Ratings use every Optimist regatta (including Green) so fleet strength is measured consistently.
  const loaded = useMemo(() => toLoaded(store.results, fields, name), [store.results, fields, name]);
  const ratings = useMemo(
    () => computeRatings(loaded.map((r) => ({ id: r.id, date: r.date, tier: fleetTier(r.fleet), field: r.field })), [meKey]),
    [loaded, meKey],
  );
  const history = useMemo(() => ratings.history.get(meKey) ?? [], [ratings, meKey]);
  const perf = useMemo(() => new Map<string, RatingPoint>(history.map((h) => [h.regattaId, h])), [history]);

  const visibleFleet = useCallback(
    (fleet: string) => (isOptiFleet(fleet) ? filters.green || !isGreenFleet(fleet) : filters.other),
    [filters],
  );
  const seasons = useMemo(
    () => [...new Set(store.results.filter((r) => visibleFleet(r.fleet)).map((r) => r.date.slice(0, 4)))].sort().reverse(),
    [store.results, visibleFleet],
  );
  const results = useMemo(
    () => store.results.filter((r) => visibleFleet(r.fleet) && (season === "all" || r.date.startsWith(season))),
    [store.results, visibleFleet, season],
  );
  const unscored = store.unscored.filter(
    (r) => visibleFleet(r.fleet) && (season === "all" || r.date.startsWith(season)),
  );
  const visibleHistory = useMemo(() => {
    const ids = new Set(results.map((r) => r.id));
    return history.filter((h) => ids.has(h.regattaId));
  }, [history, results]);
  const everything = [...store.results, ...store.unscored];
  const greenCount = everything.filter((r) => isOptiFleet(r.fleet) && isGreenFleet(r.fleet)).length;
  const otherCount = everything.filter((r) => !isOptiFleet(r.fleet)).length;
  const myClub = useMemo(() => {
    const counts = new Map<string, { name: string; n: number }>();
    for (const r of store.results) {
      if (!r.me.club) continue;
      const k = clubKey(r.me.club);
      counts.set(k, { name: r.me.club, n: (counts.get(k)?.n ?? 0) + 1 });
    }
    return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.name ?? "";
  }, [store.results]);

  const [menuOpen, setMenuOpen] = useState(false);
  if (!ready) return null;

  const setFilter = (f: Filters) => {
    setFilters(f);
    writeJson(FILTER_KEY, f);
  };
  const hasData = store.results.length > 0 || store.unscored.length > 0;

  return (
    <main className="wrap">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ⛵
          </span>
          <span>MySailingStats</span>
        </div>
        {profile && hasData && (
          <nav className="nav" role="tablist">
            {TABS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </nav>
        )}
        {profile && (
          <div className="actions">
            <button
              className="icon-btn"
              title={progress ? "Stop" : "Check for new results"}
              aria-label={progress ? "Stop" : "Check for new results"}
              onClick={() => (progress ? (cancel.current = true) : scan(profile, false))}
            >
              {progress ? <span className="spin">↻</span> : "↻"}
            </button>
            <button className="icon-btn" aria-label="More" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
              ⋯
            </button>
            {menuOpen && (
              <div className="menu" onClick={() => setMenuOpen(false)}>
                <div className="menu-note">
                  {profile.name}
                  <br />
                  {store.scannedAt ? `Updated ${fmtDate(store.scannedAt)}` : "Not scanned yet"}
                </div>
                <button onClick={() => scan(profile, false)}>Check for new results</button>
                <button onClick={() => scan(profile, true)}>Rescan everything</button>
                <button onClick={() => setProfile(null)}>Change sailor</button>
              </div>
            )}
          </div>
        )}
      </header>

      {progress && (
        <div className="status" role="status">
          <span>
            {progress.total
              ? `Loading results… ${progress.done}/${progress.total}`
              : "Finding every regatta you've registered for on Clubspot…"}
          </span>
          <div className="loadbar" style={{ flex: 1, maxWidth: 360 }}>
            <span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 8}%` }} />
          </div>
        </div>
      )}
      {error && <div className="card warn">{error}</div>}

      {!profile ? (
        <Setup initial={readJson<Profile>(PROFILE_KEY, { name: "" }).name ?? ""} onSave={onSaveProfile} />
      ) : !hasData && !progress ? (
        <div className="card empty">
          <h2>No regattas found yet</h2>
          <p className="muted">
            Searched Clubspot for <b>{profile.name}</b>. Use your name exactly as it appears on regatta registrations
            (&ldquo;First Last&rdquo;).
          </p>
        </div>
      ) : (
        <>
          {tab !== "compare" && tab !== "clubs" && (
            <div className="filters">
              <select className="compact" value={season} onChange={(e) => setSeason(e.target.value)} aria-label="Season">
                <option value="all">All seasons</option>
                {seasons.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              {greenCount > 0 && (
                <label className="toggle small">
                  <input type="checkbox" checked={filters.green} onChange={(e) => setFilter({ ...filters, green: e.target.checked })} />
                  Green fleet
                </label>
              )}
              {otherCount > 0 && (
                <label className="toggle small">
                  <input type="checkbox" checked={filters.other} onChange={(e) => setFilter({ ...filters, other: e.target.checked })} />
                  Other boats
                </label>
              )}
            </div>
          )}

          {tab === "overview" && (
            <Overview name={profile.name} results={results} history={visibleHistory} allHistory={history} perf={perf} />
          )}
          {tab === "regattas" && (
            <>
              <RegattaList results={results} fields={fields} perf={perf} onNotMe={notMe} />
              <UnscoredList unscored={unscored} />
            </>
          )}
          {tab === "races" && <RacesTab results={results} sailor={profile.name} />}
          {tab === "compare" && <Compare meName={profile.name} mine={loaded} />}
          {tab === "clubs" && <Clubs regattas={loaded} myClub={myClub} meName={profile.name} />}
        </>
      )}
      <footer className="muted small">
        Results from Clubspot (usoda.org and club regatta sites), checked against official results. Ratings are this app&rsquo;s
        own estimate.
      </footer>
    </main>
  );
}

function Setup({ initial, onSave }: { initial: string; onSave: (p: Profile) => void }) {
  const [name, setName] = useState(initial);
  return (
    <section className="hero setup-hero">
      <h1>Every race you&rsquo;ve sailed.</h1>
      <p>
        USODA championships and local club regattas from Clubspot — ratings, rivals, and club results. Enter your name as it
        appears on registrations.
      </p>
      <form
        className="setup-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave({ name: name.trim() });
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First Last" autoFocus aria-label="Sailor name" />
        <button type="submit" disabled={name.trim().split(/\s+/).length < 2}>
          Let&rsquo;s go
        </button>
      </form>
    </section>
  );
}

function RacesTab({ results, sailor }: { results: RegattaResult[]; sailor: string }) {
  return (
    <>
      <div className="chart-grid">
        <RaceChart results={results} />
        <RaceNumberChart results={results} />
        <DistributionChart results={results} />
      </div>
      <RaceTable results={results} sailor={sailor} />
    </>
  );
}

function UnscoredList({ unscored }: { unscored: Unscored[] }) {
  if (!unscored.length) return null;
  return (
    <details className="card unscored">
      <summary>
        {unscored.length} more regatta{unscored.length === 1 ? "" : "s"} registered without online scores
      </summary>
      <p className="muted small">Results for these were posted outside Clubspot (PDF or another site), or you didn&rsquo;t race.</p>
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
  );
}
