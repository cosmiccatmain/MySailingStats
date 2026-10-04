"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SearchBox } from "./SearchBox";
import type { BoatHit, ClubHit, RegattaHit, SailorHit, SearchResults as Results } from "@/lib/search";
import { SEARCH_TYPES, type SearchType } from "@/lib/search-types";
import { CREDITS_PER_SEARCH, fmtCredits } from "@/lib/plans";
import { spend, useWallet } from "@/lib/wallet";

type Tab = Exclude<SearchType, "all"> | "all";
const PALETTE = ["#12397f", "#1b7a95", "#c9533a", "#2f7d5b", "#6b4fa0", "#b07a12"];
const hue = (s: string) => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

export function SearchResults() {
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const type = (SEARCH_TYPES.find(([k]) => k === params.get("type"))?.[0] ?? "all") as SearchType;
  const wallet = useWallet();
  const [data, setData] = useState<Results | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "broke" | "error">("idle");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>(type);

  useEffect(() => {
    setTab(type);
    if (q.length < 2) return;
    // One charge per distinct search in this browser session (reloads and back-navigation are free).
    const key = `mss:charged:${type}:${q.toLowerCase()}`;
    let charged = false;
    try {
      charged = sessionStorage.getItem(key) === "1";
    } catch {
      /* storage blocked */
    }
    if (!charged) {
      if (!spend(CREDITS_PER_SEARCH)) {
        setState("broke");
        setData(null);
        return;
      }
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        /* storage blocked */
      }
    }
    let live = true;
    setState("loading");
    setData(null);
    fetch(`/api/search?${new URLSearchParams({ q, type })}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        return body as Results;
      })
      .then((d) => live && (setData(d), setState("idle")))
      .catch((e) => live && (setError((e as Error).message), setState("error")));
    return () => {
      live = false;
    };
  }, [q, type]);

  const counts: Record<Tab, number> = {
    all: data ? data.sailors.length + data.regattas.length + data.clubs.length + data.boats.length + data.coaches.length : 0,
    sailors: data?.sailors.length ?? 0,
    regattas: data?.regattas.length ?? 0,
    clubs: data?.clubs.length ?? 0,
    boats: data?.boats.length ?? 0,
    coaches: data?.coaches.length ?? 0,
  };
  const show = (t: Tab) => tab === "all" || tab === t;

  return (
    <div className="r-top">
      <SearchBox initialQuery={q} initialType={type} />
      {q.length < 2 ? (
        <div className="r-empty">Search regattas, sailors, boats, coaches or clubs.</div>
      ) : state === "broke" ? (
        <div className="gate-card" style={{ marginTop: 24 }}>
          <div className="gate-lock" aria-hidden>
            ◆
          </div>
          <h3>You&rsquo;re out of credits</h3>
          <p>
            Each search uses {CREDITS_PER_SEARCH} credits and you have {fmtCredits(wallet.credits ?? 0)} left. Pick a plan for a fresh monthly
            allowance — Boater includes 1,000 credits.
          </p>
          <Link className="s-btn navy" href="/pricing">
            See plans
          </Link>
        </div>
      ) : (
        <>
          <div className="r-tabs" role="tablist">
            {(["all", "sailors", "regattas", "clubs", "boats", "coaches"] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} disabled={type !== "all" && t !== type && t !== "all"}>
                {SEARCH_TYPES.find(([k]) => k === t)?.[1] ?? t}
                {data && <span>{counts[t]}</span>}
              </button>
            ))}
          </div>
          {state === "loading" && (
            <div className="r-list" aria-busy>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="r-skel" />
              ))}
              <p className="muted small">Searching Clubspot and Regatta Network…</p>
            </div>
          )}
          {state === "error" && <div className="card warn">Search failed: {error}</div>}
          {data && counts.all === 0 && (
            <div className="r-empty">
              No results for <b>{q}</b>. For a sailor, try their full name as registered; for a regatta, a word from its name.
            </div>
          )}
          {data && (
            <>
              {show("sailors") && data.sailors.length > 0 && (
                <Group title="Sailors" n={data.sailors.length}>
                  {data.sailors.map((s) => (
                    <SailorItem key={s.name} s={s} />
                  ))}
                </Group>
              )}
              {show("regattas") && data.regattas.length > 0 && (
                <Group title="Regattas" n={data.regattas.length}>
                  {data.regattas.map((r) => (
                    <RegattaItem key={r.id} r={r} />
                  ))}
                </Group>
              )}
              {show("clubs") && data.clubs.length > 0 && (
                <Group title="Clubs" n={data.clubs.length}>
                  {data.clubs.map((c) => (
                    <ClubItem key={c.id} c={c} />
                  ))}
                </Group>
              )}
              {show("boats") && data.boats.length > 0 && (
                <Group title="Boats" n={data.boats.length}>
                  {data.boats.map((b, i) => (
                    <BoatItem key={`${b.regattaId}-${i}`} b={b} />
                  ))}
                </Group>
              )}
              {show("coaches") && data.coaches.length > 0 && (
                <Group title="Coaches" n={data.coaches.length}>
                  {data.coaches.map((s) => (
                    <SailorItem key={s.name} s={s} coach />
                  ))}
                </Group>
              )}
              <p className="r-sources">
                {data.sources.map((s) => `${s.name} ${s.ok ? "✓" : "(no response)"}`).join(" · ")} · {(data.tookMs / 1000).toFixed(1)}s
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Group({ title, n, children }: { title: string; n: number; children: React.ReactNode }) {
  return (
    <section className="r-group">
      <h2>
        {title} <small>{n}</small>
      </h2>
      <div className="r-list">{children}</div>
    </section>
  );
}

function SailorItem({ s, coach }: { s: SailorHit; coach?: boolean }) {
  const body = (
    <>
      <span className="r-avatar" style={{ background: hue(s.name) }} aria-hidden>
        {initials(s.name)}
      </span>
      <span className="r-main">
        <span className="r-title">{s.name}</span>
        <span className="r-sub" style={{ display: "block" }}>
          {[s.clubs.slice(0, 2).join(", "), s.lastRegatta && `last: ${s.lastRegatta} (${fmt(s.lastDate)})`].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="r-side">
        <b>{s.regattas}</b> regatta{s.regattas === 1 ? "" : "s"}
        <br />
        {coach ? "Coach" : s.sail ? `#${s.sail}` : ""}
      </span>
    </>
  );
  return coach ? (
    <div className="r-item">{body}</div>
  ) : (
    <Link className="r-item" href={`/dashboard?${new URLSearchParams({ name: s.name })}`} title="Open full stats">
      {body}
    </Link>
  );
}

function RegattaItem({ r }: { r: RegattaHit }) {
  const d = r.date ? new Date(r.date) : null;
  const inner = (
    <>
      <span className="r-avatar" style={{ background: r.external ? "#6b4fa0" : "#12397f", flexDirection: "column", lineHeight: 1.05, fontSize: 12 }} aria-hidden>
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
          {[fmt(r.date), r.club, r.location].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="r-side">
        <span className="r-src">{r.source}</span>
      </span>
    </>
  );
  return r.external ? (
    <a className="r-item" href={r.url} target="_blank" rel="noreferrer">
      {inner}
    </a>
  ) : (
    <Link className="r-item" href={r.url}>
      {inner}
    </Link>
  );
}

function ClubItem({ c }: { c: ClubHit }) {
  return (
    <Link className="r-item" href={c.url}>
      <span className="r-avatar" style={{ background: hue(c.name) }} aria-hidden>
        ⚓
      </span>
      <span className="r-main">
        <span className="r-title">{c.name}</span>
        <span className="r-sub" style={{ display: "block" }}>
          {c.location || "Club on Clubspot"}
        </span>
      </span>
      <span className="r-side">Regattas →</span>
    </Link>
  );
}

function BoatItem({ b }: { b: BoatHit }) {
  return (
    <Link className="r-item" href={`/regatta/${b.regattaId}`}>
      <span className="r-avatar" style={{ background: "#1b7a95", fontSize: 12 }} aria-hidden>
        {b.sail ? `#${b.sail}`.slice(0, 6) : "⛵"}
      </span>
      <span className="r-main">
        <span className="r-title">{b.boat || `Sail #${b.sail}`}</span>
        <span className="r-sub" style={{ display: "block" }}>
          {[b.sailor, b.regatta, fmt(b.date)].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="r-side">{b.sail ? `#${b.sail}` : ""}</span>
    </Link>
  );
}
