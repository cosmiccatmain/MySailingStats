"use client";

import { ArrowLeft, ExternalLink, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProspectChart } from "@/components/Charts";
import type { ProspectDetail } from "@/lib/recruit";
import { collegeClass, districtLabel } from "@/lib/recruit-shared";
import { STAGES, addToBoard, removeFromBoard, updateBoard, useRecruit, type Stage } from "@/lib/recruit-store";
import { hasFeature } from "@/lib/plans";
import { useWallet } from "@/lib/wallet";
import { ordinal } from "@/lib/format";

const LEVEL_LABEL = { national: "National", championship: "Championship", invitational: "Invitational" } as const;
const seasonName = (s: string) => (s ? `${s[0] === "f" ? "Fall" : "Spring"} 20${s.slice(1)}` : "Other");
const pct = (place: number, of: number) => (of > 1 ? Math.round((1 - (place - 1) / (of - 1)) * 100) : 100);

export function ProspectPage({ slug }: { slug: string }) {
  const w = useWallet();
  const { program, board } = useRecruit();
  const [d, setD] = useState<ProspectDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const item = board[slug];
  const [note, setNote] = useState(item?.note ?? "");
  useEffect(() => setNote(item?.note ?? ""), [item?.note]);

  useEffect(() => {
    fetch(`/api/recruit/sailor/${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setErr(j.error) : setD(j)))
      .catch(() => setErr("Couldn't reach Techscore."));
  }, [slug]);

  const seasons = useMemo(() => {
    const m = new Map<string, ProspectDetail["history"]>();
    for (const h of d?.history ?? []) m.set(h.season, [...(m.get(h.season) ?? []), h]);
    return [...m.entries()];
  }, [d]);

  if (!hasFeature(w.plan, "recruiter"))
    return (
      <div className="rc">
        <div className="rc-empty" style={{ marginTop: 48 }}>
          <p>Prospect profiles are part of the Recruiter plan.</p>
          <Link className="btn btn-primary btn-sm" href="/recruit">
            See Recruiter
          </Link>
        </div>
      </div>
    );
  if (err) return <div className="rc"><p className="rc-empty" style={{ marginTop: 48 }}>{err}</p></div>;
  if (!d)
    return (
      <div className="rc" role="status">
        <div className="skel" style={{ height: 90, marginTop: 34 }} />
        <div className="skel" style={{ height: 110 }} />
        <div className="skel" style={{ height: 280 }} />
      </div>
    );

  const counted = d.history.filter((h) => h.place != null && h.of != null && h.of >= 4);
  const skips = d.history.filter((h) => /skipper/i.test(h.role)).length;
  const nat = counted.filter((h) => h.level === "national");
  const bestNat = [...nat].sort((a, b) => pct(b.place!, b.of!) - pct(a.place!, a.of!))[0];
  const wins = counted.filter((h) => h.place === 1).length;
  const near = !!program?.district && d.district === program.district;
  const target = !!program && d.year != null && program.classes.includes(d.year);
  const toggle = () =>
    item ? removeFromBoard(slug) : addToBoard({ slug, name: d.name, school: d.school, year: d.year, district: d.district, score: d.score });

  return (
    <div className="rc">
      <Link href="/recruit" className="rc-back">
        <ArrowLeft aria-hidden /> All prospects
      </Link>
      <header className="dash-head" style={{ paddingTop: 8 }}>
        <div className="dash-id">
          <span className="avatar" aria-hidden>
            {d.name
              .split(/\s+/)
              .map((x) => x[0])
              .slice(0, 2)
              .join("")}
          </span>
          <div>
            <h1>{d.name}</h1>
            <div className="sub">
              {d.year && <span>Class of {d.year}</span>}
              {d.school && <span>{d.school}</span>}
              {d.district && <span>{districtLabel(d.district)}</span>}
              {d.history.length > 0 && <span>Skipper in {Math.round((skips / d.history.length) * 100)}% of regattas</span>}
            </div>
          </div>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button type="button" className={`btn btn-sm ${item ? "btn-secondary" : "btn-primary"}`} onClick={toggle}>
            <Star aria-hidden /> {item ? "On your board" : "Add to board"}
          </button>
          <a className="btn btn-ghost btn-sm" href={`https://scores.hssailing.org/sailors/${slug}/`} target="_blank" rel="noreferrer">
            Techscore <ExternalLink aria-hidden />
          </a>
          <Link className="btn btn-ghost btn-sm" href={`/dashboard?${new URLSearchParams({ name: d.name })}`}>
            Youth racing on Clubspot
          </Link>
        </div>
      </header>

      {(near || target || nat.length > 0) && (
        <div className="row rc-fit" style={{ flexWrap: "wrap" }}>
          {target && <span className="chip on">Class of {d.year}: on your list · college class of {collegeClass(d.year!)}</span>}
          {near && <span className="chip">Near you: {d.district}</span>}
          {nat.length > 0 && <span className="chip">{nat.length} national event{nat.length === 1 ? "" : "s"}</span>}
          {wins > 0 && <span className="chip">{wins} division win{wins === 1 ? "" : "s"}</span>}
        </div>
      )}

      <section className="kpis">
        <div className="card kpi">
          <div className="k">Recruit score</div>
          <div className="v">{d.score.toFixed(1)}</div>
          <div className="s">
            {d.trend != null ? `${d.trend >= 0 ? "+" : ""}${d.trend} vs the year before` : "Level-weighted finish percentile"}
          </div>
        </div>
        <div className="card kpi">
          <div className="k">Regattas</div>
          <div className="v">{d.regattaCount}</div>
          <div className="s">{counted.length} scored with 4+ teams</div>
        </div>
        <div className="card kpi">
          <div className="k">Average finish</div>
          <div className="v">
            {counted.length ? Math.round(counted.reduce((s, h) => s + pct(h.place!, h.of!), 0) / counted.length) : "—"}
            <small>%</small>
          </div>
          <div className="s">Share of the fleet finished ahead of</div>
        </div>
        <div className="card kpi">
          <div className="k">Best national finish</div>
          <div className="v">
            {bestNat ? ordinal(bestNat.place!) : "—"}
            {bestNat && <small> / {bestNat.of}</small>}
          </div>
          <div className="s">{bestNat ? bestNat.regatta : "No national events yet"}</div>
        </div>
      </section>

      <ProspectChart rows={d.history} />

      {item && (
        <section className="card rc-note">
          <div className="card-head">
            <h3>Your notes</h3>
            <select className="compact" value={item.stage} onChange={(e) => updateBoard(slug, { stage: e.target.value as Stage })} aria-label="Stage">
              {STAGES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <textarea value={note} rows={3} placeholder="Contact, visit dates, academics…" onChange={(e) => setNote(e.target.value)} onBlur={() => note !== item.note && updateBoard(slug, { note })} />
        </section>
      )}

      <section className="card pad-0">
        <div className="card-head" style={{ padding: "20px 22px 0" }}>
          <div>
            <h3>Every regatta</h3>
            <p>From the sailor&rsquo;s Techscore record. Division places for fleet racing, team places for team racing.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Regatta</th>
                <th className="hide-sm">Level</th>
                <th>Role</th>
                <th className="num">Place</th>
                <th className="hide-sm">Fleet beaten</th>
              </tr>
            </thead>
            {seasons.map(([season, rows]) => (
              <tbody key={season}>
                <tr className="rc-season">
                  <th colSpan={6}>{seasonName(season)}</th>
                </tr>
                {rows.map((h, i) => (
                  <tr key={`${h.regattaSlug}-${i}`}>
                    <td className="muted">{h.date ? new Date(h.date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : ""}</td>
                    <td>
                      <a href={`https://scores.hssailing.org/${h.season}/${h.regattaSlug}/`} target="_blank" rel="noreferrer">
                        {h.regatta}
                      </a>
                      <small className="muted"> · {h.host}</small>
                    </td>
                    <td className="hide-sm">
                      <span className={`badge plain lvl-${h.level}`}>{LEVEL_LABEL[h.level]}</span>
                    </td>
                    <td>{h.role}</td>
                    <td className="num">
                      {h.place != null ? (
                        <>
                          <b>{ordinal(h.place)}</b>
                          <span className="muted">/{h.of}</span>
                          {h.div && <small className="muted"> {h.div}</small>}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="hide-sm">
                      {h.place != null && h.of != null && h.of > 1 ? (
                        <span className="meter rc-meter" title={`${pct(h.place, h.of)}%`}>
                          <span style={{ width: `${Math.max(3, pct(h.place, h.of))}%` }} />
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>
    </div>
  );
}
