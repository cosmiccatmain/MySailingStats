// Club names are free text on registrations and in search: "California Yacht Club",
// "California YC", "Calif. Y.C." and "CYC" can all mean the same club. Spelled-out
// suffixes are safe to fold together; bare initials are not ("AYC" is Annapolis,
// American or Atlantic Yacht Club), so an abbreviation only joins a full name when
// exactly one club in the same data set has those initials.

import { normalize } from "./standings";

// Short forms used at the end of club names, and what they stand for.
const SUFFIXES: [string, string][] = [
  ["yc", "yacht club"],
  ["sc", "sailing club"],
  ["sa", "sailing association"],
  ["ys", "yacht squadron"],
  ["bc", "boat club"],
  ["sf", "sailing foundation"],
  ["cc", "corinthian club"],
];
const NOISE = /\b(the|inc|jr|junior|juniors|sailing program|youth sailing|youth|program|team)\b/g;
const MINOR_WORDS = new Set(["of", "the", "and", "de", "la", "du", "at"]);

/** True for a bare abbreviation like "AYC" or "SSA" (one short all-letter word). */
export function isAbbreviation(name: string): boolean {
  return /^[a-z]{2,5}$/.test(normalize(name));
}

/** Canonical key for a club name: case, punctuation and spelled-out suffixes folded together. */
export function clubKey(club: string): string {
  let k = normalize(club).replace(NOISE, " ").replace(/\s+/g, " ").trim();
  // Only expand suffixes on multi-word names: "California YC" → "california yacht club", but "YC" alone stays.
  if (k.includes(" ")) {
    k = k.replace(/\b([a-z]) ([a-z])$/, "$1$2"); // "y c" from "Y.C."
    for (const [abbr, full] of SUFFIXES) k = k.replace(new RegExp(`\\b${abbr}$`), full);
  }
  return k.replace(/\s+/g, " ").trim();
}

/** "annapolis yacht club" → "ayc". */
export function initials(key: string): string {
  return key
    .split(" ")
    .filter((w) => w && !MINOR_WORDS.has(w))
    .map((w) => w[0])
    .join("");
}

/**
 * Resolve club names against each other: returns a function mapping any name to its
 * canonical key. An abbreviation maps to a full name only when that is the single club
 * in `names` with matching initials; otherwise it keeps its own key.
 */
export function clubResolver(names: Iterable<string>): (name: string) => string {
  const keys = new Set<string>();
  for (const n of names) if (n) keys.add(clubKey(n));
  const byInitials = new Map<string, Set<string>>();
  for (const k of keys) {
    if (!k.includes(" ")) continue;
    const i = initials(k);
    if (i.length < 2) continue;
    byInitials.set(i, (byInitials.get(i) ?? new Set()).add(k));
  }
  const alias = new Map<string, string>();
  for (const k of keys) {
    if (k.includes(" ") || !/^[a-z]{2,5}$/.test(k)) continue;
    const c = byInitials.get(k);
    if (c?.size === 1) alias.set(k, [...c][0]);
  }
  return (name: string) => {
    const k = clubKey(name);
    return alias.get(k) ?? k;
  };
}

/**
 * Alternative spellings to search for: "California Yacht Club" ↔ "California YC".
 * Returned as lowercase word lists ready for keyword matching.
 */
export function clubQueryVariants(q: string): string[][] {
  const base = normalize(q);
  if (!base) return [];
  const out = new Set<string>([base]);
  const expanded = clubKey(q);
  out.add(expanded);
  // Contract spelled-out suffixes the way clubs often abbreviate them.
  for (const [abbr, full] of SUFFIXES) if (expanded.endsWith(` ${full}`)) out.add(`${expanded.slice(0, -full.length)}${abbr}`);
  return [...out].map((s) => s.split(" ").filter((w) => w.length >= 2)).filter((ws) => ws.length);
}
