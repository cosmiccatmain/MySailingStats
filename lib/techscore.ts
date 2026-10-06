// Techscore: the scoring system for US high school (ISSA, scores.hssailing.org)
// and college (ICSA, scores.collegesailing.org) sailing, where C420s, FJs and
// Z420s are raced. Pages are static HTML, so we read them directly.
//
// Kept free of app imports so it can be run and tested on its own.

export const HS = "https://scores.hssailing.org";
export const COLLEGE = "https://scores.collegesailing.org";

const DAY = 86400;

async function html(url: string, revalidate = DAY / 4): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": "MySailingStats/1.0 (+https://mysailingstats.vercel.app)" },
    // Next.js caches these per URL; finished regattas and old seasons never change.
    next: { revalidate },
  } as RequestInit);
  if (!res.ok) throw new Error(`Techscore ${url} failed: ${res.status}`);
  return res.text();
}

// ---------- tiny HTML helpers ----------

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
export const text = (s: string) => decode(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

type Cell = { cls: string; html: string; text: string; href: string | null };
function cells(row: string): Cell[] {
  const out: Cell[] = [];
  const re = /<t([dh])([^>]*)>(.*?)<\/t\1>/gs;
  for (let m; (m = re.exec(row)); ) {
    const cls = /class="([^"]*)"/.exec(m[2])?.[1] ?? "";
    out.push({ cls, html: m[3], text: text(m[3]), href: /href="([^"]*)"/.exec(m[3])?.[1] ?? null });
  }
  return out;
}
/** Rows of the first <table> whose class contains `cls` (or of every table after `from`). */
function tableRows(page: string, cls: string): string[] {
  const start = page.search(new RegExp(`<table[^>]*class="[^"]*\\b${cls}\\b`));
  if (start < 0) return [];
  const end = page.indexOf("</table>", start);
  const body = page.slice(start, end < 0 ? undefined : end);
  return body.split(/<tr\b/).slice(1).map((r) => "<tr" + r);
}
const infoValue = (page: string, key: string) => {
  const m = new RegExp(`page-info-key">${key}</span><span class="page-info-value">(.*?)</span></li>`, "s").exec(page);
  return m ? text(m[1]) : "";
};

/** "Christopher Small '26" → { name, year: 2026 } */
export function nameYear(s: string): { name: string; year: number | null } {
  const m = /^(.*?)\s*'(\d{2})\s*\*?$/.exec(s.trim());
  if (!m) return { name: s.trim(), year: null };
  return { name: m[1].trim(), year: 2000 + Number(m[2]) };
}
const slugOf = (href: string | null, kind: string) => (href ? new RegExp(`/${kind}/([^/]+)/`).exec(href)?.[1] ?? "" : "");

// ---------- seasons ----------

/** Techscore season codes, newest first: f26, s26, f25, … (fall = Aug–Dec). */
export function recentSeasons(n: number, now = new Date()): string[] {
  let y = now.getUTCFullYear() % 100;
  let fall = now.getUTCMonth() >= 7;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(`${fall ? "f" : "s"}${String(y).padStart(2, "0")}`);
    if (fall) fall = false;
    else {
      fall = true;
      y -= 1;
    }
  }
  return out;
}
export const seasonLabel = (code: string) => `${code[0] === "f" ? "Fall" : "Spring"} 20${code.slice(1)}`;

export type Level = "national" | "championship" | "invitational";
export const LEVEL_LABEL: Record<Level, string> = { national: "National", championship: "District / league championship", invitational: "Invitational" };
export const LEVEL_WEIGHT: Record<Level, number> = { national: 1, championship: 0.75, invitational: 0.5 };

export function levelOf(type: string, name = ""): Level {
  if (/national/i.test(type)) return "national";
  // "Mallory Qualifier" is a district event, not the Mallory itself.
  if (/qualif|qualfier/i.test(name)) return "championship";
  if (/\bnational|\b(mallory|baker|cressy|great oaks|atlantic coast|sears|bemis|smythe)\b/i.test(name)) return "national";
  if (/championship|tournament|qualifier|qualfier/i.test(type) || /championship|champs\b|\bstate\b/i.test(name)) return "championship";
  return "invitational";
}

export type SeasonRegatta = {
  season: string;
  slug: string;
  name: string;
  host: string;
  type: string;
  scoring: string;
  date: string; // ISO date
  official: boolean;
  level: Level;
};

