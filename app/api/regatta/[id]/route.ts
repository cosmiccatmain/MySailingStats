import { fetchResults, listBoatClasses, pickChampClasses } from "@/lib/clubspot";
import { findSailor } from "@/lib/standings";

export const maxDuration = 60;

// GET /api/regatta/:id?date=ISO&name=First+Last&sail=12345
// Returns the Champ fleet summary for one regatta plus the sailor's row, if found.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9]{6,20}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const q = new URL(req.url).searchParams;
  const date = q.get("date") ?? new Date().toISOString();
  const name = q.get("name") ?? "";
  const sail = q.get("sail") ?? "";

  try {
    const classes = pickChampClasses(await listBoatClasses(id));
    if (!classes.length) {
      return cached({ id, fleet: null, entrants: 0, raceCount: 0, match: null, winner: null });
    }
    // Look through each champ-level class; report the one the sailor raced in.
    const all = await Promise.all(classes.map((c) => fetchResults(id, c, date).then((r) => ({ c, ...r }))));
    const found = all.map((r) => ({ ...r, match: findSailor(r.standings, name, sail) })).find((r) => r.match);
    const pick = found ?? all[0];
    const top = pick.standings[0];
    return cached({
      id,
      fleet: pick.c.name,
      entrants: pick.standings.length,
      raceCount: pick.raceCount,
      match: found?.match ?? null,
      winner: top ? { name: top.name, net: top.net } : null,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}

function cached(body: unknown) {
  return Response.json(body, {
    headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=604800" },
  });
}
