// Classify Clubspot boat-class names.

export const isGreenFleet = (fleet: string) => /green/i.test(fleet);

/** Optimist fleets go by many names: "Opti Championship", "Optimist RWB", "Opti Gold", "Green Fleet"… */
export const isOptiFleet = (fleet: string) =>
  /\bopti|optimist|\brwb\b|\bred\b|\bwhite\b|\bblue\b|green|champ|\bgold\b|\bsilver\b|\bbronze\b/i.test(fleet) &&
  !/\b(c ?420|i ?420|420|laser|ilca|29er|sunfish|fj|club ?420|feva|byte|radial|wing ?foil)\b/i.test(fleet);

/**
 * Level of competition, strongest first. Championship fleets (USODA champ,
 * Gold/Silver, girls, trials) > Red/White/Blue club fleets > Open club fleets
 * > Green (beginner) fleet.
 */
export type Tier = "champ" | "rwb" | "open" | "green";

export const TIERS: Tier[] = ["champ", "rwb", "open", "green"];

export const TIER_LABEL: Record<Tier, string> = {
  champ: "Championship",
  rwb: "Red/White/Blue",
  open: "Open",
  green: "Green",
};

/**
 * Fixed per tier, never re-ordered by filters. The three categorical slots
 * validate for colour-vision deficiency in both themes; "Open" is a neutral
 * catch-all. Marker shape is the secondary encoding.
 */
export const TIER_COLOR: Record<Tier, string> = {
  champ: "var(--series-1)",
  rwb: "var(--series-2)",
  open: "var(--series-neutral)",
  green: "var(--series-3)",
};

export const TIER_SHAPE: Record<Tier, "circle" | "diamond" | "square" | "triangle"> = {
  champ: "circle",
  rwb: "diamond",
  open: "square",
  green: "triangle",
};

export function fleetTier(fleet: string): Tier {
  if (isGreenFleet(fleet)) return "green";
  if (/champ|\bgold\b|\bsilver\b|\bbronze\b|\bemerald\b|girls|trials|national/i.test(fleet)) return "champ";
  if (/\brwb\b|\bred\b|\bwhite\b|\bblue\b/i.test(fleet)) return "rwb";
  return "open";
}
