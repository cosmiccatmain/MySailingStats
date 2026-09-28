import { fetchResults, listBoatClasses, pickChampClass } from "@/lib/clubspot";
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
    const classes = await listBoatClasses(id);
    const champ = pickChampClass(classes);
    if (!champ) {
      return cached({ id, fleet: null, entrants: 0, raceCount: 0, match: null, winner: null });
    }
    const { standings, raceCount } = await fetchResults(id, champ, date);
    const match = findSailor(standings, name, sail);
    const winner = standings[0] ? { name: standings[0].name, net: standings[0].net } : null;
    return cached({ id, fleet: champ.name, entrants: standings.length, raceCount, match, winner });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}

function cached(body: unknown) {
  return Response.json(body, {
    headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=604800" },
  });
}
