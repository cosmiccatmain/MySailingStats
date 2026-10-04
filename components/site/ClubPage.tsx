"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ClubInfo } from "@/lib/clubspot";

export function ClubPage({ id }: { id: string }) {
  const [info, setInfo] = useState<ClubInfo | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch(`/api/club/${id}`)
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        return b as ClubInfo;
      })
      .then(setInfo)
      .catch((e) => setErr((e as Error).message));
  }, [id]);
  if (err) return <div className="r-empty">{err}</div>;
  if (!info) return <div className="r-list" style={{ marginTop: 24 }}>{[0, 1, 2].map((i) => <div key={i} className="r-skel" />)}</div>;
  const now = new Date().toISOString();
  const upcoming = info.regattas.filter((r) => (r.date ?? "") >= now).reverse();
  const past = info.regattas.filter((r) => (r.date ?? "") < now);
  const Row = ({ r }: { r: ClubInfo["regattas"][number] }) => {
    const d = r.date ? new Date(r.date) : null;
    return (
      <Link className="r-item" href={`/regatta/${r.id}`}>
        <span className="r-avatar" style={{ background: "#12397f", flexDirection: "column", lineHeight: 1.05, fontSize: 12 }} aria-hidden>
          {d ? (
            <>
              <span>{d.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</span>
              <span style={{ fontSize: 17 }}>{d.getDate()}</span>
            </>
          ) : (
            "—"
          )}
        </span>
        <span className="r-main">
          <span className="r-title">{r.name}</span>
          <span className="r-sub" style={{ display: "block" }}>
            {d?.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </span>
        </span>
        <span className="r-side">Results →</span>
      </Link>
    );
  };
  return (
    <div className="r-top">
      <div className="s-eyebrow" style={{ marginTop: 26 }}>Club</div>
      <h1 className="s-h2">{info.name}</h1>
      <p className="s-lead" style={{ marginTop: 8 }}>
        {[info.location, `${info.regattas.length} regattas on Clubspot`].filter(Boolean).join(" · ")}
      </p>
      {info.website && (
        <div className="btns" style={{ marginTop: 14 }}>
          <a className="s-btn ghost" href={info.website} target="_blank" rel="noreferrer">
            Club website ↗
          </a>
        </div>
      )}
      {upcoming.length > 0 && (
        <section className="r-group">
          <h2>
            Upcoming <small>{upcoming.length}</small>
          </h2>
          <div className="r-list">
            {upcoming.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </div>
        </section>
      )}
      <section className="r-group">
        <h2>
          Past regattas <small>{past.length}</small>
        </h2>
        {past.length === 0 ? (
          <div className="r-empty">No past regattas on Clubspot.</div>
        ) : (
          <div className="r-list">
            {past.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
