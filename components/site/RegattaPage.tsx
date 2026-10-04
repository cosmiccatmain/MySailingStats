"use client";

import { CalendarDays, ChevronRight, ExternalLink, MapPin, School } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { clubTeams } from "@/lib/analysis";
import type { RegattaInfo } from "@/lib/clubspot";
import type { FieldRow } from "@/lib/field";
import { fleetTier, TIER_LABEL } from "@/lib/fleets";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" }) : "");

export function RegattaPage({ id }: { id: string }) {
  const [info, setInfo] = useState<RegattaInfo | null>(null);
  const [err, setErr] = useState("");
  const [cls, setCls] = useState<string | null>(null);
  const [field, setField] = useState<FieldRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [all, setAll] = useState(false);

  useEffect(() => {
    fetch(`/api/regatta-info/${id}`)
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error === "not found" ? "This regatta isn't on Clubspot." : b.error);
        return b as RegattaInfo;
      })
      .then((i) => {
        setInfo(i);
        // Default to the Championship-level fleet if there is one.
        const pick = i.classes.find((c) => fleetTier(c.name) === "champ") ?? i.classes[0];
        setCls(pick?.id ?? null);
      })
      .catch((e) => setErr((e as Error).message));
  }, [id]);

  useEffect(() => {
    if (!info || !cls) return;
    const c = info.classes.find((x) => x.id === cls)!;
    setLoading(true);
    setField(null);
    setAll(false);
    fetch(`/api/regatta/${id}?${new URLSearchParams({ class: cls, date: info.date ?? new Date().toISOString(), method: c.method ?? "" })}`)
      .then((r) => r.json())
      .then((b) => setField(b.field ?? []))
      .catch(() => setField([]))
      .finally(() => setLoading(false));
  }, [id, info, cls]);

  const teams = useMemo(() => (field ? clubTeams(field).filter((t) => t.teamRank != null).slice(0, 5) : []), [field]);

  if (err) return <div className="detail"><div className="sr-empty">{err}</div></div>;
  if (!info)
    return (
      <div className="detail">
        <div className="skel" style={{ height: 34, width: "60%" }} />
        <div className="skel" style={{ height: 18, width: "40%" }} />
        <div className="skel" style={{ height: 320 }} />
      </div>
    );
  const races = Math.max(0, ...(field ?? []).map((r) => r.r.length));
  const selected = info.classes.find((c) => c.id === cls);
  const rows = field ? (all ? field : field.slice(0, 50)) : [];
  return (
    <div className="detail fx-in">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Search</Link>
        <ChevronRight aria-hidden />
        {info.club ? <Link href={`/club/${info.club.id}`}>{info.club.name}</Link> : <span>Regatta</span>}
      </nav>
      <div className="detail-head row" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h1>{info.name}</h1>
          <div className="meta">
            <span>
              <CalendarDays aria-hidden />
              {fmt(info.date)}
            </span>
            {info.club && (
              <span>
                <School aria-hidden />
                <Link href={`/club/${info.club.id}`}>{info.club.name}</Link>
              </span>
            )}
            {info.club?.location && (
              <span>
                <MapPin aria-hidden />
                {info.club.location}
              </span>
            )}
          </div>
        </div>
        <a className="btn btn-secondary" href={`https://theclubspot.com/regatta/${id}/results`} target="_blank" rel="noreferrer">
          Official results <ExternalLink aria-hidden />
        </a>
      </div>

      {info.classes.length === 0 ? (
        <div className="sr-empty">No racing fleets published for this regatta yet.</div>
      ) : (
        <>
          <div className="sr-tabs" role="tablist" style={{ marginTop: 0 }}>
            {info.classes.map((c) => (
              <button key={c.id} role="tab" aria-selected={c.id === cls} onClick={() => setCls(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
          {selected && field && field.length > 0 && (
            <div className="kpis fx-stagger">
              <div className="card kpi">
                <div className="k">Fleet</div>
                <div className="v" style={{ fontSize: 20 }}>{TIER_LABEL[fleetTier(selected.name)]}</div>
                <div className="s">{selected.name}</div>
              </div>
              <div className="card kpi">
                <div className="k">Boats</div>
                <div className="v">{field.length}</div>
                <div className="s">{new Set(field.map((r) => r.c).filter(Boolean)).size} clubs</div>
              </div>
              <div className="card kpi">
                <div className="k">Races</div>
                <div className="v">{races}</div>
                <div className="s">{field.some((r) => r.f) ? "with finals fleets" : "single fleet"}</div>
              </div>
              <div className="card kpi">
                <div className="k">Winner</div>
                <div className="v" style={{ fontSize: 18, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{field[0].n}</div>
                <div className="s">{field[0].net != null ? `${field[0].net} pts · ${field[0].c}` : field[0].c}</div>
              </div>
            </div>
          )}
          {loading && <div className="skel" style={{ height: 360 }} />}
          {field && field.length === 0 && !loading && (
            <div className="sr-empty">
              No scores published for this fleet{selected?.method === "pdf" || selected?.method === "external_link" ? " on Clubspot (results are posted elsewhere)" : " yet"}.
            </div>
          )}
          {field && field.length > 0 && (
            <div className="stack">
              <div className="card pad-0 table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th className="num">#</th>
                      <th>Sailor</th>
                      <th>Club</th>
                      {Array.from({ length: races }, (_, i) => (
                        <th key={i} className="num">
                          R{i + 1}
                        </th>
                      ))}
                      <th className="num">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="num">
                          <b>{r.p}</b>
                          {r.f && <span className="faint tiny"> {r.f[0]}</span>}
                        </td>
                        <td className="nowrap">
                          <Link href={`/dashboard?${new URLSearchParams({ name: r.n })}`}>{r.n}</Link>
                          {r.s && <span className="faint small"> #{r.s}</span>}
                        </td>
                        <td className="clip muted">{r.c}</td>
                        {Array.from({ length: races }, (_, i) => {
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
                    ))}
                  </tbody>
                </table>
                {field.length > 50 && (
                  <button className="sr-more" onClick={() => setAll(!all)}>
                    {all ? "Show top 50" : `Show all ${field.length} boats`}
                  </button>
                )}
                {field.some((r) => r.f) && <p className="faint small">G/S/B/E = Gold/Silver/Bronze/Emerald finals fleet.</p>}
              </div>
              <div className="card">
                <div className="card-head">
                  <div>
                    <h3>Club team results</h3>
                    <p>Sum of each club&rsquo;s best three finishers</p>
                  </div>
                </div>
                {teams.length === 0 ? (
                  <p className="small muted">No club has three or more boats in this fleet.</p>
                ) : (
                  <div className="mini-list">
                    {teams.map((t) => (
                      <div key={t.key}>
                        <span className="date-tile"><b>{t.teamRank}</b></span>
                        <span className="main">
                          <span className="t" style={{ display: "block" }}>{t.club}</span>
                          <span className="d" style={{ display: "block" }}>
                            {t.sailors.slice(0, 3).map((s) => s.p).join(" + ")} · {t.sailors.length} boats
                          </span>
                        </span>
                        <span className="side">{t.teamScore}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
