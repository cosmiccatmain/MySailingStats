// Recruiting: rank high school sailors (Techscore / ISSA) for a college or
// club program, and describe a program's own roster.

import {
  LEVEL_WEIGHT,
  collegeRoster,
  recentSeasons,
  regattaSailors,
  sailorProfile,
  schools,
  seasonRegattas,
  type Level,
  type SailorProfile,
  type SeasonRegatta,
} from "./techscore";
import { CONFERENCE_DISTRICT, openClassYears } from "./recruit-shared";

export { CONFERENCE_DISTRICT, DISTRICT_NAME, openClassYears } from "./recruit-shared";

// ---------- scoring ----------

/** How much a finish says about a sailor, by event level (fields are stronger at nationals). */
export const LEVEL_FACTOR: Record<Level, number> = { national: 1, championship: 0.85, invitational: 0.7 };
const PRIOR = 40; // score a sailor with no results drifts towards
const PRIOR_WEIGHT = 1.5;

/** 1 = won, 0 = last. */
export const finishPct = (rank: number, teams: number) => (teams > 1 ? 1 - (rank - 1) / (teams - 1) : 1);

export type Result = {
  season: string;
  regatta: string;
  slug: string;
  date: string;
  level: Level;
  role: "S" | "C";
  div: string;
  rank: number;
  teams: number;
};

export type ScoreParts = { score: number; avgPct: number; recent: number | null; trend: number | null };

/** Recruit score (0–100): level-adjusted finish percentile, shrunk towards 40 for small samples. */
export function scoreResults(results: Pick<Result, "date" | "level" | "rank" | "teams">[], now = Date.now()): ScoreParts {
  let num = PRIOR * PRIOR_WEIGHT;
  let den = PRIOR_WEIGHT;
  let pctSum = 0;
  const yearAgo = now - 365 * 864e5;
  const recent: number[] = [];
  const earlier: number[] = [];
  for (const r of results) {
    const pct = finishPct(r.rank, r.teams);
    const pts = pct * 100 * LEVEL_FACTOR[r.level];
    const w = LEVEL_WEIGHT[r.level];
    num += pts * w;
    den += w;
    pctSum += pct;
    (Date.parse(r.date) >= yearAgo ? recent : earlier).push(pts);
  }
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  return {
    score: Math.round((num / den) * 10) / 10,
    avgPct: results.length ? Math.round((pctSum / results.length) * 1000) / 10 : 0,
    recent: recent.length ? Math.round(avg(recent)) : null,
    trend: recent.length >= 2 && earlier.length >= 2 ? Math.round(avg(recent) - avg(earlier)) : null,
  };
}

// ---------- prospect pool ----------

export type Prospect = {
  slug: string;
  name: string;
  year: number | null;
  school: string;
  schoolSlug: string;
  district: string;
  state: string;
  events: number;
  national: number; // national-level events sailed
  natTop5: number; // national-level top-5 division finishes
  skipper: number; // share of events as skipper, 0–1
  best: { regatta: string; slug: string; season: string; rank: number; teams: number; level: Level; div: string } | null;
  score: number;
  avgPct: number;
  recent: number | null;
  trend: number | null;
};

export type Pool = {
  prospects: Prospect[];
  regattas: number;
  seasons: string[];
  districts: string[];
  updated: string;
};

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

/** Fleet-racing regattas that say something about a sailor: championships and national events. */
export const countsForRecruiting = (g: SeasonRegatta) =>
  g.level !== "invitational" && /division/i.test(g.scoring) && !/team|keelboat|match/i.test(`${g.name} ${g.scoring}`);

