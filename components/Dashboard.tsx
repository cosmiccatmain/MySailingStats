"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DistributionChart,
  RaceChart,
  RaceNumberChart,
  RatingChart,
  RegattaChart,
  SeasonChart,
  TierChart,
} from "./Charts";
import { Clubs } from "./Clubs";
import { Compare } from "./Compare";
import { RaceTable, RegattaList } from "./Regattas";
import { clubKey } from "@/lib/analysis";
import { fleetTier, isGreenFleet, isOptiFleet, TIER_LABEL } from "@/lib/fleets";
import { fmtDate, ordinal } from "@/lib/format";
import { insights, tierSummaries } from "@/lib/insights";
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
import { percentile } from "@/lib/standings";
import { summary, toLoaded, type RegattaResult } from "@/lib/stats";

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

  if (!ready) return null;

  const setFilter = (f: Filters) => {
    setFilters(f);
    writeJson(FILTER_KEY, f);
  };

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>⛵ My Sailing Stats</h1>
          <p className="muted">Optimist results · USODA championships and local club regattas on Clubspot</p>
        </div>
        {profile && (
          <div className="profile">
            <div>
              <b>{profile.name}</b>
              <div className="muted small">{store.scannedAt ? `Updated ${fmtDate(store.scannedAt)}` : "Not scanned yet"}</div>
            </div>
            <div className="btns">
              {progress ? (
                <button onClick={() => (cancel.current = true)}>Stop</button>
              ) : (
                <>
                  <button className="primary" onClick={() => scan(profile, false)}>
                    Check for new results
                  </button>
                  <button onClick={() => scan(profile, true)}>Rescan all</button>
                  <button onClick={() => setProfile(null)}>Change sailor</button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {!profile ? (
        <Setup initial={readJson<Profile>(PROFILE_KEY, { name: "" }).name ?? ""} onSave={onSaveProfile} />
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
                Searched Clubspot for <b>{profile.name}</b>. Use your name exactly as it appears on regatta registrations
                (&ldquo;First Last&rdquo;).
              </p>
            </div>
          ) : (
            <>
              <nav className="tabs" role="tablist">
                {TABS.map(([k, label]) => (
                  <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                    {label}
                  </button>
                ))}
              </nav>

              {tab !== "compare" && tab !== "clubs" && (
                <div className="filters">
                  <div className="chips">
                    <button className={`chip${season === "all" ? " on" : ""}`} onClick={() => setSeason("all")}>
                      All seasons
                    </button>
                    {seasons.map((y) => (
                      <button key={y} className={`chip${season === y ? " on" : ""}`} onClick={() => setSeason(y)}>
                        {y}
                      </button>
                    ))}
                  </div>
                  <div className="toggles">
                    {greenCount > 0 && (
                      <label className="toggle small">
                        <input type="checkbox" checked={filters.green} onChange={(e) => setFilter({ ...filters, green: e.target.checked })} />
                        Green fleet ({greenCount})
                      </label>
                    )}
                    {otherCount > 0 && (
                      <label className="toggle small">
                        <input type="checkbox" checked={filters.other} onChange={(e) => setFilter({ ...filters, other: e.target.checked })} />
                        Other boats, e.g. 420 ({otherCount})
                      </label>
                    )}
                  </div>
                </div>
              )}

              {tab === "overview" && <Overview results={results} history={visibleHistory} perf={perf} />}
              {tab === "regattas" && (
                <>
                  <RegattaList results={results} fields={fields} perf={perf} onNotMe={notMe} />
                  <UnscoredList unscored={unscored} />
                </>
              )}
              {tab === "races" && <RaceTable results={results} sailor={profile.name} />}
              {tab === "compare" && <Compare meName={profile.name} mine={loaded} />}
              {tab === "clubs" && <Clubs regattas={loaded} myClub={myClub} meName={profile.name} />}
            </>
          )}
        </>
      )}
      <footer className="muted small">
        Data: Clubspot, which runs usoda.org and most US yacht-club regatta sites; every regatta registered under your name
        is included. Placings follow Clubspot&rsquo;s scoring (finals fleets, RRS A8 tie-breaks) and were checked boat-for-boat
        against official results. Ratings are this app&rsquo;s own estimate from the fleets you&rsquo;ve raced.
      </footer>
    </main>
  );
}

