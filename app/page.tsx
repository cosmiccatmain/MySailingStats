import { ArrowRight, Flag, Sailboat, School, UserRound, UsersRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SearchBox } from "@/components/site/SearchBox";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";
import { DashboardCompare } from "@/components/site/DashboardCompare";

const CATEGORIES = [
  { Icon: Flag, title: "Regattas", text: "Events on Clubspot worldwide and Regatta Network's calendar.", q: "Optimist Nationals", type: "regattas" },
  { Icon: UserRound, title: "Sailors", text: "Full results history, ratings and head-to-head records.", q: "Margot McGeagh", type: "sailors" },
  { Icon: Sailboat, title: "Boats", text: "Look up a sail number or boat name and see who sailed it.", q: "22179", type: "boats" },
  { Icon: UsersRound, title: "Coaches", text: "Coaches registered at regattas and the programs they support.", q: "McGeagh", type: "coaches" },
  { Icon: School, title: "Clubs", text: "Club pages, their regattas and how their teams finish.", q: "Annapolis Yacht Club", type: "clubs" },
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

const TRY: [string, string][] = [
  ["Optimist Nationals", "regattas"],
  ["Annapolis Yacht Club", "clubs"],
  ["22179", "boats"],
];

export default async function Home(props: { searchParams: Promise<Record<string, string | undefined>> }) {
  // Links shared before the dashboard moved: /?name=First+Last
  const sp = await props.searchParams;
  if (sp.name) redirect(`/dashboard?${new URLSearchParams({ name: sp.name, ...(sp.tab ? { tab: sp.tab } : {}) })}`);
  return (
    <div className="page">
      <SiteHeader />
      <main>
        <section className="l-hero container">
          <span className="eyebrow fx">
            <span className="dot" aria-hidden />
            Live results from Clubspot and Regatta Network
          </span>
          <h1 className="fx" style={{ ["--d" as string]: "60ms" }}>
            Sailing results and analytics, <span className="soft">in one search.</span>
          </h1>
          <p className="lead fx" style={{ ["--d" as string]: "120ms" }}>
            Look up any regatta, sailor, boat, coach or club. Open a sailor to see every race, a fleet-strength rating and head-to-head
            records.
          </p>
          <div className="l-search fx" style={{ ["--d" as string]: "180ms" }}>
            <SearchBox autoFocus />
            <div className="l-try">
              <span>Try</span>
              {TRY.map(([q, type], i) => (
                <span key={q}>
                  <Link href={`/search?${new URLSearchParams({ q, type })}`}>{q}</Link>
                  {i < TRY.length - 1 ? <span aria-hidden> · </span> : null}
                </span>
              ))}
            </div>
          </div>
          <div className="preview fx" style={{ ["--d" as string]: "260ms" }}>
            <Preview />
          </div>
        </section>

        <div className="container">
          <section className="l-section">
            <div className="l-kicker">Search</div>
            <h2 className="l-h2">One search box for the whole sport.</h2>
            <p className="l-lead">From local junior regattas to national championships. Each search uses 100 credits; new accounts start with 500.</p>
            <div className="l-cats">
              {CATEGORIES.map(({ Icon, ...c }) => (
                <Link key={c.title} className="l-cat" href={`/search?${new URLSearchParams({ q: c.q, type: c.type })}`}>
                  <span className="ico" aria-hidden>
                    <Icon />
                  </span>
                  <b>{c.title}</b>
                  <span>{c.text}</span>
                  <em>
                    Try “{c.q}” <ArrowRight aria-hidden />
                  </em>
                </Link>
              ))}
            </div>
          </section>

          <section className="l-section">
            <div className="l-kicker">Dashboards</div>
            <h2 className="l-h2">Two dashboards. Pick the depth you need.</h2>
            <p className="l-lead">Every plan includes a sailor dashboard. DashboardPlus adds ratings that account for how strong each fleet was.</p>
            <DashboardCompare />
          </section>

          <section className="l-section">
            <div className="l-kicker">Sources</div>
            <h2 className="l-h2">Results straight from the scoring systems clubs use.</h2>
            <p className="l-lead">No uploads and no spreadsheets. Standings are checked boat by boat against the official results.</p>
            <div className="l-sources">
              {SOURCES.map(([name, live]) => (
                <span key={name} className="l-source">
                  {name} <span className={`status-tag ${live ? "live" : "soon"}`}>{live ? "Live" : "Planned"}</span>
                </span>
              ))}
            </div>
          </section>

          <section className="l-cta">
            <div>
              <h2>Plans for sailors, families and teams.</h2>
              <p>Boater, Parent and Platinum for individuals. Coach, Team, TeamPlus and Club for programs.</p>
            </div>
            <div className="btns">
              <Link className="btn btn-white btn-lg" href="/pricing">
                See plans
              </Link>
              <Link className="btn btn-outline-white btn-lg" href="/pricing?for=enterprise">
                Coaches and teams
              </Link>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/** A static, illustrative preview of the dashboard. */
function Preview() {
  const pts = [38, 44, 41, 52, 49, 58, 63, 60, 68, 72, 70, 78];
  const w = 520;
  const h = 150;
  const x = (i: number) => 12 + (i * (w - 24)) / (pts.length - 1);
  const y = (v: number) => h - 14 - ((v - 30) / 55) * (h - 28);
  const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1)} ${h - 8} L${x(0)} ${h - 8} Z`;
  return (
    <div className="pv-window" aria-label="Example dashboard" role="img">
      <div className="pv-bar">
        <i />
        <i />
        <i />
        <span>Example sailor · DashboardPlus</span>
      </div>
      <div className="pv-body">
        <div className="pv-kpis">
          {[
            ["Rating", "1,486"],
            ["Regattas", "27"],
            ["Avg. fleet beaten", "71%"],
            ["Best finish", "4th / 212"],
          ].map(([k, v]) => (
            <div key={k} className="pv-kpi">
              <small>{k}</small>
              <b>{v}</b>
            </div>
          ))}
        </div>
        <div className="pv-card">
          <h4>Rating over time</h4>
          <p>Adjusted for fleet strength</p>
          <svg viewBox={`0 0 ${w} ${h}`} aria-hidden>
            <defs>
              <linearGradient id="pv-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--series-1)" stopOpacity="0.25" />
                <stop offset="1" stopColor="var(--series-1)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1="0" x2={w} y1={h * f} y2={h * f} stroke="var(--grid)" strokeWidth="1" />
            ))}
            <path d={area} fill="url(#pv-fill)" />
            <path d={line} fill="none" stroke="var(--series-1)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1])} r="5" fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth="2" />
          </svg>
        </div>
        <div className="pv-card side">
          <h4>Recent results</h4>
          <p>Share of the fleet beaten</p>
          <div className="pv-rows">
            {[
              ["National Championship", "12th", 94, "var(--series-1)"],
              ["Atlantic Coast", "8th", 92, "var(--series-1)"],
              ["Junior Annual RWB", "2nd", 97, "var(--series-2)"],
              ["Fall Invitational", "5th", 88, "var(--series-2)"],
            ].map(([n, p, v, c]) => (
              <div key={n as string} className="pv-row">
                <b style={{ width: 34 }}>{p}</b>
                <span className="nm">{n}</span>
                <span className="meter">
                  <span style={{ width: `${v}%`, background: c as string }} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
