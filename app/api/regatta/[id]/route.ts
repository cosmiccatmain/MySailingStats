import { fetchResults } from "@/lib/clubspot";
import { toField } from "@/lib/field";

export const maxDuration = 60;

const ID = /^[A-Za-z0-9]{6,20}$/;

// GET /api/regatta/:id?class=<boatClassId>&reg=<registrationId>&date=ISO&method=<scoring>
// Results for one class (fleet) of a regatta: the sailor's row (found by
// registration id) plus the whole fleet in compact form.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  const classId = q.get("class") ?? "";
  const reg = q.get("reg") ?? "";
  if (!ID.test(id) || !ID.test(classId) || !ID.test(reg)) {
    return Response.json({ error: "bad params" }, { status: 400 });
  }
  const date = q.get("date") ?? new Date().toISOString();
  try {
    const { standings, raceCount } = await fetchResults(
      id,
      { id: classId, name: "", method: q.get("method") || null },
      date,
    );
    const match = standings.find((s) => s.id === reg) ?? null;
    const top = standings[0];
    return Response.json(
      {
        entrants: standings.length,
        raceCount,
        match,
        winner: top ? { name: top.name, net: top.net } : null,
        field: toField(standings, raceCount),
      },
      { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=604800" } },
    );
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
