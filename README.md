# My Sailing Stats

**The global sailing search.** Search regattas, sailors, boats, coaches and clubs from one box, then open
any sailor's full dashboard: every regatta and race, fleet-strength ratings, Multi Compare and club team
results.

## Pages

| Route | What |
|---|---|
| `/` | Landing page + search box |
| `/search?q=&type=` | Results across sources (`lib/search.ts`, API `/api/search`) |
| `/dashboard?name=First+Last` | A sailor's dashboard (DashboardGo / DashboardPlus) |
| `/regatta/<id>`, `/club/<id>` | Clubspot regatta results and club pages |
| `/pricing` | Plans — Personal (Boater, Parent, Platinum) ⇄ Enterprise (Coach, Team/TeamPlus, Club) |

### Search sources

- **Clubspot** (includes every USODA event): regattas by keyword, clubs, sailors and coaches from
  registrations (last name), boats by sail number or boat name.
- **Regatta Network**: the public event calendar (`lib/regattanetwork.ts`), linked out to the event page.

### Credits and plans

Every search costs 100 credits; loading a sailor's history costs 100 the first time each month. Everyone
starts with 500 free credits. Plans (`lib/plans.ts`) set the monthly allowance and unlock features:
Club Search and CSV export (Boater+), Multi Compare (Parent: 3 sailors, Platinum: 6, enterprise more),
DashboardPlus — ratings, insights, Rival Radar (Platinum and enterprise).

**Billing is not connected.** The wallet (`lib/wallet.ts`) lives in the browser's localStorage and
choosing a plan activates it immediately — it's a demo of the product, not real enforcement. Hook up a
payment provider (e.g. Stripe Checkout + a server-side wallet) before charging anyone. The Club plan's
"Contact sales" composes an email to `NEXT_PUBLIC_SALES_EMAIL`.

## How it gets the data

usoda.org and most US yacht-club regatta sites run on Clubspot, whose pages render in the browser from a
public API. The app calls the same endpoints server-side (`lib/clubspot.ts`):

| What | Endpoint |
|---|---|
| Every regatta the sailor registered for, at any club | Parse class `registrations`, matched on last name (indexed) then first name |
| Scores for the class (fleet) they sailed | `results.theclubspot.com/clubspot-results-v3` (≤ 2024) / `-v5` (2025+) |

The sailor's row is matched by registration id, so there's no guessing between same-named sailors in one
event. Clubspot returns raw race scores without placings, so `lib/standings.ts` ranks them the way
Clubspot's results pages do:

- events with qualifying + finals: every boat in a better finals tier places ahead of every boat in a
  worse one. Tiers are found from qualifying ranks, so parallel splits (e.g. "Silver A/B/C" at the 2025
  Nationals) are merged and scored together;
- within a tier, by net points, ties broken with RRS A8 (best scores excluding discards, then last race);
- boats with no scored race are left out.

**Verified** boat-for-boat against Clubspot's rendered results (headless browser) for 7 events — 2024 and
2025 Nationals, 2024 Atlantic Coast Gold, Gibson Island RWB, AYC Junior Annual RWB, SSA Sandy MacVickar,
Wianno YC: 929 of 931 boats identical; the 2 others are all-DNC boats whose order is arbitrary.

## Features

- **Overview** — stat tiles, automatic insights, charts: results by fleet level (performance rating /
  % beaten / boats beaten), Championship vs Green, rating over time, every race, early vs late races,
  finish distribution, by season, and a fleet-level summary table.
- **Ratings** (`lib/rating.ts`) — multi-player Elo over every race of every fleet loaded: each race is a
  set of head-to-heads between boats in the same start. New sailors are seeded by fleet level
  (Championship 1500, RWB 1300, Open 1250, Green 1000), so a mid-fleet Championship result rates above a
  Green fleet win. A per-regatta performance rating = field strength ± 400 × (share of head-to-heads won − ½).
- **Regattas** — every regatta with race-by-race scores and the full leaderboard (you, club-mates, the
  boats around you), sortable by date, rating or finish.
- **Races** — every race you've sailed; CSV download.
- **Compare** — your most frequent rivals with win/loss records; compare with any sailor (their full
  Clubspot history is loaded): head-to-head regattas and same-start races, ratings over time, shared
  regattas with both boats highlighted.
- **Clubs** — search any club seen in your regattas: team score (sum of the best 3 places) and rank at
  each regatta, full club standings, club performance over time, and the club's sailors.
- Filters: season, Green fleet, other boats (420s etc.).

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
