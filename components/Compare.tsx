"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MultiRatingChart, multiStyle, RatingChart } from "./Charts";
import { Locked, OutOfCredits } from "./site/Gate";
import { Leaderboard, TierBadge } from "./Regattas";
import { headToHead, rivals, type LoadedRegatta } from "@/lib/analysis";
import { fleetTier } from "@/lib/fleets";
import { fmtDate, ordinal } from "@/lib/format";
import { loadCached, scanSailor, type Progress } from "@/lib/loader";
import { hasFeature, PLANS, type PlanId } from "@/lib/plans";
import { computeRatings, sailorKey, type RatingPoint } from "@/lib/rating";
import { markPaid, paidFor, spend } from "@/lib/wallet";
import { percentile } from "@/lib/standings";
import { toLoaded } from "@/lib/stats";

type Other = { name: string; regattas: LoadedRegatta[]; count: number; avgPct: number | null; best: number | null };

function summarize(name: string, loaded: LoadedRegatta[], results: { me: { place: number }; entrants: number }[]): Other {
  const pcts = results.map((r) => percentile(r.me.place, r.entrants)).filter((x): x is number => x != null);
  return {
    name,
    regattas: loaded,
    count: results.length,
    avgPct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
    best: results.length ? Math.min(...results.map((r) => r.me.place)) : null,
  };
}

