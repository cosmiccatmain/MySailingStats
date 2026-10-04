// Regatta Network (regattanetwork.com): upcoming events from its public
// calendar page. It has no search API, so we parse the calendar (cached) and
// filter it ourselves.

const CALENDAR_URL = "https://www.regattanetwork.com/html/calendar.php";

export type RNEvent = { id: string; name: string; club: string; state: string; date: string | null; url: string };

const strip = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\[[^\]]*\]/g, " ") // "[ Event Website ] [ NOR ]" link labels
    .replace(/\s+/g, " ")
    .trim();

export function parseCalendar(html: string): RNEvent[] {
  const out: RNEvent[] = [];
  for (const chunk of html.split("<!--EVENT INFORMATION:-->").slice(1)) {
    const id = chunk.match(/name="id(\d+)"/)?.[1];
    if (!id) continue;
    const d = chunk.match(/(\d{2})\/(\d{2})\/(\d{2})/);
    const cell = chunk.split(/name="id\d+"\s*><\/a>/)[1] ?? "";
    const parts = cell.split(/<br\s*\/?>/i).map(strip).filter(Boolean);
    if (!parts[0]) continue;
    out.push({
      id,
      name: parts[0],
      club: parts[1] ?? "",
      state: chunk.match(/data-state="([^"]*)"/)?.[1] ?? "",
      date: d ? `20${d[3]}-${d[1]}-${d[2]}` : null,
      url: `https://www.regattanetwork.com/event/${id}`,
    });
  }
  return out;
}

export async function searchRegattaNetwork(tokens: string[]): Promise<RNEvent[]> {
  try {
    const res = await fetch(CALENDAR_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (MySailingStats)" },
      next: { revalidate: 6 * 3600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const events = parseCalendar(await res.text());
    return events.filter((e) => {
      const hay = `${e.name} ${e.club} ${e.state}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  } catch {
    return []; // Regatta Network down or slow: Clubspot results still return
  }
}
