"use client";

import { ArrowRight, BadgeCheck, CalendarDays, ChevronDown, ExternalLink, Flag, Gauge, Hash, MapPin, Sailboat, School, SearchX, Sparkles } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SearchBox } from "./SearchBox";
import { CountUp } from "@/components/ui/CountUp";
import { ordinal } from "@/lib/format";
import { CREDITS_PER_SEARCH, fmtCredits } from "@/lib/plans";
import type { QuickStats } from "@/lib/quickstats";
import { sailorKey } from "@/lib/rating";
import type { BoatHit, ClubHit, RegattaHit, SailorHit, SearchResults as Results } from "@/lib/search";
import { SEARCH_TYPES, type SearchType } from "@/lib/search-types";
import { markPaid, spend, useWallet } from "@/lib/wallet";

type Tab = SearchType;
const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
const plural = (n: number, w: string) => `${n.toLocaleString("en-US")} ${w}${n === 1 ? "" : "s"}`;

export function SearchResults() {
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const type = (SEARCH_TYPES.find(([k]) => k === params.get("type"))?.[0] ?? "all") as SearchType;
  const wallet = useWallet();
  const [data, setData] = useState<Results | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "broke" | "error">("idle");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>(type);

  useEffect(() => {
    setTab(type);
    if (q.length < 2) return;
    // One charge per distinct search in this browser session (reloads and back-navigation are free).
    const key = `mss:charged:${type}:${q.toLowerCase()}`;
    let charged = false;
    try {
      charged = sessionStorage.getItem(key) === "1";
    } catch {
      /* storage blocked */
    }
    if (!charged) {
      if (!spend(CREDITS_PER_SEARCH)) {
        setState("broke");
        setData(null);
        return;
      }
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        /* storage blocked */
      }
    }
    let live = true;
    setState("loading");
    setData(null);
    fetch(`/api/search?${new URLSearchParams({ q, type })}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        return body as Results;
      })
      .then((d) => {
        if (!live) return;
        // The search already paid for this sailor: opening their dashboard is included.
        if (d.best) markPaid(`sailor:${sailorKey(d.best.name)}`);
        setData(d);
        setState("idle");
      })
      .catch((e) => live && (setError((e as Error).message), setState("error")));
    return () => {
      live = false;
    };
  }, [q, type]);

  const counts: Record<Tab, number> = {
    all: data ? (data.best ? 1 : 0) + data.sailors.length + data.regattas.length + data.clubs.length + data.boats.length + data.coaches.length : 0,
    sailors: data ? (data.best ? 1 : 0) + data.sailors.length : 0,
    regattas: data?.regattas.length ?? 0,
    clubs: data?.clubs.length ?? 0,
    boats: data?.boats.length ?? 0,
    coaches: data?.coaches.length ?? 0,
  };
  const show = (t: Tab) => tab === "all" || tab === t;

  return (
    <div className="sr">
      <SearchBox initialQuery={q} initialType={type} compact />
      {q.length < 2 ? (
        <div className="sr-empty">Search regattas, sailors, sail numbers, coaches or clubs.</div>
      ) : state === "broke" ? (
        <div className="gate fx">
          <div className="ico" aria-hidden>
            <Gauge />
          </div>
          <h3>You&rsquo;re out of credits</h3>
          <p>
            Each search uses {CREDITS_PER_SEARCH} credits and you have {fmtCredits(wallet.credits ?? 0)} left. Choose a plan for a monthly
            allowance. Boater includes 1,000 credits.
          </p>
          <Link className="btn btn-primary" href="/pricing">
            See plans
          </Link>
        </div>
      ) : (
        <>
          <div className="sr-tabs" role="tablist">
            {SEARCH_TYPES.map(([t, label]) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} disabled={type !== "all" && t !== type && t !== "all"}>
                {label}
                {data && <span>{counts[t]}</span>}
              </button>
            ))}
          </div>
          {state === "loading" && (
            <div className="sr-group" aria-busy>
              <div className="sr-list">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="skel sr-skel" style={{ opacity: 1 - i * 0.15 }} />
                ))}
              </div>
              <p className="sr-sources">Searching Clubspot and Regatta Network…</p>
            </div>
          )}
          {state === "error" && <div className="card warn" style={{ marginTop: 20 }}>Search failed: {error}</div>}
          {data && counts.all === 0 && (
            <div className="sr-empty fx">
              <SearchX aria-hidden />
              <div>
                No results for <b>{q}</b>.
              </div>
              <div className="small faint" style={{ marginTop: 4 }}>
                For a sailor, use their name as registered (First Last). For a regatta, use a word from its name.
              </div>
            </div>
          )}
          {data && (
            <div key={tab} className="fx-in">
              {show("sailors") && data.best && <BestMatch hit={data.best} q={q} />}
              {show("sailors") && data.sailors.length > 0 && <SailorGroup sailors={data.sailors} hasBest={!!data.best} q={q} />}
              {show("regattas") && data.regattas.length > 0 && <RegattaGroups regattas={data.regattas} />}
              {show("clubs") && data.clubs.length > 0 && <ClubGroups clubs={data.clubs} q={q} />}
              {show("boats") && data.boats.length > 0 && (
                <Group title="Boats" n={data.boats.length}>
                  <Expandable items={data.boats} render={(b, i) => <BoatItem key={`${b.regattaId}-${i}`} b={b} />} />
                </Group>
              )}
              {show("coaches") && data.coaches.length > 0 && (
                <Group title="Coaches" n={data.coaches.length}>
                  <Expandable items={data.coaches} render={(s) => <PersonItem key={s.name} s={s} coach />} />
                </Group>
              )}
              <div className="sr-sources">
                {data.sources.map((s) => (
                  <span key={s.name}>
                    <i className={s.ok ? "" : "off"} aria-hidden />
                    {s.name}
                    {s.ok ? "" : " (no response)"}
                  </span>
                ))}
                <span>{(data.tookMs / 1000).toFixed(1)}s</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Group({ title, n, note, children }: { title: string; n?: number; note?: string; children: React.ReactNode }) {
  return (
    <section className="sr-group">
      <h2>
        {title} {n != null && <small>{n}</small>}
      </h2>
      {note && <p className="note">{note}</p>}
      {children}
    </section>
  );
}

/** A list card that shows the first few rows and expands on demand. */
function Expandable<T>({ items, render, initial = 8, moreLabel }: { items: T[]; render: (t: T, i: number) => React.ReactNode; initial?: number; moreLabel?: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, initial);
  return (
    <div className="sr-list">
      {shown.map(render)}
      {items.length > initial && (
        <button className="sr-more" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : moreLabel ?? `Show all ${items.length}`}
          <ChevronDown aria-hidden style={{ transform: all ? "rotate(180deg)" : undefined }} />
        </button>
      )}
    </div>
  );
}

// ---------- sailors ----------

function BestMatch({ hit, q }: { hit: SailorHit; q: string }) {
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setStats(null);
    setFailed(false);
    fetch(`/api/quick?${new URLSearchParams({ name: hit.name })}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((s: QuickStats) => live && setStats(s))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [hit.name]);
  const href = `/dashboard?${new URLSearchParams({ name: hit.name })}`;
  const loading = !stats && !failed;
  const best = stats?.best;
  return (
    <section className="card bm fx">
      <div className="bm-top">
        <span className="avatar" aria-hidden>
          {initials(hit.name)}
        </span>
        <div className="who">
          <div className="lbl">
            {hit.match === "exact" ? (
              <>
                <BadgeCheck aria-hidden /> Best match
              </>
            ) : (
              <>
                <Sparkles aria-hidden /> Closest match for “{q}”
              </>
            )}
          </div>
          <h2>{hit.name}</h2>
          <div className="meta">
            {(stats?.club || hit.clubs[0]) && (
              <span>
                <School aria-hidden />
                {stats?.club || hit.clubs[0]}
              </span>
            )}
            {(stats?.sail || (hit.sail && hit.sail !== "TBD")) && (
              <span>
                <Hash aria-hidden />
                {stats?.sail || hit.sail}
              </span>
            )}
            {stats?.firstDate && (
              <span>
                <CalendarDays aria-hidden />
                Racing since {new Date(stats.firstDate).getFullYear()}
              </span>
            )}
          </div>
        </div>
        <Link className="btn btn-primary" href={href}>
          Open dashboard <ArrowRight aria-hidden />
        </Link>
      </div>
      <div className="bm-kpis">
        <Kpi label="Regattas" loading={loading} sub={stats ? "registered on Clubspot" : undefined}>
          {stats ? <CountUp value={stats.regattas} /> : hit.regattas}
        </Kpi>
        <Kpi label="Best recent finish" loading={loading} sub={best?.regatta}>
          {best ? (
            <>
              {ordinal(best.place)}
              <small> / {best.entrants}</small>
            </>
          ) : (
            "–"
          )}
        </Kpi>
        <Kpi label="Avg. fleet beaten" loading={loading} sub={stats ? `last ${stats.results.length} scored` : undefined}>
          {stats?.avgPct != null ? (
            <>
              <CountUp value={Math.round(stats.avgPct)} />%
            </>
          ) : (
            "–"
          )}
        </Kpi>
        <Kpi label="Podiums" loading={loading} sub={stats ? `in last ${stats.results.length}` : undefined}>
          {stats ? <CountUp value={stats.podiums} /> : "–"}
        </Kpi>
      </div>
      {loading ? (
        <div className="bm-recent">
          <h3>Recent results</h3>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skel" style={{ height: 22, margin: "10px 0", opacity: 1 - i * 0.25 }} />
          ))}
        </div>
      ) : stats && stats.results.length > 0 ? (
        <div className="bm-recent">
          <h3>Recent results</h3>
          {stats.results.slice(0, 5).map((r) => (
            <div key={`${r.regattaId}-${r.fleet}`} className={`bm-row tier-${r.tier}`}>
              <span className="pl">
                {ordinal(r.place)}
                <small>/{r.entrants}</small>
              </span>
              <span className="nm" title={`${r.regatta} · ${r.fleet}`}>
                {r.regatta} <span className="faint">· {r.fleet}</span>
              </span>
              <span className="meter" title={r.pct != null ? `Beat ${Math.round(r.pct)}% of the fleet` : undefined}>
                <span style={{ width: `${r.pct ?? 0}%` }} />
              </span>
              <span className="dt">{fmt(r.date)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="bm-recent small muted">{failed ? "Couldn't load recent results right now." : "No scored results online yet."}</div>
      )}
      <div className="bm-foot">
        <span>Included in this search: opening the full dashboard uses no extra credits.</span>
        {stats && stats.regattas > stats.sampled && <span>Recent results show the last {stats.sampled} regattas.</span>}
      </div>
    </section>
  );
}

function Kpi({ label, sub, loading, children }: { label: string; sub?: string; loading: boolean; children: React.ReactNode }) {
  return (
    <div className="bm-kpi">
      <small>{label}</small>
      {loading ? <div className="skel" /> : <b>{children}</b>}
      {!loading && sub && <span title={sub}>{sub}</span>}
    </div>
  );
}

function SailorGroup({ sailors, hasBest, q }: { sailors: SailorHit[]; hasBest: boolean; q: string }) {
  const near = sailors.filter((s) => s.match !== "surname");
  const rest = sailors.filter((s) => s.match === "surname");
  const surname = q.trim().split(/\s+/).slice(-1)[0];
  // A full-name search with a match keeps everyone else out of the way.
  if (hasBest || near.length) {
    return (
      <>
        {near.length > 0 && (
          <Group title={hasBest ? "Similar names" : "Possible matches"} n={near.length}>
            <Expandable items={near} initial={4} render={(s) => <PersonItem key={s.name} s={s} />} />
          </Group>
        )}
        {rest.length > 0 && <CollapsedPeople people={rest} label={`${plural(rest.length, "other sailor")} named ${surname}`} />}
      </>
    );
  }
  return (
    <Group title="Sailors" n={sailors.length}>
      <Expandable items={sailors} render={(s) => <PersonItem key={s.name} s={s} />} />
    </Group>
  );
}

function CollapsedPeople({ people, label }: { people: SailorHit[]; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="sr-group">
      {open ? (
        <>
          <h2>
            Others <small>{people.length}</small>
          </h2>
          <Expandable items={people} render={(s) => <PersonItem key={s.name} s={s} />} />
        </>
      ) : (
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          {label} <ChevronDown aria-hidden />
        </button>
      )}
    </section>
  );
}

function PersonItem({ s, coach }: { s: SailorHit; coach?: boolean }) {
  const body = (
    <>
      <span className="sr-ico" aria-hidden>
        {initials(s.name)}
      </span>
      <span className="sr-main">
        <span className="sr-title">
          <span>{s.name}</span>
        </span>
        <span className="sr-sub">
          {[s.clubs.slice(0, 2).join(", "), s.lastRegatta && `Last: ${s.lastRegatta}, ${new Date(s.lastDate).getFullYear()}`].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="sr-side">
        <span className="opt">{coach ? "Coach" : `~${plural(s.regattas, "regatta")}`}</span>
        {!coach && <ArrowRight aria-hidden />}
      </span>
    </>
  );
  return coach ? (
    <div className="sr-item">{body}</div>
  ) : (
    <Link className="sr-item" href={`/dashboard?${new URLSearchParams({ name: s.name })}`}>
      {body}
    </Link>
  );
}

// ---------- regattas ----------

function RegattaGroups({ regattas }: { regattas: RegattaHit[] }) {
  const { upcoming, past } = useMemo(() => {
    const today = new Date(new Date().toDateString()).getTime();
    const up = regattas.filter((r) => r.date && Date.parse(r.date) >= today).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    const ids = new Set(up.map((r) => r.id));
    return { upcoming: up, past: regattas.filter((r) => !ids.has(r.id)) };
  }, [regattas]);
  return (
    <>
      {upcoming.length > 0 && (
        <Group title="Upcoming regattas" n={upcoming.length}>
          <Expandable items={upcoming} initial={5} render={(r) => <RegattaItem key={r.id} r={r} />} />
        </Group>
      )}
      {past.length > 0 && (
        <Group title={upcoming.length ? "Past regattas" : "Regattas"} n={past.length}>
          <Expandable items={past} render={(r) => <RegattaItem key={r.id} r={r} />} />
        </Group>
      )}
    </>
  );
}

function RegattaItem({ r }: { r: RegattaHit }) {
  const d = r.date ? new Date(r.date) : null;
  const inner = (
    <>
      <span className="sr-ico date" aria-hidden>
        {d ? (
          <>
            <small>{d.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</small>
            <b>{d.getDate()}</b>
          </>
        ) : (
          <Flag />
        )}
      </span>
      <span className="sr-main">
        <span className="sr-title">
          <span>{r.name}</span>
        </span>
        <span className="sr-sub">{[d?.getFullYear(), r.club, r.location].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="sr-side">
        <span className="src-tag">{r.source}</span>
        {r.external ? <ExternalLink aria-hidden /> : <ArrowRight aria-hidden />}
      </span>
    </>
  );
  return r.external ? (
    <a className="sr-item" href={r.url} target="_blank" rel="noreferrer">
      {inner}
    </a>
  ) : (
    <Link className="sr-item" href={r.url}>
      {inner}
    </Link>
  );
}

// ---------- clubs & boats ----------

function ClubGroups({ clubs, q }: { clubs: ClubHit[]; q: string }) {
  const named = clubs.filter((c) => c.match === "name");
  const initialsOnly = clubs.filter((c) => c.match === "initials");
  return (
    <>
      {named.length > 0 && (
        <Group title="Clubs" n={named.length}>
          <Expandable items={named} initial={6} render={(c) => <ClubItem key={c.id} c={c} />} />
        </Group>
      )}
      {initialsOnly.length > 0 && (
        <Group
          title={`Clubs that could be “${q.toUpperCase()}”`}
          n={initialsOnly.length}
          note="Abbreviations can stand for more than one club, so these are matched by initials only. Check the name before relying on it."
        >
          <Expandable items={initialsOnly} initial={6} render={(c) => <ClubItem key={c.id} c={c} />} />
        </Group>
      )}
    </>
  );
}

function ClubItem({ c }: { c: ClubHit }) {
  return (
    <Link className="sr-item" href={c.url}>
      <span className="sr-ico" aria-hidden>
        <School />
      </span>
      <span className="sr-main">
        <span className="sr-title">
          <span>{c.name}</span>
        </span>
        <span className="sr-sub">
          {c.location ? (
            <>
              <MapPin aria-hidden style={{ width: 12, height: 12, verticalAlign: -1 }} /> {c.location}
            </>
          ) : (
            "Club on Clubspot"
          )}
        </span>
      </span>
      <span className="sr-side">
        <span className="opt">Regattas</span>
        <ArrowRight aria-hidden />
      </span>
    </Link>
  );
}

function BoatItem({ b }: { b: BoatHit }) {
  return (
    <Link className="sr-item" href={`/regatta/${b.regattaId}`}>
      <span className="sr-ico" aria-hidden>
        <Sailboat />
      </span>
      <span className="sr-main">
        <span className="sr-title">
          <span>{b.boat ? `${b.boat}${b.sail ? ` · #${b.sail}` : ""}` : `Sail #${b.sail}`}</span>
        </span>
        <span className="sr-sub">{[b.sailor, b.regatta, fmt(b.date)].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="sr-side">
        <ArrowRight aria-hidden />
      </span>
    </Link>
  );
}