function Setup({ initial, onSave }: { initial: string; onSave: (p: Profile) => void }) {
  const [name, setName] = useState(initial);
  return (
    <form
      className="card setup"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSave({ name: name.trim() });
      }}
    >
      <h2>Who&rsquo;s sailing?</h2>
      <p className="muted">
        Enter your name as it appears on regatta registrations. We&rsquo;ll find every regatta you&rsquo;ve registered for on
        Clubspot — USODA championships and local club regattas. Everything is stored only in this browser.
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

function Overview({ results, history, perf }: { results: RegattaResult[]; history: RatingPoint[]; perf: Map<string, RatingPoint> }) {
  const s = useMemo(() => summary(results), [results]);
  const tiers = useMemo(() => tierSummaries(results, history), [results, history]);
  const notes = useMemo(() => insights(results, history), [results, history]);
  if (!results.length) return <p className="muted">No regattas with scores for these filters.</p>;
  const current = history.length ? history[history.length - 1] : null;
  const bestPerf = history.length ? history.reduce((a, b) => (b.performance > a.performance ? b : a)) : null;
  const bestPerfReg = bestPerf ? results.find((r) => r.id === bestPerf.regattaId) : null;
  const champ = tiers.find((t) => t.tier === "champ");
  return (
    <>
      <div className="tiles">
        <Tile label="Regattas" value={s.regattas} sub={`at ${s.clubs} club${s.clubs === 1 ? "" : "s"} · ${s.races} races`} />
        <Tile label="Current rating" value={current ? Math.round(current.after) : "–"} sub="fleet-strength adjusted" />
        <Tile
          label="Best performance"
          value={bestPerf ? Math.round(bestPerf.performance) : "–"}
          sub={bestPerfReg ? `${ordinal(bestPerfReg.me.place)}/${bestPerfReg.entrants} · ${bestPerfReg.name}` : undefined}
        />
        <Tile
          label="Championship avg"
          value={champ?.avgPct != null ? `${Math.round(champ.avgPct)}%` : "–"}
          sub={champ ? `of fleet beaten · ${champ.regattas} regattas` : "no Championship regattas"}
        />
        <Tile label="Best race finish" value={s.bestRace != null ? ordinal(s.bestRace) : "–"} sub={`${s.top10Races} top-10 finishes`} />
        <Tile label="Avg fleet beaten" value={s.avgPct != null ? `${Math.round(s.avgPct)}%` : "–"} sub={`${s.letters} letter scores`} />
      </div>

      {notes.length > 0 && (
        <section className="card insights">
          <h3>Insights</h3>
          <ul>
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="chart-grid">
        <RegattaChart results={results} perf={perf} />
        <TierChart tiers={tiers} />
        <RatingChart history={history} />
        <RaceChart results={results} />
        <RaceNumberChart results={results} />
        <DistributionChart results={results} />
        <SeasonChart results={results} perf={perf} />
      </div>

      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fleet level</th>
              <th className="num">Regattas</th>
              <th className="num">Avg fleet beaten</th>
              <th className="num">Avg rating</th>
              <th>Best result</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t) => (
              <tr key={t.tier}>
                <td>
                  <span className={`badge tier-${t.tier}`}>{TIER_LABEL[t.tier]}</span>
                </td>
                <td className="num">{t.regattas}</td>
                <td className="num">{t.avgPct != null ? `${Math.round(t.avgPct)}%` : "–"}</td>
                <td className="num">{t.avgPerformance != null ? Math.round(t.avgPerformance) : "–"}</td>
                <td className="clip">
                  {t.best
                    ? `${ordinal(t.best.me.place)}/${t.best.entrants} · ${t.best.name} (${Math.round(percentile(t.best.me.place, t.best.entrants) ?? 0)}%)`
                    : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
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
