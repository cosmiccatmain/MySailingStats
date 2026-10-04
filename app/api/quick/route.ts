import { quickStats } from "@/lib/quickstats";

export const maxDuration = 30;

// GET /api/quick?name=First+Last — headline stats for a sailor, for the search results page.
export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name")?.trim() ?? "";
  if (name.split(/\s+/).length < 2 || name.length > 80) return Response.json({ error: "full name required" }, { status: 400 });
  try {
    return Response.json(await quickStats(name), {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=86400" },
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