export function parseSeason(page: string, season: string): SeasonRegatta[] {
  const out: SeasonRegatta[] = [];
  for (const r of tableRows(page, "season-summary")) {
    const c = cells(r);
    if (c.length < 6 || !c[0].href) continue;
    const [mm, dd, yyyy] = c[4].text.split("/");
    const slug = c[0].href.replace(/^\/?(?:[fs]\d\d\/)?/, "").replace(/\/$/, "");
    out.push({
      season,
      slug,
      name: c[0].text,
      host: c[1].text,
      type: c[2].text,
      scoring: c[3].text,
      date: yyyy ? `${yyyy}-${mm}-${dd}` : "",
      official: /official|final/i.test(c[5].text),
      level: levelOf(c[2].text, c[0].text),
    });
  }
  return out;
}

export async function seasonRegattas(season: string): Promise<SeasonRegatta[]> {
  const old = season !== recentSeasons(1)[0];
  return parseSeason(await html(`${HS}/${season}/`, old ? 7 * DAY : DAY / 8), season);
}

// ---------- regatta registrations ----------

export type Person = { slug: string; name: string; year: number | null; races: string };
export type Entry = { school: string; schoolSlug: string; team: string; div: string; rank: number | null; skippers: Person[]; crews: Person[] };
export type RegattaSailors = { name: string; type: string; boat: string; scoring: string; entries: Entry[]; teams: Record<string, number> };

