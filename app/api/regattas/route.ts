import { listRegattas } from "@/lib/clubspot";

export const maxDuration = 30;

export async function GET() {
  try {
    const regattas = await listRegattas();
    return Response.json(
      { regattas },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
