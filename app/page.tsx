import Link from "next/link";
import { HeroPhoto } from "@/components/site/HeroPhoto";
import { SearchBox } from "@/components/site/SearchBox";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";
import { unstable_cache } from "next/cache";
import { latestResults, upcomingRegattas, type RecentRegatta, type UpcomingRegatta } from "@/lib/home";

// Latest results and upcoming regattas are refreshed hourly.
export const revalidate = 3600;

const TOPICS: [string, string, string][] = [
  ["Optimist Nationals", "regattas", "Regattas"],
  ["Annapolis Yacht Club", "clubs", "Club"],
  ["Optimist Team Trials", "regattas", "Regattas"],
  ["California Yacht Club", "clubs", "Club"],
  ["Orange Bowl", "regattas", "Regattas"],
  ["22179", "boats", "Sail number"],
];

const within = <T,>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]).catch(() => fallback);

const month = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
const day = (iso: string) => new Date(iso).getUTCDate();

const homeData = unstable_cache(
  async () => {
    const [latest, upcoming] = await Promise.all([
      within(latestResults(5), 12000, [] as RecentRegatta[]),
      within(upcomingRegattas(6), 8000, [] as UpcomingRegatta[]),
    ]);
    return { latest, upcoming };
  },
  ["home-v1"],
  { revalidate: 3600 },
);

export default async function Home() {
  const { latest, upcoming } = await homeData();
  return (
    <div className="page">
      <p className="notice">
        Live results from Clubspot and Regatta Network. <Link href="/pricing">Start with 500 free credits</Link>.
      </p>
      <div className="shell">
        <SiteHeader variant="shell" />
        <section className="home-hero">
          <h1 className="fx">Every regatta, every race.</h1>
          <p className="fx" style={{ ["--d" as string]: "80ms" }}>
            Results, rankings and race-by-race history for sailors, clubs and regattas.
          </p>
        </section>
        <div className="stage fx" style={{ ["--d" as string]: "160ms" }}>
          <SearchBox autoFocus />
          <HeroPhoto />
        </div>
        <div className="try">
          <span>Try</span>
          <Link href={`/search?${new URLSearchParams({ q: "Optimist Nationals", type: "regattas" })}`}>Optimist Nationals</Link>
          <Link href={`/search?${new URLSearchParams({ q: "Annapolis Yacht Club", type: "clubs" })}`}>Annapolis Yacht Club</Link>
          <Link href={`/search?${new URLSearchParams({ q: "22179", type: "boats" })}`}>Sail 22179</Link>
        </div>
      </div>

      <main className="container">
        <section className="band cols-2">
          <div>
            <div className="band-head">
              <h2>Latest results</h2>
              <Link href={`/search?${new URLSearchParams({ q: "Optimist", type: "regattas" })}`}>All regattas</Link>
            </div>
            <ul className="ledger">
              {latest.length === 0 && <li className="empty">Results are loading from Clubspot. Check back in a moment.</li>}
              {latest.map((r) => (
                <li key={r.id}>
                  <Link href={`/regatta/${r.id}`}>
                    <span className="when">
                      <small>{month(r.date)}</small>
                      <b>{day(r.date)}</b>
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="ttl" style={{ display: "block" }}>
                        {r.name}
                      </span>
                      <span className="sub" style={{ display: "block" }}>
                        {r.fleet} · {r.boats} boats{r.club ? ` · ${r.club}` : ""}
                      </span>
                    </span>
                    <span className="win">
                      <b>{r.winner}</b>
                      {r.winnerClub || "Winner"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="band-head">
              <h2>Coming up</h2>
            </div>
            <ul className="ledger">
              {upcoming.length === 0 && <li className="empty">No upcoming Optimist regattas listed yet.</li>}
              {upcoming.map((r) => (
                <li key={r.id}>
                  <Link href={`/regatta/${r.id}`} style={{ gridTemplateColumns: "64px minmax(0, 1fr)" }}>
                    <span className="when">
                      <small>{month(r.date)}</small>
                      <b>{day(r.date)}</b>
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="ttl" style={{ display: "block" }}>
                        {r.name}
                      </span>
                      <span className="sub" style={{ display: "block" }}>
                        {[r.club, r.location].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="band">
          <div className="band-head">
            <h2>Popular searches</h2>
          </div>
          <ul className="topics">
            {TOPICS.map(([q, type, kind]) => (
              <li key={q}>
                <Link href={`/search?${new URLSearchParams({ q, type })}`}>
                  <b>{q}</b>
                  <small>{kind}</small>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="band" style={{ paddingBottom: 72 }}>
          <div className="band-head">
            <h2>Your results, in one place</h2>
            <Link href="/pricing">Compare plans</Link>
          </div>
          <p className="band-lead">
            Search anyone for free to start. Open a sailor to see every regatta and race they&rsquo;ve scored on Clubspot, how strong each
            fleet was, and who they beat.
          </p>
          <div className="plans-strip">
            <div>
              <h3>Free</h3>
              <div className="price">
                $0 <small>to start</small>
              </div>
              <p>500 credits: five searches, with full results for each sailor you find.</p>
              <div className="actions">
                <Link className="btn btn-primary btn-sm" href="/dashboard">
                  Open your dashboard
                </Link>
              </div>
            </div>
            <div>
              <h3>Boater</h3>
              <div className="price">
                $7.99 <small>/ month</small>
              </div>
              <p>1,000 credits, every result and race, club team results.</p>
            </div>
            <div>
              <h3>Parent</h3>
              <div className="price">
                $14.99 <small>/ month</small>
              </div>
              <p>2,000 credits and side-by-side comparison of up to three sailors.</p>
            </div>
            <div>
              <h3>Platinum</h3>
              <div className="price">
                $39.99 <small>/ month</small>
              </div>
              <p>10,000 credits, fleet-strength ratings and head-to-head records.</p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
