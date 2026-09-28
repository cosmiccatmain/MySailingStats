"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RatingChart } from "./Charts";
import { Leaderboard, TierBadge } from "./Regattas";
import { headToHead, rivals, type LoadedRegatta } from "@/lib/analysis";
import { fleetTier } from "@/lib/fleets";
import { fmtDate, ordinal } from "@/lib/format";
import { loadCached, scanSailor, type Progress } from "@/lib/loader";
import { computeRatings, sailorKey } from "@/lib/rating";
import { percentile } from "@/lib/standings";
import { toLoaded } from "@/lib/stats";

type Other = { name: string; regattas: LoadedRegatta[]; count: number; avgPct: number | null; best: number | null };

export function Compare(props: { meName: string; mine: LoadedRegatta[] }) {
  const meKey = sailorKey(props.meName);
  const rivalList = useMemo(() => rivals(props.mine, meKey), [props.mine, meKey]);
  const [query, setQuery] = useState("");
  const [otherName, setOtherName] = useState<string | null>(null);
  const [other, setOther] = useState<Other | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allRivals, setAllRivals] = useState(false);
  const loadId = useRef(0);

  const pick = (name: string) => {
    const n = name.trim();
    if (n.split(/\s+/).length < 2 || sailorKey(n) === meKey) return;
    setQuery(n);
    setOtherName(n);
  };

  // Load the other sailor's full Clubspot history (cached per browser).
  useEffect(() => {
    if (!otherName) return;
    const id = ++loadId.current;
    setError(null);
    setOther(null);
    const summarize = (loaded: LoadedRegatta[], results: { me: { place: number }; entrants: number }[]): Other => {
      const pcts = results.map((r) => percentile(r.me.place, r.entrants)).filter((x): x is number => x != null);
      return {
        name: otherName,
        regattas: loaded,
        count: results.length,
        avgPct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
        best: results.length ? Math.min(...results.map((r) => r.me.place)) : null,
      };
    };
    const cached = loadCached(otherName);
    if (cached.store.scannedAt) {
      setOther(summarize(toLoaded(cached.store.results, cached.fields, otherName), cached.store.results));
      return;
    }
    scanSailor(otherName, {
      full: true,
      isCancelled: () => id !== loadId.current,
      onUpdate: (_s, _f, p) => id === loadId.current && setProgress(p),
    })
      .then(({ store, fields }) => {
        if (id !== loadId.current) return;
        setOther(summarize(toLoaded(store.results, fields, otherName), store.results));
      })
      .catch((e) => id === loadId.current && setError((e as Error).message))
      .finally(() => id === loadId.current && setProgress(null));
  }, [otherName]);

  const otherKey = otherName ? sailorKey(otherName) : null;
  // Union of both sailors' regattas (the same regatta appears once).
  const union = useMemo(() => {
    const m = new Map(props.mine.map((r) => [r.id, r]));
    for (const r of other?.regattas ?? []) if (!m.has(r.id)) m.set(r.id, r);
    return [...m.values()];
  }, [props.mine, other]);
  const h2h = useMemo(() => (otherKey ? headToHead(union, meKey, otherKey) : null), [union, meKey, otherKey]);
  const ratings = useMemo(() => {
    if (!otherKey) return null;
    const tracked = union.filter((r) => r.field.length);
    return computeRatings(
      tracked.map((r) => ({ id: r.id, date: r.date, tier: fleetTier(r.fleet), field: r.field })),
      [meKey, otherKey],
    );
  }, [union, meKey, otherKey]);
  const myHist = ratings?.history.get(meKey) ?? [];
  const theirHist = ratings?.history.get(otherKey ?? "") ?? [];
  const last = (h: typeof myHist) => (h.length ? Math.round(h[h.length - 1].after) : null);
  const bestPerf = (h: typeof myHist) => (h.length ? Math.round(Math.max(...h.map((x) => x.performance))) : null);
  const myPcts = props.mine
    .map((r) => {
      const row = r.field.find((x) => sailorKey(x.n) === meKey);
      return row ? percentile(row.p, r.field.length) : null;
    })
    .filter((x): x is number => x != null);

  return (
    <div className="stack">
      <form
        className="card compare-search"
        onSubmit={(e) => {
          e.preventDefault();
          pick(query);
        }}
      >
        <label>
          Compare with any sailor
          <input list="rival-names" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="First Last" />
        </label>
        <datalist id="rival-names">
          {rivalList.map((r) => (
            <option key={r.key} value={r.name} />
          ))}
        </datalist>
        <button className="primary" type="submit" disabled={query.trim().split(/\s+/).length < 2}>
          Compare
        </button>
        {otherName && (
          <button type="button" onClick={() => (setOtherName(null), setOther(null), setQuery(""))}>
            Clear
          </button>
        )}
      </form>

      {otherName && (
        <>
          {progress && (
            <div className="card progress" role="status">
              Loading {otherName}&rsquo;s regattas… {progress.done}/{progress.total}
              <div className="bar">
                <span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
              </div>
            </div>
          )}
          {error && <div className="card warn">Couldn&rsquo;t load {otherName}: {error}</div>}

          <div className="versus card">
            <div className="vs-col">
              <div className="vs-name you">{props.meName}</div>
            </div>
            <div className="vs-mid muted small">vs</div>
            <div className="vs-col right">
              <div className="vs-name them">{otherName}</div>
            </div>
            <VsRow label="Head-to-head regattas" a={h2h?.regattasA} b={h2h?.regattasB} better="high" />
            <VsRow label="Head-to-head races (same start)" a={h2h?.racesA} b={h2h?.racesB} better="high" />
            <VsRow label="Current rating" a={last(myHist)} b={last(theirHist)} better="high" />
            <VsRow label="Best performance rating" a={bestPerf(myHist)} b={bestPerf(theirHist)} better="high" />
            <VsRow label="Regattas on Clubspot" a={props.mine.length} b={other?.count} />
            <VsRow
              label="Average fleet beaten"
              a={myPcts.length ? Math.round(myPcts.reduce((x, y) => x + y, 0) / myPcts.length) : null}
              b={other?.avgPct != null ? Math.round(other.avgPct) : null}
              unit="%"
              better="high"
            />
          </div>

          {(myHist.length > 0 || theirHist.length > 0) && (
            <div className="chart-grid">
              <RatingChart history={myHist} other={{ name: otherName, history: theirHist }} meName={props.meName} />
            </div>
          )}

          <h3 className="section-title">
            Regattas together {h2h ? `(${h2h.regattas.length})` : ""}
          </h3>
          {h2h && h2h.regattas.length === 0 && (
            <p className="muted">
              No shared regattas found{other ? "" : " yet"}. Comparing ratings still works — they&rsquo;re measured on the same scale.
            </p>
          )}
          <div className="list">
            {h2h?.regattas.map((g) => (
              <details key={g.id} className="card regatta">
                <summary>
                  <div className="rg-main">
                    <div className="rg-name">
                      {g.name} <TierBadge fleet={g.fleet} />
                    </div>
                    <div className="muted small">
                      {fmtDate(g.date)} · {g.fleet} · races {g.racesA}–{g.racesB}
                    </div>
                  </div>
                  <div className="rg-place h2h">
                    <span className={g.a.p < g.b.p ? "win" : ""}>{ordinal(g.a.p)}</span>
                    <span className="muted small"> vs </span>
                    <span className={g.b.p < g.a.p ? "win" : ""}>{ordinal(g.b.p)}</span>
                    <div className="muted small">of {g.entrants}</div>
                  </div>
                </summary>
                <Leaderboard field={union.find((r) => r.id === g.id)!.field} meId={g.a.id} myClub="" highlightKey={(row) => row.id === g.b.id} />
              </details>
            ))}
          </div>
        </>
      )}

      <h3 className="section-title">Your rivals</h3>
      <p className="muted small">Sailors you&rsquo;ve raced most often (2+ regattas), and your record against each.</p>
      {rivalList.length === 0 ? (
        <p className="muted">Race a few more regattas to see rivals here.</p>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sailor</th>
                <th>Club</th>
                <th className="num">Regattas</th>
                <th className="num">You ahead</th>
                <th className="num">Them ahead</th>
                <th className="num">Avg gap</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(allRivals ? rivalList : rivalList.slice(0, 15)).map((r) => (
                <tr key={r.key}>
                  <td className="nowrap">{r.name}</td>
                  <td className="clip">{r.club}</td>
                  <td className="num">{r.shared}</td>
                  <td className="num">{r.ahead}</td>
                  <td className="num">{r.behind}</td>
                  <td className="num" title="Average gap in finishing position, as a share of the fleet">
                    {Math.round(r.avgGap * 100) > 0 ? "+" : Math.round(r.avgGap * 100) < 0 ? "−" : ""}
                    {Math.abs(Math.round(r.avgGap * 100))}%
                  </td>
                  <td>
                    <button className="link" onClick={() => pick(r.name)}>
                      Compare
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rivalList.length > 15 && (
            <div className="table-tools">
              <span className="muted small">+ gap = you usually finish ahead</span>
              <button className="link" onClick={() => setAllRivals(!allRivals)}>
                {allRivals ? "Show fewer" : `Show all ${rivalList.length}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VsRow(props: { label: string; a?: number | null; b?: number | null; unit?: string; better?: "high" | "low" }) {
  const { a, b } = props;
  const aWins = props.better && a != null && b != null && (props.better === "high" ? a > b : a < b);
  const bWins = props.better && a != null && b != null && (props.better === "high" ? b > a : b < a);
  const show = (v?: number | null) => (v == null ? "–" : `${v}${props.unit ?? ""}`);
  return (
    <>
      <div className={`vs-val${aWins ? " win" : ""}`}>{show(a)}</div>
      <div className="vs-label muted small">{props.label}</div>
      <div className={`vs-val right${bWins ? " win" : ""}`}>{show(b)}</div>
    </>
  );
}
