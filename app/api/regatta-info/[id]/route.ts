import { regattaInfo } from "@/lib/clubspot";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9]{6,20}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  try {
    const info = await regattaInfo(id);
    if (!info) return Response.json({ error: "Regatta not found" }, { status: 404 });
    return Response.json(info, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
