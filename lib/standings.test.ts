import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStandings, findSailor, nameMatches, percentile, type RawEntry } from "./standings";

const entry = (first: string, last: string, net: number, finals?: string, sail = "1"): RawEntry => ({
  registrationObject: { objectId: first, firstName: first, lastName: last, sailNumber: sail, assignments: finals ? { finals } : {} },
  scoring_data: [{ race_number: 2, points: 3, scores: 10 }, { race_number: 1, points: 5, scores: 10, throwout: true }],
  total: net + 5,
  net,
});

test("ranks by net when there are no finals fleets", () => {
  const s = computeStandings([entry("A", "X", 30), entry("B", "Y", 10), entry("C", "Z", 20)], "one_design");
  assert.deepEqual(s.map((x) => [x.name, x.place]), [["B Y", 1], ["C Z", 2], ["A X", 3]]);
  assert.equal(s[0].fleet, null);
  assert.deepEqual(s[0].races.map((r) => r.race), [1, 2]);
  assert.equal(s[0].races[0].drop, true);
});

test("Gold fleet places ahead of Silver even with a worse net", () => {
  const s = computeStandings(
    [entry("G1", "a", 50, "g"), entry("G2", "b", 40, "g"), entry("S1", "c", 10, "s"), entry("S2", "d", 200, "s")],
    "one_design_with_fleets",
  );
  // median net g=45, s=105 → g is Gold
  assert.deepEqual(s.map((x) => [x.name, x.place, x.fleet]), [
    ["G2 b", 1, "Gold"], ["G1 a", 2, "Gold"], ["S1 c", 3, "Silver"], ["S2 d", 4, "Silver"],
  ]);
});

test("name matching is accent/case-insensitive and needs every token", () => {
  assert.ok(nameMatches("José Álvarez", "jose alvarez"));
  assert.ok(nameMatches("Margot McGeagh", "Margot"));
  assert.ok(!nameMatches("Margot McGeagh", "Margot Smith"));
  assert.ok(!nameMatches("Al Bo", "Alice"));
});

test("findSailor disambiguates same names by sail number", () => {
  const s = computeStandings([entry("Sam", "Lee", 10, undefined, "100"), entry("Sam", "Lee", 20, undefined, "200")]);
  assert.equal(findSailor(s, "Sam Lee", "200")?.sail, "200");
  assert.equal(findSailor(s, "", "100")?.sail, "100");
  assert.equal(findSailor(s, "Nobody", ""), null);
});

test("percentile", () => {
  assert.equal(percentile(1, 11), 100);
  assert.equal(percentile(11, 11), 0);
  assert.equal(percentile(1, 1), null);
});

import { isGreenFleet, isOptiFleet } from "./fleets";

test("fleet classification", () => {
  for (const f of ["Opti Championship", "Optimist Red, White, and Blue (RWB)", "Opti Gold Fleet", "Optimist (White, Blue, Red)", "Green Fleet", "Opti Girls", "Optimist"]) {
    assert.ok(isOptiFleet(f), f);
  }
  for (const f of ["C420", "i420", "Racing", "ILCA 6", "Club 420"]) assert.ok(!isOptiFleet(f), f);
  assert.ok(isGreenFleet("Opti Green Fleet"));
  assert.ok(!isGreenFleet("Opti RWB"));
});

test("races a boat has no score for count as DNC (entries + 1)", () => {
  const full = (id: string, pts: number[]): RawEntry => ({
    registrationObject: { objectId: id, firstName: id, lastName: "x" },
    scoring_data: pts.map((p, i) => ({ race_number: i + 1, points: p, scores: 3 })),
    net: pts.reduce((a, b) => a + b, 0),
    total: pts.reduce((a, b) => a + b, 0),
  });
  const partial: RawEntry = {
    registrationObject: { objectId: "p", firstName: "p", lastName: "x" },
    scoring_data: [{ race_number: 1, points: 1, scores: 3 }],
    net: 1,
    total: 1,
  };
  const s = computeStandings([full("a", [2, 2, 2]), full("b", [3, 3, 3]), partial]);
  const p = s.find((x) => x.id === "p")!;
  assert.equal(p.net, 1 + 4 + 4); // two DNCs at 3 boats + 1
  assert.deepEqual(s.map((x) => x.id), ["a", "p", "b"]);
  assert.equal(p.races.filter((r) => r.letter === "DNC").length, 2);
});
