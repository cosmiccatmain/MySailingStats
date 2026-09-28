"use client";

import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { RatingChart, RegattaChart, TierChart } from "./Charts";
import { ordinal } from "@/lib/format";
import { insights, tierSummaries } from "@/lib/insights";
import type { RatingPoint } from "@/lib/rating";
import { summary, type RegattaResult } from "@/lib/stats";

export function Overview(props: {
  name: string;
  results: RegattaResult[];
  history: RatingPoint[]; // rating history for the visible regattas
  allHistory: RatingPoint[]; // full history, for the headline rating
  perf: Map<string, RatingPoint>;
}) {
  const { results, history } = props;
  const s = useMemo(() => summary(results), [results]);
  const tiers = useMemo(() => tierSummaries(results, history), [results, history]);
  const notes = useMemo(() => insights(results, history).filter((n) => n.icon !== "🏆").slice(0, 3), [results, history]);
  if (!results.length) return <p className="muted">No regattas with scores for these filters.</p>;

  const all = props.allHistory;
  const current = all.length ? all[all.length - 1] : null;
  const yearAgo = current
    ? all.filter((h) => Date.parse(h.date) <= Date.parse(current.date) - 365 * 864e5).pop() ?? all[0]
    : null;
  const delta = current && yearAgo ? Math.round(current.after - yearAgo.before) : null;
  const best = [...results].sort(
    (a, b) => (props.perf.get(b.id)?.performance ?? -1e9) - (props.perf.get(a.id)?.performance ?? -1e9),
  )[0];
  const champ = tiers.find((t) => t.tier === "champ");
  const spark = all.map((h) => ({ t: Date.parse(h.date), r: Math.round(h.after) }));

  return (
    <>
      <section className="hero">
        <div className="hero-top">
          <div>
            <div className="hero-name">{props.name}</div>
            <div className="hero-rating">
              <span className="num">{current ? Math.round(current.after) : "–"}</span>
              <span>
                <span className="lbl">rating</span>
                {delta != null && Math.abs(delta) >= 1 && (
                  <>
                    <br />
                    <span className="delta">
                      {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} this year
                    </span>
                  </>
                )}
              </span>
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
                    contentStyle={{ background: "rgba(8,20,40,.9)", border: 0, borderRadius: 8, color: "#fff", fontSize: 12 }}
                    labelFormatter={(_, p) =>
                      p?.[0] ? new Date(p[0].payload.t).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : ""
                    }
                    formatter={(v) => [v, "Rating"]}
                  />
                  <Area type="monotone" dataKey="r" stroke="#fff" strokeWidth={2} fill="url(#sparkFill)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <div className="k">Regattas</div>
            <div className="v">{s.regattas}</div>
            <div className="s">
              {s.races} races · {s.clubs} club{s.clubs === 1 ? "" : "s"}
            </div>
          </div>
          <div className="hero-stat">
            <div className="k">Best performance</div>
            <div className="v">{best ? `${ordinal(best.me.place)}/${best.entrants}` : "–"}</div>
            <div className="s" title={best?.name}>
              {best?.name}
            </div>
          </div>
          <div className="hero-stat">
            <div className="k">Championship fleets</div>
            <div className="v">{champ?.avgPct != null ? `${Math.round(champ.avgPct)}%` : "–"}</div>
            <div className="s">{champ ? `avg beaten · ${champ.regattas} regattas` : "none yet"}</div>
          </div>
          <div className="hero-stat">
            <div className="k">Best race</div>
            <div className="v">{s.bestRace != null ? ordinal(s.bestRace) : "–"}</div>
            <div className="s">{s.top10Races} top-10 finishes</div>
          </div>
        </div>
      </section>

      {notes.length > 0 && (
        <div className="highlights">
          {notes.map((n) => (
            <div key={n.text} className="card highlight">
              <span className="ico" aria-hidden>
                {n.icon}
              </span>
              <p>{n.text}</p>
            </div>
          ))}
        </div>
      )}

      <div className="chart-grid">
        <RegattaChart results={results} perf={props.perf} />
        <RatingChart history={history} />
        <TierChart tiers={tiers} />
      </div>

    </>
  );
}
