"use client";

import { ArrowRight, ChevronRight, ExternalLink, Globe, MapPin } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ClubInfo } from "@/lib/clubspot";

type Reg = ClubInfo["regattas"][number];

function Row({ r }: { r: Reg }) {
  const d = r.date ? new Date(r.date) : null;
  return (
    <Link className="sr-item" href={`/regatta/${r.id}`}>
      <span className="sr-ico date" aria-hidden>
        {d ? (
          <>
            <small>{d.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</small>
            <b>{d.getDate()}</b>
          </>
        ) : (
          "–"
        )}
      </span>
      <span className="sr-main">
        <span className="sr-title">
          <span>{r.name}</span>
        </span>
        <span className="sr-sub">{d?.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" })}</span>
      </span>
      <span className="sr-side">
        <ArrowRight aria-hidden />
      </span>
    </Link>
  );
}

export function ClubPage({ id }: { id: string }) {
  const [info, setInfo] = useState<ClubInfo | null>(null);
  const [err, setErr] = useState("");
  const [allPast, setAllPast] = useState(false);
  useEffect(() => {
    fetch(`/api/club/${id}`)
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error === "not found" ? "This club isn't on Clubspot." : b.error);
        return b as ClubInfo;
      })
      .then(setInfo)
      .catch((e) => setErr((e as Error).message));
  }, [id]);
  if (err) return <div className="detail"><div className="sr-empty">{err}</div></div>;
  if (!info)
    return (
      <div className="detail">
        <div className="skel" style={{ height: 34, width: "50%" }} />
        <div className="skel" style={{ height: 240 }} />
      </div>
    );
  const now = new Date().toISOString();
  const upcoming = info.regattas.filter((r) => (r.date ?? "") >= now).reverse();
  const past = info.regattas.filter((r) => (r.date ?? "") < now);
  const years = past.map((r) => (r.date ? new Date(r.date).getFullYear() : null)).filter((y): y is number => y != null);
  return (
    <div className="detail fx-in">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Search</Link>
        <ChevronRight aria-hidden />
        <span>Club</span>
      </nav>
      <div className="detail-head row" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1>{info.name}</h1>
          <div className="meta">
            {info.location && (
              <span>
                <MapPin aria-hidden />
                {info.location}
              </span>
            )}
            {info.website && (
              <span>
                <Globe aria-hidden />
                {info.website.replace(/^https?:\/\//, "")}
              </span>
            )}
          </div>
        </div>
        {info.website && (
          <a className="btn btn-secondary" href={info.website} target="_blank" rel="noreferrer">
            Club website <ExternalLink aria-hidden />
          </a>
        )}
      </div>
      <div className="kpis fx-stagger">
        <div className="card kpi">
          <div className="k">Regattas on Clubspot</div>
          <div className="v">{info.regattas.length}{info.regattas.length >= 100 ? "+" : ""}</div>
        </div>
        <div className="card kpi">
          <div className="k">Upcoming</div>
          <div className="v">{upcoming.length}</div>
        </div>
        <div className="card kpi">
          <div className="k">Seasons</div>
          <div className="v">{new Set(years).size}</div>
          <div className="s">{years.length ? `${Math.min(...years)}–${Math.max(...years)}` : ""}</div>
        </div>
        <div className="card kpi">
          <div className="k">Last regatta</div>
          <div className="v" style={{ fontSize: 17, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{past[0]?.name ?? "–"}</div>
          <div className="s">{past[0]?.date ? new Date(past[0].date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}</div>
        </div>
      </div>
      {upcoming.length > 0 && (
        <section>
          <h2 className="section-title" style={{ marginBottom: 10 }}>Upcoming</h2>
          <div className="sr-list">
            {upcoming.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </div>
        </section>
      )}
      <section>
        <h2 className="section-title" style={{ marginBottom: 10 }}>Past regattas</h2>
        {past.length === 0 ? (
          <div className="sr-empty">No past regattas on Clubspot.</div>
        ) : (
          <div className="sr-list">
            {(allPast ? past : past.slice(0, 12)).map((r) => (
              <Row key={r.id} r={r} />
            ))}
            {past.length > 12 && (
              <button className="sr-more" onClick={() => setAllPast(!allPast)}>
                {allPast ? "Show fewer" : `Show all ${past.length}`}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
