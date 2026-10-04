"use client";

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Flag,
  Medal,
  Percent,
  Scale,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { RatingChart, RegattaChart, TierChart } from "./Charts";
import { Locked } from "./site/Gate";
import { CountUp } from "./ui/CountUp";
import { fleetTier, TIER_LABEL, TIERS, type Tier } from "@/lib/fleets";
import { fmtDate, ordinal } from "@/lib/format";
import { insights, tierSummaries, type InsightIcon } from "@/lib/insights";
import type { RatingPoint } from "@/lib/rating";
import { percentile } from "@/lib/standings";
import { allRaces, seasons, summary, type RegattaResult } from "@/lib/stats";

export type Upcoming = { regattaId: string; regatta: string; date: string; club: string; fleet: string };

const ICONS: Record<InsightIcon, LucideIcon> = {
  balance: Scale,
  trophy: Trophy,
  trend: TrendingUp,
  clock: Timer,
  flag: Flag,
  target: Target,
  spread: Activity,
};
const pctOf = (r: RegattaResult) => percentile(r.me.place, r.entrants);
const TIER_BONUS: Record<Tier, number> = { champ: 30, rwb: 15, open: 10, green: 0 };
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function Overview(props: {
  name: string;
  results: RegattaResult[];
  history: RatingPoint[]; // rating history for the visible regattas
  allHistory: RatingPoint[]; // full history, for the headline rating
  perf: Map<string, RatingPoint>;
  plus: boolean;
  upcoming: Upcoming[] | null;
}) {
  const { results, history, plus } = props;
  const s = useMemo(() => summary(results), [results]);
  const tiers = useMemo(() => tierSummaries(results, history), [results, history]);
  const notes = useMemo(() => insights(results, history).filter((n) => n.icon !== "trophy").slice(0, 4), [results, history]);
  const seasonRows = useMemo(() => seasons(results), [results]);
  const recent = useMemo(() => [...results].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8), [results]);

  if (!results.length) return <div className="card muted">No scored regattas for these filters. Try including Green fleet or another season.</div>;

  // Best finish: by rating with DashboardPlus, otherwise share beaten weighted by fleet level.
  const best =
    [...results].sort((a, b) =>
      plus
        ? (props.perf.get(b.id)?.performance ?? -1e9) - (props.perf.get(a.id)?.performance ?? -1e9)
        : (pctOf(b) ?? 0) + TIER_BONUS[fleetTier(b.fleet)] - ((pctOf(a) ?? 0) + TIER_BONUS[fleetTier(a.fleet)]),
    )[0] ?? null;
  const podiums = results.filter((r) => r.me.place <= 3).length;
  const [thisSeason, lastSeason] = seasonRows;
  const seasonDelta = thisSeason?.avgPct != null && lastSeason?.avgPct != null ? Math.round(thisSeason.avgPct - lastSeason.avgPct) : null;

  return (
    <>
      {plus ? <RatingHero all={props.allHistory} /> : <PlusStrip />}

      <div className="kpis fx-stagger">
        <div className="card kpi">
          <div className="k">
            <Flag aria-hidden /> Regattas
          </div>
          <div className="v">
            <CountUp value={s.regattas} />
          </div>
          <div className="s">
            {s.races} races · {s.clubs} club{s.clubs === 1 ? "" : "s"}
          </div>
        </div>
        <div className="card kpi">
          <div className="k">
            <Percent aria-hidden /> Avg. fleet beaten
          </div>
          <div className="v">
            {s.avgPct != null ? (
              <>
                <CountUp value={Math.round(s.avgPct)} />%
              </>
            ) : (
              "–"
            )}
            {seasonDelta != null && Math.abs(seasonDelta) >= 1 && (
              <span className={`trend ${seasonDelta > 0 ? "up" : "down"}`} title={`${thisSeason.year} vs ${lastSeason.year}`}>
                {seasonDelta > 0 ? <ArrowUpRight aria-hidden /> : <ArrowDownRight aria-hidden />}
                {Math.abs(seasonDelta)}
              </span>
            )}
          </div>
          <div className="s">{seasonDelta != null && Math.abs(seasonDelta) >= 1 ? `${thisSeason.year} vs ${lastSeason.year}` : "across the regattas shown"}</div>
        </div>
        <div className="card kpi">
          <div className="k">
            <Trophy aria-hidden /> Best finish
          </div>
          <div className="v">
            {best ? (
              <>
                {ordinal(best.me.place)}
                <small> / {best.entrants}</small>
              </>
            ) : (
              "–"
            )}
          </div>
          <div className="s" title={best?.name}>
            {best ? `${best.name} · ${TIER_LABEL[fleetTier(best.fleet)]}` : ""}
          </div>
        </div>
        <div className="card kpi">
          <div className="k">
            <Medal aria-hidden /> Podiums
          </div>
          <div className="v">
            <CountUp value={podiums} />
          </div>
          <div className="s">{s.top10Races} top-10 race finishes</div>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h3>Recent form</h3>
            <p>Last {recent.length} regattas, newest first. Bar shows the share of the fleet beaten.</p>
          </div>
        </div>
        <div className="form-strip fx-stagger">
          {recent.map((r) => {
            const p = pctOf(r);
            return (
              <a key={r.id} className={`form-cell tier-${fleetTier(r.fleet)}`} href={r.url} target="_blank" rel="noreferrer" title={`${r.name} · ${r.fleet} · ${fmtDate(r.date)}`} style={{ color: "inherit", textDecoration: "none" }}>
                <div className="pl">
                  {ordinal(r.me.place)}
                  <small>/{r.entrants}</small>
                </div>
                <div className="nm">{r.name}</div>
                <div className="nm faint">{new Date(r.date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</div>
                <div className="meter">
                  <span style={{ width: `${p ?? 0}%` }} />
                </div>
              </a>
            );
          })}
        </div>
      </section>

      <div className="split">
        <div className="stack">
          <div className="chart-grid">
            <RegattaChart results={results} perf={props.perf} ratings={plus} />
          </div>
          <SeasonTable rows={seasonRows} />
        </div>
        <div className="stack">
          <UpcomingCard items={props.upcoming} />
          <PersonalBests results={results} />
        </div>
      </div>

      {plus ? (
        notes.length > 0 && (
          <div className="insights fx-stagger">
            {notes.map((n) => {
              const Icon = ICONS[n.icon];
              return (
                <div key={n.text} className="card insight">
                  <span className="ico" aria-hidden>
                    <Icon />
                  </span>
                  <p>{n.text}</p>
                </div>
              );
            })}
          </div>
        )
      ) : null}

      <div className="chart-grid">
        {plus ? (
          <>
            <RatingChart history={history} />
            <TierChart tiers={tiers} />
          </>
        ) : (
          <>
            <Locked
              feature="dashboardPlus"
              title="Rating over time"
              text="A rating that moves after every regatta and accounts for fleet strength, so Championship results count for more than Green fleet wins."
            />
            <Locked feature="dashboardPlus" title="Insights and fleet-level comparison" text="Consistency, starts, early vs late races, and how results compare across Championship, Red/White/Blue and Green fleets." />
          </>
        )}
      </div>
    </>
  );
}

function RatingHero({ all }: { all: RatingPoint[] }) {
  const current = all.length ? all[all.length - 1] : null;
  const yearAgo = current ? all.filter((h) => Date.parse(h.date) <= Date.parse(current.date) - 365 * 864e5).pop() ?? all[0] : null;
  const delta = current && yearAgo ? Math.round(current.after - yearAgo.before) : null;
  const peak = all.length ? Math.round(Math.max(...all.map((h) => h.after))) : null;
  const field = avg(all.slice(-5).map((h) => h.fieldStrength));
  const spark = all.map((h) => ({ t: Date.parse(h.date), r: Math.round(h.after) }));
  return (
    <section className="hero fx">
      <div className="hero-grid">
        <div>
          <div className="k">
            <Sparkles aria-hidden /> Fleet-strength rating
          </div>
          <div className="hero-num">
            <span className="num">{current ? <CountUp value={Math.round(current.after)} duration={900} /> : "–"}</span>
            {delta != null && Math.abs(delta) >= 1 && (
              <span className="delta">
                {delta > 0 ? <ArrowUpRight aria-hidden /> : <ArrowDownRight aria-hidden />}
                {Math.abs(delta)} in 12 months
              </span>
            )}
          </div>
          <div className="hero-meta">
            <div>
              Peak<b>{peak ?? "–"}</b>
            </div>
            <div>
              Recent fleets<b>{field != null ? Math.round(field) : "–"}</b>
            </div>
            <div>
              Regattas rated<b>{all.length}</b>
            </div>
          </div>
        </div>
        {spark.length > 1 && (
          <div className="hero-spark" aria-label="Rating trend">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spark} margin={{ top: 6, right: 4, left: 4, bottom: 6 }}>
                <defs>
                  <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fff" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#fff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis hide domain={["dataMin - 20", "dataMax + 20"]} />
                <Tooltip
                  cursor={{ stroke: "rgba(255,255,255,.5)" }}
                  contentStyle={{ background: "rgba(8,20,40,.92)", border: 0, borderRadius: 8, color: "#fff", fontSize: 12 }}
                  labelFormatter={(_, p) => (p?.[0] ? new Date(p[0].payload.t).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "")}
                  formatter={(v) => [v, "Rating"]}
                />
                <Area type="monotone" dataKey="r" stroke="#fff" strokeWidth={2} fill="url(#sparkFill)" animationDuration={900} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}

function PlusStrip() {
  return (
    <section className="card hero-locked fx">
      <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
        <span className="pb-ico" style={{ background: "var(--brand-soft)", color: "var(--accent)", borderColor: "transparent" }} aria-hidden>
          <Sparkles />
        </span>
        <div>
          <h3>You&rsquo;re on DashboardGo</h3>
          <p className="small muted" style={{ marginTop: 2, maxWidth: 620 }}>
            DashboardPlus adds a fleet-strength rating, rating history, insights and Rival Radar, so you can see how good each result really
            was.
          </p>
        </div>
      </div>
      <div className="row">
        <Link className="btn btn-secondary btn-sm" href="/pricing#dashboards">
          Compare dashboards
        </Link>
        <Link className="btn btn-primary btn-sm" href="/pricing">
          Upgrade
        </Link>
      </div>
    </section>
  );
}

function SeasonTable({ rows }: { rows: ReturnType<typeof seasons> }) {
  if (rows.length < 1) return null;
  return (
    <section className="card pad-0 table-wrap">
      <div className="table-tools">
        <div>
          <h3 style={{ fontSize: 15 }}>By season</h3>
          <p className="small muted">Calendar years, newest first</p>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Season</th>
            <th className="num">Regattas</th>
            <th className="num">Races</th>
            <th className="num">Avg. beaten</th>
            <th className="num">Podiums</th>
            <th>Best finish</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.year}>
              <td>
                <b>{r.year}</b>
              </td>
              <td className="num">{r.regattas}</td>
              <td className="num">{r.races}</td>
              <td className="num">{r.avgPct != null ? `${Math.round(r.avgPct)}%` : "–"}</td>
              <td className="num">{r.podiums}</td>
              <td className="clip" title={r.best?.name}>
                {r.best ? (
                  <>
                    <b>{ordinal(r.best.me.place)}</b>
                    <span className="faint">/{r.best.entrants}</span> <span className="muted">{r.best.name}</span>
                  </>
                ) : (
                  "–"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function UpcomingCard({ items }: { items: Upcoming[] | null }) {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h3>Upcoming</h3>
          <p>Regattas registered on Clubspot</p>
        </div>
        <CalendarDays aria-hidden style={{ width: 18, height: 18, color: "var(--text-muted)" }} />
      </div>
      {items == null ? (
        <div className="stack" style={{ gap: 10 }}>
          {[0, 1].map((i) => (
            <div key={i} className="skel" style={{ height: 46 }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="small muted">No upcoming registrations found.</p>
      ) : (
        <div className="mini-list">
          {items.slice(0, 5).map((u) => {
            const d = new Date(u.date);
            const days = Math.ceil((d.getTime() - Date.now()) / 864e5);
            return (
              <Link key={`${u.regattaId}-${u.fleet}`} href={`/regatta/${u.regattaId}`} style={{ color: "inherit", textDecoration: "none" }}>
                <span className="date-tile" aria-hidden>
                  <small>{d.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</small>
                  <b>{d.getDate()}</b>
                </span>
                <span className="main">
                  <span className="t" style={{ display: "block" }}>{u.regatta}</span>
                  <span className="d" style={{ display: "block" }}>{[u.fleet, u.club].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="side faint" style={{ fontWeight: 550 }}>{days <= 0 ? "Now" : days === 1 ? "1 day" : `${days} days`}</span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PersonalBests({ results }: { results: RegattaResult[] }) {
  const rows: { icon: LucideIcon; label: string; value: string; detail: string }[] = [];
  for (const tier of TIERS) {
    const rs = results.filter((r) => fleetTier(r.fleet) === tier);
    if (!rs.length) continue;
    const b = [...rs].sort((a, c) => (pctOf(c) ?? -1) - (pctOf(a) ?? -1) || a.me.place - c.me.place)[0];
    rows.push({ icon: Trophy, label: `Best ${TIER_LABEL[tier]} finish`, value: `${ordinal(b.me.place)} / ${b.entrants}`, detail: b.name });
  }
  const races = allRaces(results).filter((r) => r.points != null && !r.letter);
  const bestRace = [...races].sort((a, b) => (a.points as number) - (b.points as number) || (b.starters ?? 0) - (a.starters ?? 0))[0];
  if (bestRace) rows.push({ icon: Target, label: "Best race", value: ordinal(bestRace.points as number), detail: `${bestRace.regatta}, R${bestRace.race}` });
  const most = [...results].sort((a, b) => b.entrants - b.me.place - (a.entrants - a.me.place))[0];
  if (most) rows.push({ icon: Users, label: "Most boats beaten", value: `${most.entrants - most.me.place}`, detail: most.name });
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h3>Personal bests</h3>
          <p>For the regattas shown</p>
        </div>
      </div>
      <div className="mini-list">
        {rows.map((r) => (
          <div key={r.label}>
            <span className="pb-ico" aria-hidden>
              <r.icon />
            </span>
            <span className="main">
              <span className="t" style={{ display: "block", fontWeight: 550, fontSize: 13, color: "var(--text-secondary)" }}>{r.label}</span>
              <span className="d" style={{ display: "block" }} title={r.detail}>{r.detail}</span>
            </span>
            <span className="side">{r.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
