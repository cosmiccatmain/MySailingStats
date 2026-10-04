"use client";

import {
  BarChart3,
  CalendarDays,
  Check,
  Download,
  Flag,
  Hash,
  LayoutDashboard,
  Link2,
  ListOrdered,
  Lock,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  School,
  Sparkles,
  UserRound,
  Users,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DistributionChart, FleetSizeChart, RaceChart, RaceNumberChart } from "./Charts";
import { Overview, type Upcoming } from "./Overview";
import { Clubs } from "./Clubs";
import { Compare } from "./Compare";
import { RaceTable, RegattaList } from "./Regattas";
import { Locked, OutOfCredits } from "./site/Gate";
import { SiteFooter, SiteHeader } from "./site/SiteHeader";
import { resolverFor } from "@/lib/analysis";
import { fleetTier, isGreenFleet, isOptiFleet } from "@/lib/fleets";
import { downloadCsv, fmtDate } from "@/lib/format";
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
import { DASHBOARDS, hasFeature, type Feature } from "@/lib/plans";
import { computeRatings, sailorKey, type RatingPoint } from "@/lib/rating";
import { percentile } from "@/lib/standings";
import { toLoaded, type RegattaResult } from "@/lib/stats";
import { markPaid, paidFor, spend, useWallet } from "@/lib/wallet";

type Profile = { name: string };
type Filters = { green: boolean; other: boolean };
type Tab = "overview" | "regattas" | "races" | "compare" | "clubs";

