import { collegeList } from "@/lib/recruit";

// GET /api/recruit/colleges: every ICSA team on Techscore, for program setup.
export async function GET() {
  try {
    const list = await collegeList();
    return Response.json({ colleges: list }, { headers: { "Cache-Control": list.length ? "public, s-maxage=604800" : "no-store" } });
  } catch (err) {
    return Response.json({ error: (err as Error).message, colleges: [] }, { status: 502 });
  }
}
