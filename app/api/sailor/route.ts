import { findRegistrations } from "@/lib/clubspot";

export const maxDuration = 30;

// GET /api/sailor?name=First+Last — every Clubspot regatta this sailor registered for.
export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name")?.trim() ?? "";
  if (name.length < 2) return Response.json({ error: "name required" }, { status: 400 });
  try {
    const registrations = await findRegistrations(name);
    return Response.json(
      { registrations },
      { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=86400" } },
    );
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
