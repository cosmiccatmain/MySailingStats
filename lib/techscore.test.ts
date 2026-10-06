import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { finishPct, scoreResults } from "./recruit";
import { levelOf, nameYear, parseRegattaSailors, parseRoster, parseSailor, parseSchools, parseSeason, recentSeasons } from "./techscore";

const fx = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");

test("name and class year", () => {
  assert.deepEqual(nameYear("Christopher Small '26"), { name: "Christopher Small", year: 2026 });
  assert.deepEqual(nameYear("Ellery Kloc '26 *"), { name: "Ellery Kloc", year: 2026 });
  assert.deepEqual(nameYear("No Year"), { name: "No Year", year: null });
});

test("season codes run newest first", () => {
  assert.deepEqual(recentSeasons(4, new Date("2026-10-06")), ["f26", "s26", "f25", "s25"]);
  assert.deepEqual(recentSeasons(3, new Date("2026-03-01")), ["s26", "f25", "s25"]);
});

test("event levels", () => {
  assert.equal(levelOf("National Invitational"), "national");
  assert.equal(levelOf("District Champ Qualifier"), "championship");
  assert.equal(levelOf("In-District"), "invitational");
  assert.equal(levelOf("", "ISSA 2025 Atlantic Coast Championship"), "national");
});

test("season list", () => {
  const rows = parseSeason(fx("ts-season.html"), "f26");
  assert.ok(rows.length >= 10);
  const r = rows.find((x) => x.slug === "njisa-2026-fall-fleet")!;
  assert.equal(r.name, "NJISA 2026 Fall Fleet Championship");
  assert.equal(r.type, "League Championship");
  assert.equal(r.scoring, "2 Divisions");
  assert.equal(r.date, "2026-10-03");
  assert.equal(r.official, true);
  assert.equal(r.level, "championship");
  assert.equal(rows.find((x) => x.slug === "2026-pcisa-sea-otter-gold")!.official, false);
});

test("regatta registrations with crew changes", () => {
  const p = parseRegattaSailors(fx("ts-regatta-sailors.html"));
  assert.equal(p.boat, "CFJ & Z420s");
  assert.equal(p.type, "National Invitational Regatta");
  const bain = p.entries.filter((e) => e.schoolSlug === "bainbridge");
  assert.equal(bain.length, 2);
  assert.equal(bain[0].div, "A");
  assert.equal(bain[0].rank, 13);
  assert.equal(bain[0].skippers[0].name, "Nelson Dorsey");
  assert.equal(bain[0].skippers[0].year, 2026);
  assert.deepEqual(bain[0].crews.map((c) => c.slug), ["beckett-ladenburg", "daniel-chapman"]);
  assert.equal(bain[1].div, "B");
  assert.deepEqual(bain[1].crews.map((c) => c.races), ["1-4,9-12", "5-8,13"]);
  const barr = p.entries.filter((e) => e.schoolSlug === "barrington");
  assert.equal(barr[1].crews.length, 3);
  // Reserves aren't racers.
  assert.ok(!p.entries.some((e) => [...e.skippers, ...e.crews].some((s) => s.slug === "sophia-lapine")));
});

test("sailor profile history", () => {
  const s = parseSailor(fx("ts-sailor.html"), "christopher-small");
  assert.equal(s.name, "Christopher Small");
  assert.equal(s.year, 2026);
  assert.equal(s.school, "Christian Brothers");
  assert.equal(s.schoolSlug, "christian-brothers");
  assert.equal(s.district, "MASSA");
  assert.equal(s.regattaCount, 12);
  const ac = s.history.find((h) => h.regattaSlug === "issa-2025-atlantic-coast")!;
  assert.deepEqual([ac.season, ac.role, ac.place, ac.of, ac.div, ac.level, ac.date], ["f25", "Skipper", 1, 18, "A", "national", "2025-11-08"]);
  const k = s.history.find((h) => h.regattaSlug === "massa-2025-keelboat")!;
  assert.deepEqual([k.role, k.place, k.of, k.div], ["Crew", 2, 7, null]);
  assert.equal(s.history[0].date >= s.history[s.history.length - 1].date, true);
});

test("schools index carries the district", () => {
  const list = parseSchools(fx("ts-schools.html"));
  const a = list.find((x) => x.slug === "annapolis")!;
  assert.deepEqual([a.name, a.district, a.city, a.state], ["Annapolis High School", "MASSA", "Annapolis", "MD"]);
});

test("college roster", () => {
  const r = parseRoster(fx("ts-roster.html"));
  assert.equal(r.length, 6);
  assert.deepEqual(r[1], { slug: "griggs-diemar", name: "Griggs Diemar", year: 2025 });
});

test("recruit score rewards strong finishes at bigger events", () => {
  assert.equal(finishPct(1, 18), 1);
  assert.equal(finishPct(18, 18), 0);
  const d = "2026-05-01";
  const nat = scoreResults([{ date: d, level: "national", rank: 2, teams: 20 }, { date: d, level: "national", rank: 3, teams: 20 }]);
  const local = scoreResults([{ date: d, level: "invitational", rank: 2, teams: 20 }, { date: d, level: "invitational", rank: 3, teams: 20 }]);
  assert.ok(nat.score > local.score);
  // One result shouldn't outrank a long consistent record.
  const one = scoreResults([{ date: d, level: "national", rank: 1, teams: 20 }]);
  const many = scoreResults(Array.from({ length: 8 }, () => ({ date: d, level: "national" as const, rank: 2, teams: 20 })));
  assert.ok(many.score > one.score);
});