const person = (c: Cell | undefined, races: Cell | undefined): Person | null => {
  if (!c?.href || !/\/sailors\//.test(c.href)) return null;
  const { name, year } = nameYear(c.text);
  return { slug: slugOf(c.href, "sailors"), name, year, races: races?.text ?? "" };
};

/** The "Sailors" page of a regatta: every team, division, rank, skipper and crew. */
export function parseRegattaSailors(page: string): RegattaSailors {
  const entries: Entry[] = [];
  let school = "";
  let schoolSlug = "";
  let team = "";
  let cur: Entry | null = null;
  for (const r of tableRows(page, "sailors")) {
    if (/reserves-row/.test(r)) continue;
    const c = cells(r);
    if (!c.length) continue;
    const sc = c.find((x) => /schoolname/.test(x.cls));
    if (sc) {
      school = sc.text;
      schoolSlug = slugOf(sc.href, "schools");
      team = c.find((x) => /teamname/.test(x.cls))?.text ?? "";
    }
    const dc = c.findIndex((x) => /division-cell/.test(x.cls));
    let rest = c;
    if (dc >= 0) {
      const rank = Number(c.find((x) => /rank-cell/.test(x.cls))?.text);
      cur = { school, schoolSlug, team, div: c[dc].text, rank: Number.isFinite(rank) && rank > 0 ? rank : null, skippers: [], crews: [] };
      entries.push(cur);
      rest = c.slice(dc + 2);
    }
    if (!cur) continue;
    // Remaining cells: [skipper, races, crew, races]; empty pairs mean "same as above".
    const sk = person(rest[0], rest[1]);
    const cr = person(rest[2], rest[3]);
    if (sk) cur.skippers.push(sk);
    if (cr) cur.crews.push(cr);
  }
  const teams: Record<string, number> = {};
  for (const e of entries) teams[e.div] = (teams[e.div] ?? 0) + 1;
  return {
    name: text(/<h1>(.*?)<\/h1>/s.exec(page)?.[1] ?? ""),
    type: infoValue(page, "Type"),
    boat: infoValue(page, "Boat"),
    scoring: infoValue(page, "Scoring"),
    entries,
    teams,
  };
}

export async function regattaSailors(season: string, slug: string, finished: boolean): Promise<RegattaSailors> {
  return parseRegattaSailors(await html(`${HS}/${season}/${slug}/sailors/`, finished ? 14 * DAY : DAY / 12));
}

// ---------- sailor profiles ----------

export type HistoryRow = {
  season: string;
  regattaSlug: string;
  regatta: string;
  host: string;
  date: string;
  role: "Skipper" | "Crew" | string;
  place: number | null;
  of: number | null;
  div: string | null;
  level: Level;
};
export type SailorProfile = {
  slug: string;
  name: string;
  year: number | null;
  school: string;
  schoolSlug: string;
  district: string;
  regattaCount: number;
  history: HistoryRow[];
};

export function parseSailor(page: string, slug: string, site: "hs" | "college" = "hs"): SailorProfile {
  const history: HistoryRow[] = [];
  const blocks = page.split(/<div class="port" id="history">/).slice(1);
  for (const b of blocks) {
    const season = /<h3>Season history for <a href="\/([fs]\d\d)\//.exec(b)?.[1] ?? "";
    for (const r of tableRows(b, "participation-table")) {
      const c = cells(r);
      if (c.length < 5 || !c[0].href) continue;
      // College pages carry Type and Scoring columns that high school pages don't.
      const placeCell = c[c.length - 1];
      const roleCell = site === "hs" ? c[3] : c.find((x) => /^(skipper|crew)$/i.test(x.text));
      const pm = /(\d+)\s*\/\s*(\d+)(?:\s*\((\w+) Div\))?/.exec(placeCell.text);
      const dt = /datetime="([^"]+)"/.exec(r)?.[1] ?? "";
      const regattaSlug = (c[0].href.match(/^\/[fs]\d\d\/([^/]+)\//) ?? [])[1] ?? "";
      history.push({
        season,
        regattaSlug,
        regatta: c[0].text,
        host: c[1].text,
        date: dt.slice(0, 10),
        role: roleCell?.text ?? "",
        place: pm ? Number(pm[1]) : null,
        of: pm ? Number(pm[2]) : null,
        div: pm?.[3] ?? null,
        level: levelOf("", c[0].text),
      });
    }
  }
  const yearText = infoValue(page, "Graduation Year") || infoValue(page, "Class");
  const schoolM = /page-info-key">School<\/span><span class="page-info-value"><a href="\/schools\/([^/]+)\/">(.*?)<\/a>/s.exec(page);
  return {
    slug,
    name: text(/<h1>(.*?)<\/h1>/s.exec(page)?.[1] ?? slug),
    year: /^\d{4}$/.test(yearText) ? Number(yearText) : null,
    school: schoolM ? text(schoolM[2]) : "",
    schoolSlug: schoolM?.[1] ?? "",
    district: infoValue(page, "District") || infoValue(page, "Conference"),
    regattaCount: Number(infoValue(page, "Number of Regattas")) || history.length,
    history: history.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

export async function sailorProfile(slug: string, site: "hs" | "college" = "hs"): Promise<SailorProfile | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try {
    return parseSailor(await html(`${site === "hs" ? HS : COLLEGE}/sailors/${slug}/`, DAY / 4), slug, site);
  } catch {
    return null;
  }
}

// ---------- schools ----------

export type School = { slug: string; name: string; district: string; city: string; state: string };

/** The schools index: high school → ISSA district, or college → ICSA conference. */
export function parseSchools(page: string): School[] {
  const out: School[] = [];
  const parts = page.split(/<div class="port" id="/).slice(1);
  for (const p of parts) {
    const district = p.slice(0, p.indexOf('"'));
    for (const r of tableRows(p, "schools-table")) {
      const c = cells(r);
      const sc = c.find((x) => /schoolname/.test(x.cls));
      if (!sc?.href) continue;
      const i = c.indexOf(sc);
      out.push({ slug: slugOf(sc.href, "schools"), name: sc.text, district, city: c[i + 1]?.text ?? "", state: c[i + 2]?.text ?? "" });
    }
  }
  return out;
}

export async function schools(site: "hs" | "college" = "hs"): Promise<School[]> {
  return parseSchools(await html(`${site === "hs" ? HS : COLLEGE}/schools/`, 7 * DAY));
}

// ---------- college rosters ----------

export type RosterSailor = { slug: string; name: string; year: number | null };

export function parseRoster(page: string): RosterSailor[] {
  const out: RosterSailor[] = [];
  for (const r of tableRows(page, "roster-table")) {
    const c = cells(r);
    const n = c.find((x) => /sailor-name/.test(x.cls));
    if (!n?.href) continue;
    const y = Number(c.find((x) => /sailor-year/.test(x.cls))?.text);
    out.push({ slug: slugOf(n.href, "sailors"), name: n.text, year: Number.isFinite(y) && y > 1900 ? y : null });
  }
  return out;
}

export async function collegeRoster(school: string, season: string): Promise<RosterSailor[]> {
  if (!/^[a-z0-9-]+$/.test(school)) return [];
  try {
    return parseRoster(await html(`${COLLEGE}/schools/${school}/${season}/roster/`, DAY));
  } catch {
    return [];
  }
}
