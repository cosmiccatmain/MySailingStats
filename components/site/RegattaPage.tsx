"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    fetch(`/api/regatta-info/${id}`)
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
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
    fetch(`/api/regatta/${id}?${new URLSearchParams({ class: cls, date: info.date ?? new Date().toISOString(), method: c.method ?? "" })}`)
      .then((r) => r.json())
      .then((b) => setField(b.field ?? []))
      .catch(() => setField([]))
      .finally(() => setLoading(false));
  }, [id, info, cls]);

  if (err) return <div className="r-empty">{err}</div>;
  if (!info) return <div className="r-list" style={{ marginTop: 24 }}>{[0, 1, 2].map((i) => <div key={i} className="r-skel" />)}</div>;
  const races = Math.max(0, ...(field ?? []).map((r) => r.r.length));
  const selected = info.classes.find((c) => c.id === cls);
  return (
    <div className="r-top" style={{ maxWidth: 1060 }}>
      <div className="s-eyebrow" style={{ marginTop: 26 }}>Regatta</div>
      <h1 className="s-h2">{info.name}</h1>
      <p className="s-lead" style={{ marginTop: 8 }}>
        {fmt(info.date)}
        {info.club && (
          <>
            {" · "}
            <Link href={`/club/${info.club.id}`}>{info.club.name}</Link>
            {info.club.location ? ` · ${info.club.location}` : ""}
          </>
        )}
      </p>
      <div className="btns" style={{ marginTop: 14 }}>
        <a className="s-btn ghost" href={`https://theclubspot.com/regatta/${id}/results`} target="_blank" rel="noreferrer">
          Official results ↗
        </a>
      </div>

      {info.classes.length === 0 ? (
        <div className="r-empty">No racing fleets published for this regatta yet.</div>
      ) : (
        <>
          <div className="r-tabs" role="tablist" style={{ marginTop: 26 }}>
            {info.classes.map((c) => (
              <button key={c.id} role="tab" aria-selected={c.id === cls} onClick={() => setCls(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
          {selected && (
            <p className="muted small" style={{ margin: "4px 0 10px" }}>
              {TIER_LABEL[fleetTier(selected.name)]} fleet{field ? ` · ${field.length} boats` : ""}
              {selected.method === "pdf" || selected.method === "external_link" ? " · results are posted outside Clubspot" : ""}
            </p>
          )}
          {loading && <div className="r-skel" />}
          {field && field.length === 0 && !loading && <div className="r-empty">No scores published for this fleet yet.</div>}
          {field && field.length > 0 && (
            <div className="card table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>Sailor</th>
                    <th>Club</th>
                    <th>Sail</th>
                    {Array.from({ length: races }, (_, i) => (
                      <th key={i} className="num">
                        R{i + 1}
                      </th>
                    ))}
                    <th className="num">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {field.map((r) => (
                    <tr key={r.id}>
                      <td className="num">
                        <b>{r.p}</b>
                        {r.f && <span className="muted tiny"> {r.f[0]}</span>}
                      </td>
                      <td className="nowrap">
                        <Link href={`/dashboard?${new URLSearchParams({ name: r.n })}`}>{r.n}</Link>
                      </td>
                      <td className="clip">{r.c}</td>
                      <td className="nowrap muted">{r.s}</td>
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
              {field.some((r) => r.f) && <p className="muted small">G/S/B/E = Gold/Silver/Bronze/Emerald finals fleet.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