const PROFILE_KEY = "mss:profile";
const FILTER_KEY = "mss:filters";
const TABS: [Tab, string, typeof Flag, Feature | null][] = [
  ["overview", "Overview", LayoutDashboard, null],
  ["regattas", "Regattas", Flag, null],
  ["races", "Races", ListOrdered, null],
  ["compare", "Compare", UsersRound, "multiCompare"],
  ["clubs", "Clubs", School, "clubSearch"],
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

const initialsOf = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

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
  const [broke, setBroke] = useState(false);
  const [upcoming, setUpcoming] = useState<Upcoming[] | null>(null);
  const cancel = useRef(false);
  const wallet = useWallet();
  const plus = hasFeature(wallet.plan, "dashboardPlus");

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

  // Upcoming registrations (not part of the cached store; cheap and cached server-side).
  useEffect(() => {
    if (!profile) return;
    let live = true;
    setUpcoming(null);
    fetch(`/api/upcoming?${new URLSearchParams({ name: profile.name })}`)
      .then((r) => (r.ok ? r.json() : { upcoming: [] }))
      .then((b: { upcoming?: Upcoming[] }) => live && setUpcoming(b.upcoming ?? []))
      .catch(() => live && setUpcoming([]));
    return () => {
      live = false;
    };
  }, [profile]);

  const scan = useCallback(async (p: Profile, full: boolean) => {
    cancel.current = false;
    setError(null);
    // Loading a sailor's history costs one search, once per billing period.
    const key = `sailor:${sailorKey(p.name)}`;
    if (!paidFor(key)) {
      if (!spend()) {
        setBroke(true);
        return;
      }
      markPaid(key);
    }
    setBroke(false);
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
      if (failed) setError(`${failed} regatta(s) couldn't be loaded. Use "Check for new results" to retry them.`);
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
    window.dispatchEvent(new Event("mss:profile"));
    const c = loadCached(p.name);
    setProfile(p);
    setStore(c.store);
    setFields(c.fields);
    setSeason("all");
    setTab("overview");
    const url = new URL(window.location.href);
    url.search = "";
    window.history.replaceState(null, "", url);
    if (!c.store.scannedAt) {
      autoScanned.current = true;
      void scan(p, true);
    }
  };

  // A sailor opened from search becomes "my sailor" once their results load, if none is saved yet.
  useEffect(() => {
    if (profile && store.results.length && !readJson<Profile | null>(PROFILE_KEY, null)) {
      writeJson(PROFILE_KEY, profile);
      window.dispatchEvent(new Event("mss:profile"));
    }
  }, [profile, store.results.length]);

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
  const unscored = store.unscored.filter((r) => visibleFleet(r.fleet) && (season === "all" || r.date.startsWith(season)));
  const visibleHistory = useMemo(() => {
    const ids = new Set(results.map((r) => r.id));
    return history.filter((h) => ids.has(h.regattaId));
  }, [history, results]);
  const everything = [...store.results, ...store.unscored];
  const greenCount = everything.filter((r) => isOptiFleet(r.fleet) && isGreenFleet(r.fleet)).length;
  const otherCount = everything.filter((r) => !isOptiFleet(r.fleet)).length;
  const myClub = useMemo(() => {
    const resolve = resolverFor(loaded);
    const counts = new Map<string, { name: string; n: number }>();
    for (const r of [...store.results].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12)) {
      if (!r.me.club) continue;
      const k = resolve(r.me.club);
      counts.set(k, { name: counts.get(k)?.name ?? r.me.club, n: (counts.get(k)?.n ?? 0) + 1 });
    }
    return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.name ?? "";
  }, [store.results, loaded]);
  const sail = useMemo(() => [...store.results].sort((a, b) => b.date.localeCompare(a.date)).find((r) => r.me.sail && r.me.sail !== "TBD")?.me.sail ?? "", [store.results]);
  const since = useMemo(() => (store.results.length ? Math.min(...store.results.map((r) => new Date(r.date).getFullYear())) : null), [store.results]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen && !planOpen) return;
    const close = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setPlanOpen(false);
      }
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (setMenuOpen(false), setPlanOpen(false));
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menuOpen, planOpen]);

  if (!ready) return null;

  const setFilter = (f: Filters) => {
    setFilters(f);
    writeJson(FILTER_KEY, f);
  };
  const hasData = store.results.length > 0 || store.unscored.length > 0;
  const changeTab = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);
  };
  const copyLink = () => {
    const url = `${window.location.origin}/dashboard?${new URLSearchParams({ name })}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  const exportAll = () =>
    downloadCsv(`${name.replace(/\W+/g, "-")}-regattas.csv`, [
      ["Date", "Regatta", "Fleet", "Club", "Place", "Boats", "Beat %", "Net"],
      ...[...store.results]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((r) => [r.date.slice(0, 10), r.name, r.fleet, r.club, r.me.place, r.entrants, Math.round(percentile(r.me.place, r.entrants) ?? 0), r.me.net]),
    ]);
  const dash = plus ? DASHBOARDS.plus : DASHBOARDS.go;

  return (
    <div className="page app">
      <SiteHeader />
      <main className="wrap">
        {!profile ? (
          <Setup initial={readJson<Profile>(PROFILE_KEY, { name: "" }).name ?? ""} onSave={onSaveProfile} />
        ) : (
          <>
            <header className="dash-head fx">
              <div className="dash-id">
                <span className="avatar" aria-hidden>
                  {initialsOf(profile.name)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <h1>{profile.name}</h1>
                  <div className="sub">
                    {myClub && (
                      <span>
                        <School aria-hidden />
                        {myClub}
                      </span>
                    )}
                    {sail && (
                      <span>
                        <Hash aria-hidden />
                        {sail}
                      </span>
                    )}
                    {since && (
                      <span>
                        <CalendarDays aria-hidden />
                        Racing since {since}
                      </span>
                    )}
                    <span>
                      <RefreshCw aria-hidden />
                      {progress ? "Updating…" : store.scannedAt ? `Updated ${fmtDate(store.scannedAt)}` : "Not loaded yet"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="dash-actions" ref={actionsRef}>
                <button className={`plan-chip${plus ? " plus" : ""}`} onClick={() => (setPlanOpen(!planOpen), setMenuOpen(false))} aria-expanded={planOpen}>
                  {plus ? <Sparkles aria-hidden /> : <BarChart3 aria-hidden />}
                  {dash.name}
                </button>
                <button
                  className="icon-btn"
                  title={progress ? "Stop" : "Check for new results"}
                  aria-label={progress ? "Stop" : "Check for new results"}
                  onClick={() => (progress ? (cancel.current = true) : scan(profile, false))}
                >
                  <RefreshCw className={progress ? "spin" : undefined} aria-hidden />
                </button>
                <button className="icon-btn" aria-label="More actions" aria-expanded={menuOpen} onClick={() => (setMenuOpen(!menuOpen), setPlanOpen(false))}>
                  <MoreHorizontal aria-hidden />
                </button>
                {planOpen && (
                  <div className="dropdown" style={{ width: 320, padding: 14, gap: 10 }}>
                    <div className="pill-label">Your dashboard</div>
                    <div>
                      <b style={{ fontSize: 16 }}>{dash.name}</b>
                      <p className="small muted" style={{ marginTop: 2 }}>{dash.summary}</p>
                    </div>
                    <div className="stack" style={{ gap: 6 }}>
                      {dash.items.map(([t]) => (
                        <div key={t} className="row small">
                          <Check aria-hidden style={{ color: "var(--good)" }} />
                          {t}
                        </div>
                      ))}
                    </div>
                    {!plus && (
                      <div className="small muted" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                        <b style={{ color: "var(--text-primary)" }}>DashboardPlus</b> adds {DASHBOARDS.plus.items.map(([t]) => t.toLowerCase()).join(", ")}.
                      </div>
                    )}
                    <Link className="btn btn-primary btn-sm" href="/pricing" style={{ alignSelf: "flex-start" }}>
                      {plus ? "Manage plan" : "Upgrade to DashboardPlus"}
                    </Link>
                  </div>
                )}
                {menuOpen && (
                  <div className="dropdown" onClick={() => setMenuOpen(false)}>
                    <button onClick={() => scan(profile, false)}>
                      <RefreshCw aria-hidden /> Check for new results
                    </button>
                    <button onClick={() => scan(profile, true)}>
                      <RotateCcw aria-hidden /> Reload everything
                    </button>
                    <button onClick={copyLink}>
                      <Link2 aria-hidden /> {copied ? "Link copied" : "Copy link to this dashboard"}
                    </button>
                    {hasFeature(wallet.plan, "csvExport") && (
                      <button onClick={exportAll}>
                        <Download aria-hidden /> Download regattas (CSV)
                      </button>
                    )}
                    <hr />
                    <button onClick={() => setProfile(null)}>
                      <UserRound aria-hidden /> Change sailor
                    </button>
                  </div>
                )}
              </div>
            </header>

            {hasData && (
              <nav className="tabs" role="tablist" aria-label="Dashboard sections">
                {TABS.map(([k, label, Icon, feature]) => (
                  <button key={k} role="tab" aria-selected={tab === k} onClick={() => changeTab(k)}>
                    <Icon aria-hidden />
                    {label}
                    {feature && !hasFeature(wallet.plan, feature) && <Lock className="lock" aria-label="Not in your plan" />}
                  </button>
                ))}
              </nav>
            )}

            {progress && (
              <div className="card status fx-in" role="status">
                <RefreshCw className="spin" aria-hidden style={{ width: 16, height: 16 }} />
                <span>
                  {progress.total ? `Loading results… ${progress.done} of ${progress.total} regattas` : "Finding every regatta registered on Clubspot…"}
                </span>
                <div className="loadbar">
                  <span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 6}%` }} />
                </div>
              </div>
            )}
            {error && <div className="card warn">{error}</div>}
            {broke && <OutOfCredits what={`Loading ${profile.name}'s results`} />}

            {broke && !hasData ? null : !hasData && !progress ? (
              <div className="card setup" style={{ margin: 0, maxWidth: "none", padding: 32 }}>
                <h2>No regattas found</h2>
                <p>
                  Nothing on Clubspot matches <b>{profile.name}</b>. Use the name exactly as it appears on regatta registrations (First Last), or{" "}
                  <Link href={`/search?${new URLSearchParams({ q: profile.name })}`}>search for similar names</Link>.
                </p>
              </div>
            ) : !hasData ? (
              <DashSkeleton />
            ) : (
              <>
                {tab !== "compare" && tab !== "clubs" && (
                  <div className="toolbar">
                    <select className="compact" value={season} onChange={(e) => setSeason(e.target.value)} aria-label="Season">
                      <option value="all">All seasons</option>
                      {seasons.map((y) => (
                        <option key={y} value={y}>
                          {y} season
                        </option>
                      ))}
                    </select>
                    {greenCount > 0 && (
                      <label className="toggle">
                        <input type="checkbox" checked={filters.green} onChange={(e) => setFilter({ ...filters, green: e.target.checked })} />
                        Include Green fleet
                      </label>
                    )}
                    {otherCount > 0 && (
                      <label className="toggle">
                        <input type="checkbox" checked={filters.other} onChange={(e) => setFilter({ ...filters, other: e.target.checked })} />
                        Include other classes
                      </label>
                    )}
                    <span className="spacer" />
                    <span className="small faint">
                      {results.length} of {store.results.length} regattas shown
                    </span>
                  </div>
                )}

                <div key={tab} className="tab-panel" role="tabpanel">
                  {tab === "overview" && (
                    <Overview name={profile.name} results={results} history={visibleHistory} allHistory={history} perf={perf} plus={plus} upcoming={upcoming} />
                  )}
                  {tab === "regattas" && (
                    <>
                      <RegattaList results={results} fields={fields} perf={perf} onNotMe={notMe} ratings={plus} />
                      <UnscoredList unscored={unscored} />
                    </>
                  )}
                  {tab === "races" && <RacesTab results={results} sailor={profile.name} />}
                  {tab === "compare" &&
                    (hasFeature(wallet.plan, "multiCompare") ? (
                      <Compare meName={profile.name} mine={loaded} plan={wallet.plan} />
                    ) : (
                      <Locked
                        wide
                        feature="multiCompare"
                        text="Line up sailors side by side: head-to-head records, same-start race results and ratings on one scale."
                      />
                    ))}
                  {tab === "clubs" &&
                    (hasFeature(wallet.plan, "clubSearch") ? (
                      <Clubs regattas={loaded} myClub={myClub} meName={profile.name} />
                    ) : (
                      <Locked wide feature="clubSearch" text="Team results for any club at every regatta, ranked by each club's best three finishers." />
                    ))}
                </div>
              </>
            )}
            <p className="app-foot">
              Results from Clubspot, checked against official results. Ratings are MySailingStats&rsquo; own estimate.
            </p>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function DashSkeleton() {
  return (
    <div className="stack" aria-hidden>
      <div className="kpis">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skel" style={{ height: 104 }} />
        ))}
      </div>
      <div className="skel" style={{ height: 150 }} />
      <div className="split">
        <div className="skel" style={{ height: 340 }} />
        <div className="skel" style={{ height: 340 }} />
      </div>
    </div>
  );
}

