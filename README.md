# My Sailing Stats

Tracks a sailor's **Optimist results — USODA championships and local club regattas** — every regatta and
every race, with charts.

## How it gets the data

usoda.org and most US yacht-club regatta sites run on Clubspot, whose pages render in the browser from a
public API. The app calls the same endpoints server-side (`lib/clubspot.ts`):

| What | Endpoint |
|---|---|
| Every regatta the sailor registered for, at any club | Parse class `registrations`, matched on last name (indexed) then first name |
| Scores for the class (fleet) they sailed | `results.theclubspot.com/clubspot-results-v3` (≤ 2024) / `-v5` (2025+) |

The sailor's row is matched by registration id, so there's no guessing between same-named sailors in one
event. Clubspot returns raw race scores without placings, so `lib/standings.ts` ranks them: with
Gold/Silver finals every boat in a better finals fleet places ahead of every boat in a worse one,
otherwise by net then total points.

Green-fleet regattas are hidden by default (toggle on the page). Registrations without online scores
(PDF results, didn't race) are listed separately. Regattas scored outside Clubspot (Regatta Network,
Sailwave) aren't covered.

## Using it

Enter your name as it appears on registrations. Matches are kept in `localStorage`, and "Check for new
results" only re-checks regattas that aren't final yet. Share a view with `?name=First+Last`.
Set `NEXT_PUBLIC_DEFAULT_SAILOR` to pre-fill the sailor.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # scoring/matching unit tests
npm run typecheck
```
