import { test } from "node:test";
import assert from "node:assert/strict";
import type { FieldRow, FieldRace } from "./field";
import { clubKey, clubTeams, headToHead, rivals, type LoadedRegatta } from "./analysis";
import { computeRatings, sailorKey } from "./rating";
import { fleetTier } from "./fleets";

const row = (n: string, p: number, races: (number | null)[], c = "Annapolis Yacht Club", start = 0): FieldRow => ({
  id: n,
  n,
  s: "",
  c,
  p,
  f: null,
  net: races.reduce((a: number, b) => a + (b ?? 0), 0),
  r: races.map((x): FieldRace | null => (x == null ? null : [x, null, start, 0])),
});

const reg = (id: string, date: string, field: FieldRow[], fleet = "Opti Championship"): LoadedRegatta => ({
  id, name: id, date, fleet, url: "", field,
});

test("head-to-head counts regattas and same-start races", () => {
  const regs = [
    reg("r1", "2024-01-01", [row("Ann", 1, [1, 2]), row("Bea", 2, [2, 1])]),
    reg("r2", "2024-02-01", [row("Bea", 1, [1, 1]), row("Ann", 2, [2, 2])]),
    reg("r3", "2024-03-01", [row("Ann", 1, [1])]),
  ];
  const h = headToHead(regs, sailorKey("Ann"), sailorKey("Bea"));
  assert.equal(h.regattas.length, 2);
  assert.equal(h.regattasA, 1);
  assert.equal(h.regattasB, 1);
  assert.equal(h.racesA, 1);
  assert.equal(h.racesB, 3);
});

test("races in different starts (Gold vs Silver finals) are not compared", () => {
  const regs = [reg("r1", "2024-01-01", [row("Ann", 1, [1], "X", 0), row("Bea", 50, [1], "X", 1)])];
  const h = headToHead(regs, sailorKey("Ann"), sailorKey("Bea"));
  assert.equal(h.racesA + h.racesB + h.racesTied, 0);
  assert.equal(h.regattasA, 1);
});

test("rivals need at least two shared regattas", () => {
  const regs = [
    reg("r1", "2024-01-01", [row("Me", 1, [1]), row("Riv", 2, [2]), row("Once", 3, [3])]),
    reg("r2", "2024-02-01", [row("Riv", 1, [1]), row("Me", 2, [2])]),
  ];
  const r = rivals(regs, sailorKey("Me"));
  assert.deepEqual(r.map((x) => [x.name, x.shared, x.ahead, x.behind]), [["Riv", 2, 1, 1]]);
});

test("club teams rank by the sum of the best three places", () => {
  const field = [
    row("a", 1, [1], "AYC"), row("b", 2, [2], "Hampton YC"), row("c", 3, [3], "Annapolis Yacht Club"),
    row("d", 4, [4], "Hampton YC"), row("e", 5, [5], "Hampton YC"), row("f", 6, [6], "annapolis yacht club"),
  ];
  const teams = clubTeams(field);
  assert.equal(clubKey("AYC"), clubKey("Annapolis Yacht Club"));
  assert.equal(teams[0].key, clubKey("Annapolis Yacht Club"));
  assert.equal(teams[0].teamScore, 1 + 3 + 6);
  assert.equal(teams[1].teamScore, 2 + 4 + 5);
  assert.equal(teams[0].teamRank, 1);
});

test("a mid-fleet Championship result outrates winning Green fleet", () => {
  const champField = Array.from({ length: 20 }, (_, i) => row(`C${i}`, i + 1, [i + 1, i + 1, i + 1]));
  champField.splice(9, 0, row("Me", 10, [10, 10, 10]));
  const greenField = Array.from({ length: 20 }, (_, i) => row(`G${i}`, i + 2, [i + 2, i + 2, i + 2]));
  greenField.unshift(row("Me", 1, [1, 1, 1]));
  const { history } = computeRatings(
    [
      { id: "green", date: "2024-01-01", tier: fleetTier("Green Fleet"), field: greenField },
      { id: "champ", date: "2024-06-01", tier: fleetTier("Opti Championship"), field: champField },
    ],
    [sailorKey("Me")],
  );
  const [g, c] = history.get(sailorKey("Me"))!;
  assert.equal(g.regattaId, "green");
  assert.ok(c.fieldStrength > g.fieldStrength, "champ field is stronger");
  assert.ok(c.performance > g.performance, `champ ${c.performance} > green ${g.performance}`);
  assert.ok(g.after > g.before, "winning raises your rating");
});
