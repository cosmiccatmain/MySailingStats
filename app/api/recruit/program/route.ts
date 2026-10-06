import { programRoster } from "@/lib/recruit";

export const maxDuration = 45;

// GET /api/recruit/program?college=stanford: a college team's roster by class
// year and the high schools it came from.
export async function GET(req: Request) {
  const slug = (new URL(req.url).searchParams.get("college") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) return Response.json({ error: "Pick a college" }, { status: 400 });
  const r = await programRoster(slug);
  if (!r) return Response.json({ error: "No Techscore team found" }, { status: 404 });
  return Response.json(r, { headers: { "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400" } });
}
