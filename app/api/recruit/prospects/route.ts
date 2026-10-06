import { buildPool } from "@/lib/recruit";

export const maxDuration = 60;

// GET /api/recruit/prospects: every high school sailor with championship-level
// results in the last two years, ranked. Cached at the edge for six hours.
export async function GET() {
  try {
    const pool = await buildPool(4);
    // Keep the payload lean: a single local regatta says little.
    const prospects = pool.prospects.filter((p) => p.events >= 2 || p.national > 0);
    return Response.json(
      { ...pool, prospects },
      { headers: { "Cache-Control": prospects.length ? "public, s-maxage=21600, stale-while-revalidate=86400" : "no-store" } },
    );
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
