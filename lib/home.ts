// Live content for the home page: recently finished Optimist regattas with their
// winners, and what's coming up. Rendered on the server and cached for an hour.

import { fetchResults, parse, regattaInfo } from "./clubspot";
import { fleetTier } from "./fleets";

export type RecentRegatta = {
  id: string;
  name: string;
  date: string;
  club: string;
  fleet: string;
  boats: number;
  winner: string;
  winnerClub: string;
};
export type UpcomingRegatta = { id: string; name: string; date: string; club: string; location: string };

type Row = {
  objectId: string;
  name?: string;
  startDate?: { iso: string };
  clubObject?: { name?: string; city?: string; state?: string };
};

const within = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]).catch(() => null);

const PLACEHOLDER = /^\s*template\b|\(test\)|\btest\b|training|clinic|coaching|practice/i;

async function regattas(where: Record<string, unknown>, order: string, limit: number): Promise<Row[]> {
  const r = await parse<{ results?: Row[] }>("classes/regattas", {
    _method: "GET",
    where: { keywords: { $all: ["optimist"] }, archived: { $ne: true }, ...where },
    include: "clubObject",
    keys: "name,startDate,clubObject.name,clubObject.city,clubObject.state",
    order,
    limit,
  });
  return (r.results ?? []).filter((g) => g.name && g.startDate && !PLACEHOLDER.test(g.name));
}

export async function latestResults(count = 5): Promise<RecentRegatta[]> {
  const now = new Date();
  const since = new Date(now.getTime() - 75 * 864e5);
  const rows = await regattas(
    { startDate: { $lt: { __type: "Date", iso: now.toISOString() }, $gt: { __type: "Date", iso: since.toISOString() } } },
    "-startDate",
    16,
  );
  const out = await Promise.all(
    rows.map((g) =>
      within(
        (async (): Promise<RecentRegatta | null> => {
          const info = await regattaInfo(g.objectId);
          const cls = info?.classes.find((c) => fleetTier(c.name) === "champ") ?? info?.classes.find((c) => fleetTier(c.name) !== "green");
          if (!info || !cls) return null;
          const { standings } = await fetchResults(g.objectId, cls, g.startDate!.iso);
          if (standings.length < 6) return null;
          return {
            id: g.objectId,
            name: g.name!.trim(),
            date: g.startDate!.iso,
            club: g.clubObject?.name ?? "",
            fleet: cls.name,
            boats: standings.length,
            winner: standings[0].name,
            winnerClub: standings[0].club,
          };
        })(),
        8000,
      ),
    ),
  );
  return out.filter((x): x is RecentRegatta => x != null).slice(0, count);
}

export async function upcomingRegattas(count = 6): Promise<UpcomingRegatta[]> {
  const rows = await regattas({ startDate: { $gte: { __type: "Date", iso: new Date().toISOString() } } }, "startDate", count * 2);
  return rows.slice(0, count).map((g) => ({
    id: g.objectId,
    name: g.name!.trim(),
    date: g.startDate!.iso,
    club: g.clubObject?.name ?? "",
    location: [g.clubObject?.city, g.clubObject?.state].filter(Boolean).join(", "),
  }));
}