export async function buildPool(seasonCount = 4): Promise<Pool> {
  const seasons = recentSeasons(seasonCount);
  const [lists, schoolList] = await Promise.all([
    Promise.all(seasons.map((s) => seasonRegattas(s).catch(() => [] as SeasonRegatta[]))),
    schools("hs").catch(() => []),
  ]);
  const schoolBySlug = new Map(schoolList.map((s) => [s.slug, s]));
  const regattas = lists.flat().filter(countsForRecruiting);
  const pages = await mapLimit(regattas, 12, (g) =>
    regattaSailors(g.season, g.slug, g.official).then(
      (p) => ({ g, p }),
      () => null,
    ),
  );

  type Acc = Omit<Prospect, keyof ReturnType<typeof scoreResults> | "events" | "national" | "natTop5" | "skipper" | "best"> & { results: Result[] };
  const people = new Map<string, Acc>();
  for (const x of pages) {
    if (!x) continue;
    const { g, p } = x;
    for (const e of p.entries) {
      if (e.rank == null) continue;
      const teams = p.teams[e.div] ?? 0;
      if (teams < 4) continue;
      for (const [role, list] of [["S", e.skippers], ["C", e.crews]] as const) {
        for (const s of list) {
          if (!s.slug) continue;
          let a = people.get(s.slug);
          if (!a) {
            const sc = schoolBySlug.get(e.schoolSlug);
            a = { slug: s.slug, name: s.name, year: s.year, school: sc?.name ?? e.school, schoolSlug: e.schoolSlug, district: sc?.district ?? "", state: sc?.state ?? "", results: [] };
            people.set(s.slug, a);
          }
          if (a.results.some((r) => r.slug === g.slug && r.season === g.season && r.div === e.div)) continue;
          a.results.push({ season: g.season, regatta: g.name, slug: g.slug, date: g.date, level: g.level, role, div: e.div, rank: e.rank, teams });
        }
      }
    }
  }

  const open = new Set(openClassYears());
  const now = Date.now();
  const prospects: Prospect[] = [];
  for (const a of people.values()) {
    if (a.year != null && !open.has(a.year)) continue;
    const rs = a.results.sort((x, y) => y.date.localeCompare(x.date));
    const levelRank = { national: 0, championship: 1, invitational: 2 } as const;
    const best = [...rs].sort((x, y) => levelRank[x.level] - levelRank[y.level] || finishPct(y.rank, y.teams) - finishPct(x.rank, x.teams))[0];
    const top = rs.reduce((b, r) => (!b || finishPct(r.rank, r.teams) * LEVEL_FACTOR[r.level] > finishPct(b.rank, b.teams) * LEVEL_FACTOR[b.level] ? r : b), null as Result | null);
    const pick = top && best && best.level === "national" && finishPct(best.rank, best.teams) >= 0.5 ? best : top;
    prospects.push({
      slug: a.slug,
      name: a.name,
      year: a.year,
      school: a.school,
      schoolSlug: a.schoolSlug,
      district: a.district,
      state: a.state,
      events: new Set(rs.map((r) => `${r.season}/${r.slug}`)).size,
      national: new Set(rs.filter((r) => r.level === "national").map((r) => `${r.season}/${r.slug}`)).size,
      natTop5: rs.filter((r) => r.level === "national" && r.rank <= 5).length,
      skipper: rs.length ? Math.round((rs.filter((r) => r.role === "S").length / rs.length) * 100) / 100 : 0,
      best: pick ? { regatta: pick.regatta, slug: pick.slug, season: pick.season, rank: pick.rank, teams: pick.teams, level: pick.level, div: pick.div } : null,
      ...scoreResults(rs, now),
    });
  }
  prospects.sort((x, y) => y.score - x.score);
  return {
    prospects,
    regattas: pages.filter(Boolean).length,
    seasons,
    districts: [...new Set(schoolList.map((s) => s.district).filter(Boolean))].sort(),
    updated: new Date().toISOString(),
  };
}

// ---------- one prospect ----------

export type ProspectDetail = SailorProfile & ScoreParts & { counted: number };

export async function prospectDetail(slug: string): Promise<ProspectDetail | null> {
  const p = await sailorProfile(slug, "hs");
  if (!p) return null;
  const counted = p.history.filter((h) => h.place != null && h.of != null && h.of >= 4);
  return {
    ...p,
    counted: counted.length,
    ...scoreResults(counted.map((h) => ({ date: h.date, level: h.level, rank: h.place!, teams: h.of! }))),
  };
}

// ---------- the coach's own program ----------

export type ProgramRoster = {
  school: string;
  slug: string;
  conference: string;
  homeDistrict: string;
  sailors: { slug: string; name: string; year: number | null; hsSchool: string; hsDistrict: string }[];
  seasons: string[];
};

export async function programRoster(slug: string): Promise<ProgramRoster | null> {
  const seasons = recentSeasons(3);
  const [rosters, colleges, hsSchools] = await Promise.all([
    Promise.all(seasons.map((s) => collegeRoster(slug, s))),
    schools("college").catch(() => []),
    schools("hs").catch(() => []),
  ]);
  const college = colleges.find((c) => c.slug === slug);
  const bySlug = new Map<string, { slug: string; name: string; year: number | null }>();
  for (const list of rosters) for (const s of list) if (!bySlug.has(s.slug)) bySlug.set(s.slug, s);
  if (!college && !bySlug.size) return null;
  const now = new Date();
  const lastClass = now.getUTCFullYear() + (now.getUTCMonth() >= 5 ? 1 : 0);
  const current = [...bySlug.values()].filter((s) => s.year == null || s.year >= lastClass);

  // Where the team came from: the same Techscore slug on the high school site,
  // if its graduation year lines up (high school class + 4 ≈ college class).
  const hsBySlug = new Map(hsSchools.map((s) => [s.slug, s]));
  const hs = await mapLimit(current, 8, (s) => sailorProfile(s.slug, "hs"));
  const sailors = current.map((s, i) => {
    const h = hs[i];
    const ok = h && h.year && s.year && Math.abs(h.year + 4 - s.year) <= 1;
    return {
      ...s,
      hsSchool: ok ? h!.school : "",
      hsDistrict: ok ? hsBySlug.get(h!.schoolSlug)?.district ?? h!.district : "",
    };
  });
  const conference = college?.district ?? "";
  return {
    school: college?.name ?? slug,
    slug,
    conference,
    homeDistrict: CONFERENCE_DISTRICT[conference.toUpperCase()] ?? "",
    sailors: sailors.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.name.localeCompare(b.name)),
    seasons,
  };
}

export async function collegeList() {
  return (await schools("college")).map(({ slug, name, district }) => ({ slug, name, conference: district }));
}
