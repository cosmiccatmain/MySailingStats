"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TierBadge } from "./Regattas";
import { allClubs, clubHistory, clubKey, clubTeams, TEAM_SIZE, type LoadedRegatta } from "@/lib/analysis";
import { fleetTier } from "@/lib/fleets";
import { fmtDate, ordinal } from "@/lib/format";
import { sailorKey } from "@/lib/rating";
import { percentile } from "@/lib/standings";

export function Clubs(props: { regattas: LoadedRegatta[]; myClub: string; meName: string }) {
  const clubs = useMemo(() => allClubs(props.regattas), [props.regattas]);
  const [query, setQuery] = useState(props.myClub);
  const [allMembers, setAllMembers] = useState(false);
  const selected = useMemo(() => {
    const k = clubKey(query);
    return clubs.find((c) => c.key === k) ?? clubs.find((c) => k && c.key.includes(k)) ?? null;
  }, [clubs, query]);
  const history = useMemo(() => (selected ? clubHistory(props.regattas, selected.key) : []), [props.regattas, selected]);
  const meKey = sailorKey(props.meName);

  // Every sailor who has raced for this club in the loaded regattas.
  const members = useMemo(() => {
    const m = new Map<string, { name: string; regattas: number; best: number; bestOf: number; pcts: number[] }>();
    for (const h of history) {
      for (const s of h.team.sailors) {
        const k = sailorKey(s.n);
        const e = m.get(k) ?? { name: s.n, regattas: 0, best: Infinity, bestOf: 0, pcts: [] };
        e.regattas++;
        if (s.p < e.best) {
          e.best = s.p;
          e.bestOf = h.regatta.field.length;
        }
        const p = percentile(s.p, h.regatta.field.length);
        if (p != null) e.pcts.push(p);
        m.set(k, e);
      }
    }
    return [...m.entries()]
      .map(([key, e]) => ({ key, ...e, avg: e.pcts.length ? e.pcts.reduce((a, b) => a + b, 0) / e.pcts.length : null }))
      .sort((a, b) => b.regattas - a.regattas || (b.avg ?? 0) - (a.avg ?? 0));
  }, [history]);

  const ranked = history.filter((h) => h.team.teamRank != null);
  const chart = [...history]
    .reverse()
    .map((h) => ({ t: Date.parse(h.regatta.date), avg: h.avgPct != null ? Math.round(h.avgPct) : null, name: h.regatta.name, n: h.team.sailors.length }));

  return (
    <div className="stack">
      <div className="card compare-search">
        <label>
          Club
          <input list="club-names" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Annapolis Yacht Club" />
        </label>
        <datalist id="club-names">
          {clubs.map((c) => (
            <option key={c.key} value={c.club}>
              {c.regattas} regattas
            </option>
          ))}
        </datalist>
        <p className="muted small">
          Team results for any club seen in your regattas. Team score = the sum of a club&rsquo;s best {TEAM_SIZE} places (lower is
          better); clubs need {TEAM_SIZE}+ sailors to be ranked.
        </p>
      </div>

      {!selected ? (
        <p className="muted">No club matches &ldquo;{query}&rdquo; in your regattas.</p>
      ) : (
        <>
          <div className="tiles">
            <div className="card tile club-tile">
              <div className="muted small">Club</div>
              <div className="club-name">{selected.club}</div>
            </div>
            <div className="card tile">
              <div className="muted small">Regattas with sailors</div>
              <div className="big">{history.length}</div>
            </div>
            <div className="card tile">
              <div className="muted small">Sailors</div>
              <div className="big">{members.length}</div>
            </div>
            <div className="card tile">
              <div className="muted small">Team wins</div>
              <div className="big">{ranked.filter((h) => h.team.teamRank === 1).length}</div>
              <div className="muted small">{ranked.filter((h) => (h.team.teamRank ?? 99) <= 3).length} team podiums</div>
            </div>
            <div className="card tile">
              <div className="muted small">Best team finish</div>
              <div className="big">
                {ranked.length ? ordinal(Math.min(...ranked.map((h) => h.team.teamRank!))) : "–"}
              </div>
            </div>
          </div>

          {chart.length > 1 && (
            <section className="card chart">
              <h3>Club performance over time</h3>
              <p className="muted small">Average share of the fleet beaten by the club&rsquo;s sailors at each regatta</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chart} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t) => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" })} stroke="var(--text-muted)" fontSize={12} tickLine={false} />
                  <YAxis domain={[0, 100]} unit="%" width={48} stroke="var(--text-muted)" fontSize={12} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }}
                    labelFormatter={(_, p) => (p?.[0]?.payload?.name as string) ?? ""}
                    formatter={(v, _n, p) => [`${v}% beaten · ${(p.payload as { n: number }).n} sailors`, "Club average"]}
                  />
                  <Line dataKey="avg" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 3.5, fill: "var(--series-1)", strokeWidth: 0 }} connectNulls isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </section>
          )}

          <h3 className="section-title">Team results</h3>
          <div className="list">
            {history.map((h) => (
              <details key={h.regatta.id} className={`card regatta tier-${fleetTier(h.regatta.fleet)}`}>
                <summary>
                  <div className="rg-main">
                    <div className="rg-name">
                      {h.regatta.name} <TierBadge fleet={h.regatta.fleet} />
                    </div>
                    <div className="muted small">
                      {fmtDate(h.regatta.date)} · {h.team.sailors.length} sailor{h.team.sailors.length === 1 ? "" : "s"} · best{" "}
                      {ordinal(h.team.best)} of {h.regatta.field.length}
                    </div>
                  </div>
                  <div className="rg-place">
                    <div className="big">
                      {h.team.teamRank ? ordinal(h.team.teamRank) : "–"}
                      <span className="muted small"> / {h.teamsRanked} teams</span>
                    </div>
                    <div className="muted small">{h.team.teamScore != null ? `team score ${h.team.teamScore}` : `needs ${TEAM_SIZE} sailors`}</div>
                  </div>
                </summary>
                <div className="club-detail">
                  <div className="sailor-chips">
                    {h.team.sailors.map((s) => (
                      <span key={s.id} className={`chip static${sailorKey(s.n) === meKey ? " on" : ""}`}>
                        {ordinal(s.p)} {s.n}
                      </span>
                    ))}
                  </div>
                  <ClubStandings field={h.regatta.field} highlight={selected.key} />
                </div>
              </details>
            ))}
          </div>

          <h3 className="section-title">Club sailors</h3>
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sailor</th>
                  <th className="num">Regattas</th>
                  <th className="num">Best</th>
                  <th className="num">Avg beaten</th>
                </tr>
              </thead>
              <tbody>
                {(allMembers ? members : members.slice(0, 25)).map((m) => (
                  <tr key={m.key} className={m.key === meKey ? "me" : ""}>
                    <td className="nowrap">{m.name}</td>
                    <td className="num">{m.regattas}</td>
                    <td className="num">
                      {ordinal(m.best)} <span className="muted tiny">of {m.bestOf}</span>
                    </td>
                    <td className="num">{m.avg != null ? `${Math.round(m.avg)}%` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {members.length > 25 && (
              <div className="table-tools">
                <span className="muted small">{members.length} sailors</span>
                <button className="link" onClick={() => setAllMembers(!allMembers)}>
                  {allMembers ? "Show fewer" : `Show all ${members.length}`}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Club team leaderboard for one regatta. */
function ClubStandings({ field, highlight }: { field: LoadedRegatta["field"]; highlight: string }) {
  const [all, setAll] = useState(false);
  const teams = clubTeams(field);
  const shown = all ? teams : teams.filter((t) => (t.teamRank ?? 99) <= 8 || t.key === highlight);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th className="num">Team</th>
            <th>Club</th>
            <th className="num">Sailors</th>
            <th className="num">Best {TEAM_SIZE}</th>
            <th className="num">Score</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((t) => (
            <tr key={t.key} className={t.key === highlight ? "me" : ""}>
              <td className="num">{t.teamRank ?? "–"}</td>
              <td className="clip">{t.club}</td>
              <td className="num">{t.sailors.length}</td>
              <td className="num nowrap">{t.sailors.slice(0, TEAM_SIZE).map((s) => s.p).join(" + ")}</td>
              <td className="num">
                <b>{t.teamScore ?? "–"}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {teams.length > shown.length || all ? (
        <button className="link small" onClick={() => setAll(!all)}>
          {all ? "Show fewer clubs" : `Show all ${teams.length} clubs`}
        </button>
      ) : null}
    </div>
  );
}
