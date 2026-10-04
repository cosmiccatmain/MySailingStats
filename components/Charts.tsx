"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { fleetTier, TIER_COLOR, TIER_LABEL, TIER_SHAPE, TIERS, type Tier } from "@/lib/fleets";
import { byRaceNumber, type TierSummary } from "@/lib/insights";
import type { RatingPoint } from "@/lib/rating";
import { ordinal } from "@/lib/format";
import { percentile } from "@/lib/standings";
import { allRaces, byYear, finishDistribution, rollingAverage, type RegattaResult } from "@/lib/stats";

const axis = { stroke: "var(--text-muted)", fontSize: 12, tickLine: false } as const;
const grid = <CartesianGrid stroke="var(--grid)" vertical={false} />;
const tooltipStyle = {
  contentStyle: {
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 13,
  },
  labelStyle: { color: "var(--text-secondary)" },
  itemStyle: { color: "var(--text-primary)" },
};
const legendStyle = { fontSize: 12, color: "var(--text-secondary)" };

const shortDate = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });


function Card(props: { title: string; sub: string; children: React.ReactNode; action?: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`card chart${props.wide ? " wide" : ""}`}>
      <div className="chart-head">
        <div>
          <h3>{props.title}</h3>
          <p className="muted small">{props.sub}</p>
        </div>
        {props.action}
      </div>
      <div className="chart-box">{props.children}</div>
    </section>
  );
}