export function Compare(props: { meName: string; mine: LoadedRegatta[]; plan: PlanId }) {
  const meKey = sailorKey(props.meName);
  const limit = Math.max(1, PLANS[props.plan].compareLimit - 1); // others, not counting you
  const radar = hasFeature(props.plan, "rivalRadar");
  const rivalList = useMemo(() => rivals(props.mine, meKey), [props.mine, meKey]);
  const [query, setQuery] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [data, setData] = useState<Record<string, Other>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<{ name: string; progress: Progress | null } | null>(null);
  const [broke, setBroke] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [allRivals, setAllRivals] = useState(false);
  const busy = useRef(false);

  const pick = (name: string) => {
    const n = name.trim();
    const k = sailorKey(n);
    if (n.split(/\s+/).length < 2 || k === meKey) return;
    setQuery("");
    setFocus(k);
    if (names.some((x) => sailorKey(x) === k)) return;
    setNames((cur) => (cur.length >= limit ? [...cur.slice(1), n] : [...cur, n]));
  };
  const remove = (n: string) => {
    const k = sailorKey(n);
    setNames((cur) => cur.filter((x) => sailorKey(x) !== k));
    if (focus === k) setFocus(null);
  };

  // Load each added sailor's full Clubspot history, one at a time (cached per browser).
  useEffect(() => {
    if (busy.current) return;
    const next = names.find((n) => !data[sailorKey(n)] && !failed[sailorKey(n)]);
    if (!next) return;
    const k = sailorKey(next);
    const cached = loadCached(next);
    const charge = () => {
      if (paidFor(`sailor:${k}`)) return true;
      if (!spend()) return false;
      markPaid(`sailor:${k}`);
      return true;
    };
    if (!charge()) {
      setBroke(true);
      setNames((cur) => cur.filter((x) => sailorKey(x) !== k));
      return;
    }
    setBroke(false);
    if (cached.store.scannedAt) {
      setData((d) => ({ ...d, [k]: summarize(next, toLoaded(cached.store.results, cached.fields, next), cached.store.results) }));
      return;
    }
    busy.current = true;
    setLoading({ name: next, progress: null });
    scanSailor(next, { full: true, onUpdate: (_s, _f, p) => setLoading({ name: next, progress: p }) })
      .then(({ store, fields }) => setData((d) => ({ ...d, [k]: summarize(next, toLoaded(store.results, fields, next), store.results) })))
      .catch((e) => setFailed((f) => ({ ...f, [k]: (e as Error).message })))
      .finally(() => {
        busy.current = false;
        setLoading(null);
      });
  }, [names, data, failed]);

  const others = names.map((n) => ({ name: n, key: sailorKey(n), data: data[sailorKey(n)] }));
  // Union of everyone's regattas (the same regatta appears once).
  const union = useMemo(() => {
    const m = new Map(props.mine.map((r) => [r.id, r]));
    for (const o of Object.values(data)) for (const r of o.regattas) if (!m.has(r.id)) m.set(r.id, r);
    return [...m.values()];
  }, [props.mine, data]);
  const keys = useMemo(() => [meKey, ...names.map(sailorKey)], [meKey, names]);
  const ratings = useMemo(() => {
    if (keys.length < 2) return null;
    const tracked = union.filter((r) => r.field.length);
    return computeRatings(
      tracked.map((r) => ({ id: r.id, date: r.date, tier: fleetTier(r.fleet), field: r.field })),
      keys,
    );
  }, [union, keys]);
  const hist = (k: string) => ratings?.history.get(k) ?? [];
  const last = (h: RatingPoint[]) => (h.length ? Math.round(h[h.length - 1].after) : null);
  const bestPerf = (h: RatingPoint[]) => (h.length ? Math.round(Math.max(...h.map((x) => x.performance))) : null);
  const myPcts = props.mine
    .map((r) => {
      const row = r.field.find((x) => sailorKey(x.n) === meKey);
      return row ? percentile(row.p, r.field.length) : null;
    })
    .filter((x): x is number => x != null);
  const myAvg = myPcts.length ? Math.round(myPcts.reduce((x, y) => x + y, 0) / myPcts.length) : null;

  const focused = others.find((o) => o.key === focus) ?? null;
  const h2hAll = useMemo(() => new Map(names.map((n) => [sailorKey(n), headToHead(union, meKey, sailorKey(n))])), [names, union, meKey]);
  const h2h = focused ? h2hAll.get(focused.key) ?? null : null;
  const myHist = hist(meKey);
  const theirHist = focused ? hist(focused.key) : [];

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
          Multi Compare · {names.length}/{limit} sailor{limit === 1 ? "" : "s"}
          <input list="rival-names" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Add a sailor — First Last" />
        </label>
        <datalist id="rival-names">
          {rivalList.map((r) => (
            <option key={r.key} value={r.name} />
          ))}
        </datalist>
        <button className="primary" type="submit" disabled={query.trim().split(/\s+/).length < 2}>
          Add
        </button>
        {names.length > 0 && (
          <button type="button" onClick={() => (setNames([]), setFocus(null))}>
            Clear all
          </button>
        )}
      </form>
      {names.length >= limit && (
        <p className="muted small" style={{ margin: "-6px 0 0" }}>
          Your plan compares up to {limit} sailor{limit === 1 ? "" : "s"} at once — adding another replaces the oldest.{" "}
          <Link href="/pricing">Compare more</Link>
        </p>
      )}
      {broke && <OutOfCredits what="Loading another sailor" />}
      {loading && (
        <div className="card progress" role="status">
          Loading {loading.name}&rsquo;s regattas…{" "}
          {loading.progress?.total ? `${loading.progress.done}/${loading.progress.total}` : ""}
          <div className="bar">
            <span style={{ width: `${loading.progress?.total ? (loading.progress.done / loading.progress.total) * 100 : 4}%` }} />
          </div>
        </div>
      )}
      {Object.entries(failed)
        .filter(([k]) => names.some((n) => sailorKey(n) === k))
        .map(([k, m]) => (
          <div key={k} className="card warn">
            Couldn&rsquo;t load {names.find((n) => sailorKey(n) === k)}: {m}
          </div>
        ))}

      {names.length > 0 && (
        <>
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sailor</th>
                  <th className="num">Rating</th>
                  <th className="num">Best perf.</th>
                  <th className="num">Regattas</th>
                  <th className="num">Avg beaten</th>
                  <th className="num" title="Regattas where each finished ahead of the other">vs you</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <tr className="me-row">
                  <td className="nowrap">
                    <span className="swatch" style={{ background: multiStyle(0).stroke }} /> {props.meName} <span className="muted small">(you)</span>
                  </td>
                  <td className="num">{last(myHist) ?? "–"}</td>
                  <td className="num">{bestPerf(myHist) ?? "–"}</td>
                  <td className="num">{props.mine.length}</td>
                  <td className="num">{myAvg != null ? `${myAvg}%` : "–"}</td>
                  <td className="num muted">—</td>
                  <td />
                </tr>
                {others.map((o, i) => {
                  const h = hist(o.key);
                  const hh = h2hAll.get(o.key);
                  return (
                    <tr key={o.key} className={focus === o.key ? "focus-row" : ""}>
                      <td className="nowrap">
                        <span className="swatch" style={{ background: multiStyle(i + 1).stroke }} /> {o.name}
                      </td>
                      <td className="num">{o.data ? last(h) ?? "–" : "…"}</td>
                      <td className="num">{o.data ? bestPerf(h) ?? "–" : "…"}</td>
                      <td className="num">{o.data ? o.data.regattas.length : "…"}</td>
                      <td className="num">{o.data?.avgPct != null ? `${Math.round(o.data.avgPct)}%` : o.data ? "–" : "…"}</td>
                      <td className="num">{hh && hh.regattas.length ? `${hh.regattasA}–${hh.regattasB}` : "–"}</td>
                      <td className="nowrap">
                        <button className="link" onClick={() => setFocus(focus === o.key ? null : o.key)}>
                          {focus === o.key ? "Hide" : "Head-to-head"}
                        </button>{" "}
                        <button className="link" aria-label={`Remove ${o.name}`} onClick={() => remove(o.name)}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {ratings && (
            <div className="chart-grid">
              <MultiRatingChart series={[{ name: props.meName, history: myHist }, ...others.filter((o) => o.data).map((o) => ({ name: o.name, history: hist(o.key) }))]} />
            </div>
          )}
        </>
      )}

      {focused && (
        <>
          <div className="versus card">
            <div className="vs-col">
              <div className="vs-name you">{props.meName}</div>
            </div>
            <div className="vs-mid muted small">vs</div>
            <div className="vs-col right">
              <div className="vs-name them">{focused.name}</div>
            </div>
            <VsRow label="Head-to-head regattas" a={h2h?.regattasA} b={h2h?.regattasB} better="high" />
            <VsRow label="Head-to-head races (same start)" a={h2h?.racesA} b={h2h?.racesB} better="high" />
            <VsRow label="Current rating" a={last(myHist)} b={last(theirHist)} better="high" />
            <VsRow label="Best performance rating" a={bestPerf(myHist)} b={bestPerf(theirHist)} better="high" />
            <VsRow label="Optimist regattas" a={props.mine.length} b={focused.data?.regattas.length} />
            <VsRow
              label="Average fleet beaten"
              a={myAvg}
              b={focused.data?.avgPct != null ? Math.round(focused.data.avgPct) : null}
              unit="%"
              better="high"
            />
          </div>

          {(myHist.length > 0 || theirHist.length > 0) && (
            <div className="chart-grid">
              <RatingChart history={myHist} other={{ name: focused.name, history: theirHist }} meName={props.meName} />
            </div>
          )}

          <h3 className="section-title">
            Regattas together {h2h ? `(${h2h.regattas.length})` : ""}
          </h3>
          {h2h && h2h.regattas.length === 0 && (
            <p className="muted">
              No shared regattas found{focused.data ? "" : " yet"}. Comparing ratings still works — they&rsquo;re measured on the same scale.
            </p>
          )}
          <div className="list">
            {h2h?.regattas.map((g) => (
              <details key={g.id} className={`card regatta tier-${fleetTier(g.fleet)}`}>
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

      <h3 className="section-title">Rival Radar</h3>
      <p className="muted small">Sailors you&rsquo;ve raced most often (2+ regattas), and your record against each.</p>
      {!radar ? (
        <Locked feature="rivalRadar" text="Your head-to-head record against every sailor you've raced, ranked — and one click to compare." />
      ) : rivalList.length === 0 ? (
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