function Setup({ initial, onSave }: { initial: string; onSave: (p: Profile) => void }) {
  const [name, setName] = useState(initial);
  return (
    <section className="setup fx">
      <div className="ico" aria-hidden>
        <Users />
      </div>
      <h1>Set up your dashboard</h1>
      <p>Enter the sailor&rsquo;s name as it appears on regatta registrations. We&rsquo;ll find every regatta on Clubspot and score each race.</p>
      <form
        className="setup-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave({ name: name.trim() });
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First Last" autoFocus aria-label="Sailor name" />
        <button type="submit" className="btn btn-primary btn-lg" disabled={name.trim().split(/\s+/).length < 2}>
          Open dashboard
        </button>
      </form>
      <p className="setup-alt">
        Not sure of the spelling? <Link href="/">Search for the sailor</Link>.
      </p>
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
        <FleetSizeChart results={results} />
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
      <p className="muted small">Results for these were posted outside Clubspot (PDF or another site), or the sailor didn&rsquo;t race.</p>
      <ul>
        {[...unscored]
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((u) => (
            <li key={u.id}>
              <a href={u.url} target="_blank" rel="noreferrer">
                {u.name}
              </a>{" "}
              <span className="faint small">
                · {fmtDate(u.date)} · {u.fleet}
                {u.club ? ` · ${u.club}` : ""}
              </span>
            </li>
          ))}
      </ul>
    </details>
  );
}
