import { findRegistrations } from "@/lib/clubspot";

export const maxDuration = 30;

// GET /api/upcoming?name=First+Last — regattas this sailor is registered for that haven't happened yet.
export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name")?.trim() ?? "";
  if (name.length < 2) return Response.json({ error: "name required" }, { status: 400 });
  try {
    const upcoming = (await findRegistrations(name, "upcoming"))
      .filter((r) => !/coach|spectator/i.test(r.className))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(({ regattaId, regatta, date, club, className }) => ({ regattaId, regatta, date, club, fleet: className }));
    return Response.json({ upcoming }, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400" } });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
