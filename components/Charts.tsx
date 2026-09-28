"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
  cursor: { stroke: "var(--text-muted)", strokeDasharray: "3 3" },
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

function Card({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="card chart">
      <h3>{title}</h3>
      <p className="muted small">{sub}</p>
      <div className="chart-box">{children}</div>
    </section>
  );
}

export function Charts({ results }: { results: RegattaResult[] }) {
  const chrono = [...results].sort((a, b) => a.date.localeCompare(b.date));
  const regattaData = chrono.map((r) => ({
    label: shortDate(r.date),
    name: r.name,
    pct: percentile(r.me.place, r.entrants),
    place: r.me.place,
    entrants: r.entrants,
    fleet: r.me.fleet,
  }));

  const races = allRaces(results);
  const roll = rollingAverage(races.map((r) => r.pct), 10);
  const raceData = races.map((r, i) => ({
    i: i + 1,
    label: `${r.regatta} · R${r.race}`,
    pct: r.pct,
    avg: roll[i],
    finish: r.letter ?? r.points,
    starters: r.starters,
  }));

  const dist = finishDistribution(races);
  const years = byYear(results);

  return (
    <div className="chart-grid">
      <Card title="Regatta finishes" sub="Share of your fleet you beat at each regatta (100% = won)">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={regattaData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            {grid}
            <XAxis dataKey="label" {...axis} />
            <YAxis domain={[0, 100]} unit="%" {...axis} />
            <Tooltip
              {...tooltipStyle}
              labelFormatter={(_, p) => (p?.[0]?.payload?.name as string) ?? ""}
              formatter={(v, _n, p) => {
                const d = p.payload as (typeof regattaData)[number];
                return [
                  `${Math.round(Number(v))}% · ${ordinal(d.place)} of ${d.entrants}${d.fleet ? ` · ${d.fleet}` : ""}`,
                  "Finish",
                ];
              }}
            />
            <Line
              type="monotone"
              dataKey="pct"
              stroke="var(--series-1)"
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-1)", fill: "var(--series-1)" }}
              activeDot={{ r: 6 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Every race" sub="Race-by-race share of the start beaten, with a 10-race rolling average">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={raceData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            {grid}
            <XAxis dataKey="i" {...axis} />
            <YAxis domain={[0, 100]} unit="%" {...axis} />
            <Tooltip
              {...tooltipStyle}
              labelFormatter={(_, p) => (p?.[0]?.payload?.label as string) ?? ""}
              formatter={(v, n, p) => {
                const d = p.payload as (typeof raceData)[number];
                if (n === "Race") return [`${d.finish}${d.starters ? ` of ${d.starters}` : ""} (${Math.round(Number(v))}%)`, n];
                return [`${Math.round(Number(v))}%`, n];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }} />
            <Line
              name="Race"
              dataKey="pct"
              stroke="var(--series-1)"
              strokeOpacity={0.35}
              strokeWidth={1}
              dot={{ r: 2.5, strokeWidth: 0, fill: "var(--series-1)" }}
              isAnimationActive={false}
            />
            <Line
              name="10-race average"
              dataKey="avg"
              stroke="var(--series-2)"
              strokeWidth={2}
              dot={false}
              type="monotone"
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Finish distribution" sub="Where your race finishes land in the start">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={dist} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
            {grid}
            <XAxis dataKey="bucket" {...axis} interval={0} fontSize={11} />
            <YAxis allowDecimals={false} {...axis} />
            <Tooltip {...tooltipStyle} cursor={{ fill: "var(--grid)" }} formatter={(v) => [v, "Races"]} />
            <Bar dataKey="races" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="By season" sub="Average share of the fleet beaten per calendar year">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={years} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            {grid}
            <XAxis dataKey="year" {...axis} />
            <YAxis domain={[0, 100]} unit="%" {...axis} />
            <Tooltip
              {...tooltipStyle}
              cursor={{ fill: "var(--grid)" }}
              formatter={(v, _n, p) => [
                `${Math.round(Number(v))}% over ${(p.payload as { regattas: number }).regattas} regatta(s)`,
                "Average",
              ]}
            />
            <Bar dataKey="avg" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={56} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
