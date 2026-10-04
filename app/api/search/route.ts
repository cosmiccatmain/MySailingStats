import { search, SEARCH_TYPES, type SearchType } from "@/lib/search";

export const maxDuration = 30;

// GET /api/search?q=...&type=all|sailors|regattas|clubs|boats|coaches
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const q = (p.get("q") ?? "").trim().slice(0, 120);
  const type = (SEARCH_TYPES.find(([k]) => k === p.get("type"))?.[0] ?? "all") as SearchType;
  if (q.length < 2) return Response.json({ error: "Type at least 2 characters" }, { status: 400 });
  try {
    const results = await search(q, type);
    return Response.json(results, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
