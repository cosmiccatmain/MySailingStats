# My Sailing Stats

Tracks a sailor's **USODA Optimist Championship-fleet** results — every regatta and every race in the
[usoda.org results archive](https://www.usoda.org/results-archive) — with charts.

## How it gets the data

usoda.org is a Clubspot site whose results pages render in the browser, so the app calls the same
public endpoints those pages use (server-side, in `lib/clubspot.ts`):

| What | Endpoint |
|---|---|
| Archive (all USODA regattas) | Parse cloud function `retrieve_regattas_for_calendar_v2` for club `kujycb4Vou` |
| Fleets in a regatta | Parse class `boatClasses` → the "Opti Championship" class |
| Scores | `results.theclubspot.com/clubspot-results-v3` (≤ 2024) / `-v5` (2025+) |

Clubspot returns raw race scores without placings, so `lib/standings.ts` ranks them: with Gold/Silver
finals every boat in a better finals fleet places ahead of every boat in a worse one, otherwise by net
then total points.

## Using it

Enter your name as registered with USODA (sail number optional). The browser scans the archive
(~150 regattas, 6 at a time), keeps matches in `localStorage`, and "Check for new results" only
re-checks regattas it hasn't finalised. Share a view with `?name=First+Last&sail=12345`.
Set `NEXT_PUBLIC_DEFAULT_SAILOR` to pre-fill the sailor.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # scoring/matching unit tests
npm run typecheck
```
