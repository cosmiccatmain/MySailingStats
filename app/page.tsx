import Link from "next/link";
import { redirect } from "next/navigation";
import { Seascape } from "@/components/site/Art";
import { SearchBox } from "@/components/site/SearchBox";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";

const CATEGORIES = [
  { ico: "🏁", title: "Regattas", text: "Every event on Clubspot worldwide, plus Regatta Network's calendar.", q: "Optimist Nationals", type: "regattas" },
  { ico: "🧒", title: "Sailors", text: "Full race history, ratings and rivals for any sailor.", q: "McGeagh", type: "sailors" },
  { ico: "⛵", title: "Boats", text: "Look up a sail number or boat name and see who sailed it.", q: "22179", type: "boats" },
  { ico: "📋", title: "Coaches", text: "Find coaches registered at regattas and the programs they run.", q: "Smith", type: "coaches" },
  { ico: "⚓", title: "Clubs", text: "Club pages, their regattas, and how their teams finish.", q: "Annapolis Yacht Club", type: "clubs" },
];

const SOURCES: [string, boolean][] = [
  ["Clubspot", true],
  ["USODA", true],
  ["Regatta Network", true],
  ["Techscore", false],
  ["Sailwave", false],
  ["Manage2Sail", false],
  ["World Sailing", false],
];

const SUGGEST = [
  ["Optimist Nationals", "regattas"],
  ["Annapolis Yacht Club", "clubs"],
  ["Laser", "regattas"],
  ["Team Trials", "regattas"],
];

export default async function Home(props: { searchParams: Promise<Record<string, string | undefined>> }) {
  // Links shared before the dashboard moved: /?name=First+Last
  const sp = await props.searchParams;
  if (sp.name) redirect(`/dashboard?${new URLSearchParams({ name: sp.name, ...(sp.tab ? { tab: sp.tab } : {}) })}`);
  return (
    <div className="s-page">
      <div className="s-notice">
        <span className="dot" aria-hidden />
        The global sailing search — live results from Clubspot &amp; Regatta Network
      </div>
      <div className="s-shell">
        <SiteHeader />
        <section className="s-hero">
          <h1>Ahoy, Sailor</h1>
          <p>Whatever you need from the water, start here.</p>
        </section>
        <div className="s-stage">
          <SearchBox autoFocus showMeta={false} />
          <div className="s-art">
            <Seascape />
            <div className="s-art-overlay">
              <div className="s-suggest">
                {SUGGEST.map(([q, type]) => (
                  <Link key={q} href={`/search?${new URLSearchParams({ q, type })}`}>
                    {q}
                  </Link>
                ))}
              </div>
              <div className="s-search-meta">100 credits per search · 500 free credits to start</div>
            </div>
          </div>
        </div>
      </div>

      <div className="s-wrap">
        <section className="s-section">
          <div className="s-eyebrow">Search anything</div>
          <h2 className="s-h2">One box for the whole sport.</h2>
          <p className="s-lead">
            Regattas, sailors, boats, coaches and clubs — from local junior regattas to national championships, anywhere in the world.
          </p>
          <div className="s-grid five">
            {CATEGORIES.map((c) => (
              <Link key={c.title} className="s-cat" href={`/search?${new URLSearchParams({ q: c.q, type: c.type })}`}>
                <span className="ico" aria-hidden>
                  {c.ico}
                </span>
                <b>{c.title}</b>
                <span>{c.text}</span>
                <em>Try “{c.q}” →</em>
              </Link>
            ))}
          </div>
        </section>

        <section className="s-section">
          <div className="s-eyebrow">Works with</div>
          <h2 className="s-h2">Your results, wherever they were scored.</h2>
          <p className="s-lead">
            We read results straight from the scoring systems clubs already use — no uploads, no spreadsheets.
          </p>
          <div className="s-sources">
            {SOURCES.map(([name, live]) => (
              <span key={name} className="s-source">
                {name} <small className={live ? "live" : "soon"}>{live ? "Live" : "Coming soon"}</small>
              </span>
            ))}
          </div>
        </section>

        <section className="s-section">
          <div className="s-eyebrow">Tools</div>
          <h2 className="s-h2">More than search.</h2>
          <div className="s-feature-row">
            <div className="s-feature dark">
              <span className="tag">DashboardPlus</span>
              <h3>A rating that knows the fleet.</h3>
              <p>Beating a Championship fleet counts for more than winning Green. See your rating climb race by race.</p>
              <div className="s-mini" aria-hidden>
                {[
                  ["Championship", 82, "#3987e5"],
                  ["Red/White/Blue", 64, "#d95926"],
                  ["Green", 41, "#199e70"],
                ].map(([label, v, c]) => (
                  <div key={label as string} className="s-mini-row">
                    <span style={{ width: 110 }}>{label}</span>
                    <span className="bar">
                      <span style={{ width: `${v}%`, background: c as string }} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="s-feature">
              <span className="tag">Multi Compare</span>
              <h3>You vs. the fleet.</h3>
              <p>Line up to six sailors: head-to-head records, same-start race wins and ratings on one scale.</p>
              <div className="s-mini" aria-hidden>
                {[
                  ["You", 71, "var(--series-1)"],
                  ["Rival A", 66, "var(--series-2)"],
                  ["Rival B", 58, "var(--series-3)"],
                ].map(([label, v, c]) => (
                  <div key={label as string} className="s-mini-row">
                    <span style={{ width: 60 }}>{label}</span>
                    <span className="bar">
                      <span style={{ width: `${v}%`, background: c as string }} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="s-feature">
              <span className="tag">Club Search</span>
              <h3>How did the team do?</h3>
              <p>Team scores for any club at every regatta — ranked by each club&rsquo;s best three finishers.</p>
              <div className="s-mini" aria-hidden>
                {[
                  ["1st", "Annapolis YC", "6 + 10 + 12"],
                  ["2nd", "Tred Avon YC", "1 + 7 + 9"],
                  ["3rd", "Hampton YC", "4 + 14 + 16"],
                ].map(([p, c, s]) => (
                  <div key={c} className="s-mini-row">
                    <b style={{ width: 34 }}>{p}</b>
                    <span style={{ flex: 1 }}>{c}</span>
                    <span className="muted">{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="s-cta">
          <h2>Plans for sailors, parents and whole teams.</h2>
          <p>Start with 500 free credits. Upgrade for DashboardPlus, Multi Compare and Club Search.</p>
          <div className="btns" style={{ justifyContent: "center" }}>
            <Link className="s-btn white" href="/pricing">
              See plans
            </Link>
            <Link className="s-btn ghost-white" href="/pricing?for=enterprise">
              For coaches &amp; teams
            </Link>
          </div>
        </section>

        <SiteFooter />
      </div>
    </div>
  );
}
