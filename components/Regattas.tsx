"use client";

import { useMemo, useState } from "react";
import { clubKey } from "@/lib/analysis";
import type { FieldRow } from "@/lib/field";
import { fleetTier, TIER_LABEL } from "@/lib/fleets";
import { downloadCsv, fmtDate, ordinal } from "@/lib/format";
import type { RatingPoint } from "@/lib/rating";
import { percentile } from "@/lib/standings";
import { allRaces, type RegattaResult } from "@/lib/stats";

export function TierBadge({ fleet }: { fleet: string }) {
  const tier = fleetTier(fleet);
  return <span className={`badge tier-${tier}`}>{TIER_LABEL[tier]}</span>;
}

export function RegattaList(props: {
  results: RegattaResult[];
  fields: Record<string, FieldRow[]>;
  perf: Map<string, RatingPoint>;
  onNotMe: (id: string) => void;
}) {
  const [sort, setSort] = useState<"date" | "perf" | "pct">("date");
  const sorted = useMemo(() => {
    const rs = [...props.results];
    if (sort === "date") return rs.sort((a, b) => b.date.localeCompare(a.date));
    if (sort === "pct")
      return rs.sort((a, b) => (percentile(b.me.place, b.entrants) ?? -1) - (percentile(a.me.place, a.entrants) ?? -1));
    return rs.sort((a, b) => (props.perf.get(b.id)?.performance ?? -1e9) - (props.perf.get(a.id)?.performance ?? -1e9));
  }, [props.results, props.perf, sort]);

  return (
    <div className="list">
      <div className="list-tools small">
        <span className="muted">Sort by</span>
        {(
          [
            ["date", "Newest"],
            ["perf", "Best rating"],
            ["pct", "Best finish %"],
          ] as const
        ).map(([v, l]) => (
          <button key={v} className={`chip${sort === v ? " on" : ""}`} onClick={() => setSort(v)}>
            {l}
          </button>
        ))}
      </div>
      {sorted.map((r) => {
        const pct = percentile(r.me.place, r.entrants);
        const perf = props.perf.get(r.id);
        return (
          <details key={r.id} className="card regatta">
            <summary>
              <div className="rg-main">
                <div className="rg-name">
                  {r.name} <TierBadge fleet={r.fleet} />
                </div>
                <div className="muted small">
                  {fmtDate(r.date)}
                  {r.club ? ` · ${r.club}` : ""} · {r.fleet}
                  {r.me.fleet ? ` · ${r.me.fleet} fleet` : ""}
                  {r.me.sail ? ` · #${r.me.sail}` : ""}
                </div>
              </div>
              <div className="rg-place">
                <div className="big">
                  {ordinal(r.me.place)}
                  <span className="muted small"> / {r.entrants}</span>
                </div>
                <div className="muted small">
                  {r.me.net != null ? `${r.me.net} pts` : ""}
                  {pct != null ? ` · beat ${Math.round(pct)}%` : ""}
                  {perf ? ` · rating ${Math.round(perf.performance)}` : ""}
                </div>
              </div>
            </summary>
            <div className="races">
              {r.me.races.map((race) => (
                <div key={race.race} className={`race${race.drop ? " drop" : ""}${race.letter ? " letter" : ""}`} title={race.drop ? "Discarded" : undefined}>
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
            {props.fields[r.id] && <Leaderboard field={props.fields[r.id]} meId={r.me.id} myClub={r.me.club} />}
            <div className="rg-foot small">
              <span className="muted">
                {r.winner ? `Winner: ${r.winner.name}${r.winner.net != null ? ` (${r.winner.net})` : ""}` : ""}
                {perf ? ` · field strength ${Math.round(perf.fieldStrength)}` : ""}
              </span>
              <span className="btns">
                <a href={r.url} target="_blank" rel="noreferrer">
                  Official results ↗
                </a>
                <button className="link" onClick={() => props.onNotMe(r.id)} title="Remove a wrong name match">
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

/** The whole fleet: top 5, the boats around you, and your club-mates — or everyone. */
export function Leaderboard(props: { field: FieldRow[]; meId: string; myClub: string; highlightKey?: (row: FieldRow) => boolean }) {
  const [all, setAll] = useState(false);
  const me = props.field.find((r) => r.id === props.meId);
  const mine = clubKey(props.myClub);
  const rows = all
    ? props.field
    : props.field.filter(
        (r) =>
          r.p <= 5 ||
          (me && Math.abs(r.p - me.p) <= 3) ||
          (mine && clubKey(r.c) === mine) ||
          props.highlightKey?.(r),
      );
  const raceCount = Math.max(0, ...props.field.map((r) => r.r.length));
  let prev = 0;
  return (
    <div className="leaderboard">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Sailor</th>
              <th>Club</th>
              {Array.from({ length: raceCount }, (_, i) => (
                <th key={i} className="num">
                  R{i + 1}
                </th>
              ))}
              <th className="num">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const gap = !all && r.p > prev + 1;
              prev = r.p;
              const cls = [
                r.id === props.meId ? "me" : "",
                mine && clubKey(r.c) === mine && r.id !== props.meId ? "mate" : "",
                props.highlightKey?.(r) ? "rival" : "",
                gap ? "gap" : "",
              ].join(" ");
              return (
                <tr key={r.id} className={cls}>
                  <td className="num">
                    {r.p}
                    {r.f && <span className="muted tiny"> {r.f[0]}</span>}
                  </td>
                  <td className="nowrap">{r.n}</td>
                  <td className="clip">{r.c}</td>
                  {Array.from({ length: raceCount }, (_, i) => {
                    const x = r.r[i];
                    return (
                      <td key={i} className={`num${x?.[3] ? " dropped" : ""}`}>
                        {x ? (x[1] ?? x[0] ?? "–") : ""}
                      </td>
                    );
                  })}
                  <td className="num">
                    <b>{r.net ?? "–"}</b>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="lb-foot small">
        <span className="muted">
          <span className="key me" /> you <span className="key mate" /> your club{props.highlightKey ? <><span className="key rival" /> compared sailor</> : null}
          {props.field.some((r) => r.f) ? " · G/S/B/E = finals fleet" : ""}
        </span>
        <button className="link" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${props.field.length}`}
        </button>
      </div>
    </div>
  );
}

export function RaceTable({ results, sailor }: { results: RegattaResult[]; sailor: string }) {
  const races = useMemo(() => allRaces(results).reverse(), [results]);
  const exportCsv = () =>
    downloadCsv(`${sailor.replace(/\W+/g, "-")}-races.csv`, [
      ["Date", "Regatta", "Fleet", "Race", "Finish", "Letter", "Starters", "Discarded", "Beat %"],
      ...races.map((r) => {
        const reg = results.find((x) => x.id === r.regattaId);
        return [r.date.slice(0, 10), r.regatta, reg?.fleet ?? "", r.race, r.points, r.letter, r.starters, r.drop ? "yes" : "", r.pct != null ? Math.round(r.pct) : ""];
      }),
    ]);
  return (
    <div className="card table-wrap">
      <div className="table-tools">
        <span className="muted small">{races.length} races</span>
        <button onClick={exportCsv}>Download CSV</button>
      </div>
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