function Seg<T extends string>(props: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {props.options.map(([v, label]) => (
        <button key={v} role="radio" aria-checked={props.value === v} onClick={() => props.onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

type Metric = "perf" | "pct" | "beaten";
const METRICS: [Metric, string][] = [
  ["perf", "Rating"],
  ["pct", "% beaten"],
  ["beaten", "Boats beaten"],
];

type Point = {
  t: number;
  y: number;
  name: string;
  place: number;
  entrants: number;
  fleet: string;
  tier: Tier;
  perf: number | null;
  strength: number | null;
};

function PointTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="tip">
      <b>{d.name}</b>
      <div className="muted">
        {new Date(d.t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {d.fleet}
      </div>
      <div>
        {ordinal(d.place)} of {d.entrants} · beat {Math.max(0, d.entrants - d.place)} boats (
        {Math.round(percentile(d.place, d.entrants) ?? 0)}%)
      </div>
      {d.perf != null && (
        <div>
          Performance rating <b>{Math.round(d.perf)}</b>
          {d.strength != null && <span className="muted"> · field avg {Math.round(d.strength)}</span>}
        </div>
      )}
    </div>
  );
}

/** Every regatta, coloured and shaped by fleet level, on a real time axis. */
export function RegattaChart({ results, perf }: { results: RegattaResult[]; perf: Map<string, RatingPoint> }) {
  const [metric, setMetric] = useState<Metric>("perf");
  const points: Point[] = results.map((r) => {
    const p = perf.get(r.id);
    const y =
      metric === "perf"
        ? p?.performance ?? NaN
        : metric === "pct"
          ? percentile(r.me.place, r.entrants) ?? NaN
          : Math.max(0, r.entrants - r.me.place);
    return {
      t: Date.parse(r.date),
      y,
      name: r.name,
      place: r.me.place,
      entrants: r.entrants,
      fleet: r.fleet,
      tier: fleetTier(r.fleet),
      perf: p?.performance ?? null,
      strength: p?.fieldStrength ?? null,
    };
  });
  const present = TIERS.filter((t) => points.some((p) => p.tier === t && Number.isFinite(p.y)));
  const sub =
    metric === "perf"
      ? "Adjusted for fleet strength — Championship results count for more"
      : metric === "pct"
        ? "Share of the fleet you beat (100% = won)"
        : "Boats that finished behind you";
  return (
    <Card title="Regatta results by fleet level" sub={sub} wide action={<Seg value={metric} options={METRICS} onChange={setMetric} />}>
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          {grid}
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin - 1296000000", "dataMax + 1296000000"]} tickFormatter={shortDate} {...axis} />
          <YAxis
            dataKey="y"
            type="number"
            domain={metric === "pct" ? [0, 100] : ["auto", "auto"]}
            unit={metric === "pct" ? "%" : ""}
            width={48}
            {...axis}
          />
          <ZAxis range={[90, 90]} />
          <Tooltip content={<PointTooltip />} cursor={{ strokeDasharray: "3 3", stroke: "var(--text-muted)" }} />
          <Legend wrapperStyle={legendStyle} />
          {present.map((tier) => (
            <Scatter
              key={tier}
              name={TIER_LABEL[tier]}
              data={points.filter((p) => p.tier === tier && Number.isFinite(p.y))}
              fill={TIER_COLOR[tier]}
              shape={TIER_SHAPE[tier]}
              stroke="var(--surface-1)"
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </Card>
  );
}

/** Rating over time (after each regatta). With `other`, overlays a second sailor. */
export function RatingChart(props: { history: RatingPoint[]; other?: { name: string; history: RatingPoint[] }; meName?: string }) {
  const rows = new Map<number, { t: number; me?: number; other?: number; tier?: Tier; otherTier?: Tier }>();
  for (const h of props.history) {
    const t = Date.parse(h.date);
    rows.set(t, { ...rows.get(t), t, me: Math.round(h.after), tier: h.tier });
  }
  for (const h of props.other?.history ?? []) {
    const t = Date.parse(h.date);
    rows.set(t, { ...rows.get(t), t, other: Math.round(h.after), otherTier: h.tier });
  }
  const data = [...rows.values()].sort((a, b) => a.t - b.t);
  const TierDot = (p: { cx?: number; cy?: number; payload?: { tier?: Tier }; value?: number }) =>
    p.cx == null || p.cy == null || p.value == null ? <g /> : (
      <circle cx={p.cx} cy={p.cy} r={4.5} fill={TIER_COLOR[p.payload?.tier ?? "champ"]} stroke="var(--surface-1)" strokeWidth={2} />
    );
  return (
    <Card
      title="Rating over time"
      sub={
        props.other
          ? "Both sailors on the same scale"
          : "Beating strong sailors counts more than beating beginners"
      }
      wide={!!props.other}
    >
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          {grid}
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={shortDate} {...axis} />
          <YAxis domain={["auto", "auto"]} width={48} {...axis} />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(t) => new Date(Number(t)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          />
          {props.other && <Legend wrapperStyle={legendStyle} />}
          <Line
            name={props.meName ?? "Rating"}
            dataKey="me"
            stroke="var(--series-1)"
            strokeWidth={2}
            dot={props.other ? { r: 3, fill: "var(--series-1)", strokeWidth: 0 } : <TierDot />}
            connectNulls
            isAnimationActive={false}
          />
          {props.other && (
            <Line
              name={props.other.name}
              dataKey="other"
              stroke="var(--series-2)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--series-2)", strokeWidth: 0 }}
              connectNulls
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

/** Fleet levels side by side: raw finish vs strength-adjusted rating. */
export function TierChart({ tiers }: { tiers: TierSummary[] }) {
  const [metric, setMetric] = useState<"perf" | "pct">("perf");
  const data = tiers.map((t) => ({
    tier: t.tier,
    label: TIER_LABEL[t.tier],
    value: metric === "perf" ? (t.avgPerformance != null ? Math.round(t.avgPerformance) : null) : t.avgPct != null ? Math.round(t.avgPct) : null,
    regattas: t.regattas,
    pct: t.avgPct,
    perf: t.avgPerformance,
  }));
  return (
    <Card
      title="Championship vs Green"
      sub={metric === "perf" ? "Average rating by fleet level" : "Average share of the fleet beaten"}
      action={
        <Seg
          value={metric}
          options={[
            ["perf", "Rating"],
            ["pct", "% beaten"],
          ]}
          onChange={setMetric}
        />
      }
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
          {grid}
          <XAxis dataKey="label" {...axis} interval={0} />
          <YAxis domain={metric === "pct" ? [0, 100] : [0, "auto"]} unit={metric === "pct" ? "%" : ""} width={48} {...axis} />
          <Tooltip
            {...tooltipStyle}
            cursor={{ fill: "var(--grid)" }}
            formatter={(_v, _n, p) => {
              const d = p.payload as (typeof data)[number];
              return [
                `${d.perf != null ? `rating ${Math.round(d.perf)} · ` : ""}${d.pct != null ? `${Math.round(d.pct)}% beaten` : ""} · ${d.regattas} regatta${d.regattas === 1 ? "" : "s"}`,
                d.label,
              ];
            }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={64} label={{ position: "top", fill: "var(--text-secondary)", fontSize: 12 }}>
            {data.map((d) => (
              <Cell key={d.tier} fill={TIER_COLOR[d.tier]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function RaceChart({ results }: { results: RegattaResult[] }) {
  const races = allRaces(results);
  const roll = rollingAverage(races.map((r) => r.pct), 10);
  const data = races.map((r, i) => ({
    i: i + 1,
    label: `${r.regatta} · R${r.race}`,
    pct: r.pct,
    avg: roll[i],
    finish: r.letter ?? r.points,
    starters: r.starters,
  }));
  return (
    <Card title="Every race" sub="Share of the start beaten, with a 10-race average">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          {grid}
          <XAxis dataKey="i" {...axis} />
          <YAxis domain={[0, 100]} unit="%" width={48} {...axis} />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(_, p) => (p?.[0]?.payload?.label as string) ?? ""}
            formatter={(v, n, p) => {
              const d = p.payload as (typeof data)[number];
              if (n === "Race") return [`${d.finish}${d.starters ? ` of ${d.starters}` : ""} (${Math.round(Number(v))}%)`, n];
              return [`${Math.round(Number(v))}%`, n];
            }}
          />
          <Legend wrapperStyle={legendStyle} />
          <Line name="Race" dataKey="pct" stroke="var(--series-1)" strokeOpacity={0.35} strokeWidth={1} dot={{ r: 2.5, strokeWidth: 0, fill: "var(--series-1)" }} isAnimationActive={false} />
          <Line name="10-race average" dataKey="avg" stroke="var(--series-2)" strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function RaceNumberChart({ results }: { results: RegattaResult[] }) {
  const data = byRaceNumber(results);
  const mean = data.length ? data.reduce((a, b) => a + b.avg * b.n, 0) / data.reduce((a, b) => a + b.n, 0) : 0;
  return (
    <Card title="Early vs late races" sub="Start fast or finish strong?">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          {grid}
          <XAxis dataKey="race" {...axis} />
          <YAxis domain={[0, 100]} unit="%" width={48} {...axis} />
          <ReferenceLine y={mean} stroke="var(--text-muted)" strokeDasharray="4 4" label={{ value: "your average", position: "insideTopRight", fill: "var(--text-muted)", fontSize: 11 }} />
          <Tooltip {...tooltipStyle} cursor={{ fill: "var(--grid)" }} formatter={(v, _n, p) => [`${Math.round(Number(v))}% over ${(p.payload as { n: number }).n} races`, "Average"]} />
          <Bar dataKey="avg" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function DistributionChart({ results }: { results: RegattaResult[] }) {
  const dist = finishDistribution(allRaces(results));
  return (
    <Card title="Finish distribution" sub="Where your finishes land in the start">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={dist} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          {grid}
          <XAxis dataKey="bucket" {...axis} interval={0} fontSize={11} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip {...tooltipStyle} cursor={{ fill: "var(--grid)" }} formatter={(v) => [v, "Races"]} />
          <Bar dataKey="races" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function SeasonChart({ results, perf }: { results: RegattaResult[]; perf: Map<string, RatingPoint> }) {
  const years = byYear(results).map((y) => {
    const ps = results.filter((r) => r.date.startsWith(y.year)).map((r) => perf.get(r.id)?.performance).filter((x): x is number => x != null);
    return { ...y, perf: ps.length ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : null };
  });
  return (
    <Card title="By season" sub="Average performance rating per calendar year">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={years} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
          {grid}
          <XAxis dataKey="year" {...axis} />
          <YAxis domain={[0, "auto"]} width={48} {...axis} />
          <Tooltip
            {...tooltipStyle}
            cursor={{ fill: "var(--grid)" }}
            formatter={(v, _n, p) => {
              const d = p.payload as (typeof years)[number];
              return [`rating ${v} · ${Math.round(d.avg)}% beaten · ${d.regattas} regatta(s)`, "Average"];
            }}
          />
          <Bar dataKey="perf" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={56} label={{ position: "top", fill: "var(--text-secondary)", fontSize: 12 }} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}


// Multi Compare: you plus up to five others. Three validated series colors, then neutral lines told apart by dash pattern.
const MULTI_STYLE: { stroke: string; dash?: string }[] = [
  { stroke: "var(--series-1)" },
  { stroke: "var(--series-2)" },
  { stroke: "var(--series-3)" },
  { stroke: "var(--text-muted)", dash: "6 4" },
  { stroke: "var(--text-muted)", dash: "2 4" },
  { stroke: "var(--text-muted)", dash: "10 4 2 4" },
];
export const MULTI_MAX_LINES = MULTI_STYLE.length;
export const multiStyle = (i: number) => MULTI_STYLE[Math.min(i, MULTI_STYLE.length - 1)];

export function MultiRatingChart({ series }: { series: { name: string; history: RatingPoint[] }[] }) {
  const shown = series.slice(0, MULTI_MAX_LINES);
  const rows = new Map<number, Record<string, number>>();
  shown.forEach((s, i) => {
    for (const h of s.history) {
      const t = Date.parse(h.date);
      rows.set(t, { ...rows.get(t), t, [`s${i}`]: Math.round(h.after) });
    }
  });
  const data = [...rows.values()].sort((a, b) => a.t - b.t);
  return (
    <Card
      title="Ratings, side by side"
      sub={series.length > shown.length ? `First ${shown.length} sailors shown · same scale` : "Everyone on the same scale"}
      wide
    >
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          {grid}
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={shortDate} {...axis} />
          <YAxis domain={["auto", "auto"]} width={48} {...axis} />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(t) => new Date(Number(t)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          />
          <Legend wrapperStyle={legendStyle} />
          {shown.map((s, i) => (
            <Line
              key={s.name}
              name={s.name}
              dataKey={`s${i}`}
              stroke={multiStyle(i).stroke}
              strokeDasharray={multiStyle(i).dash}
              strokeWidth={i === 0 ? 2.5 : 2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
