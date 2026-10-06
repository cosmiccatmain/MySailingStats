import { prospectDetail } from "@/lib/recruit";

export const maxDuration = 30;

// GET /api/recruit/sailor/:slug: a high school sailor's full Techscore history.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = await prospectDetail(slug);
  if (!d) return Response.json({ error: "Sailor not found" }, { status: 404 });
  return Response.json(d, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
}
