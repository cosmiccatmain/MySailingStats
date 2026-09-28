// Classify Clubspot boat-class names.

export const isGreenFleet = (fleet: string) => /green/i.test(fleet);

/** Optimist fleets go by many names: "Opti Championship", "Optimist RWB", "Opti Gold", "Green Fleet"… */
export const isOptiFleet = (fleet: string) =>
  /\bopti|optimist|\brwb\b|\bred\b|\bwhite\b|\bblue\b|green|champ|\bgold\b|\bsilver\b|\bbronze\b/i.test(fleet) &&
  !/\b(c ?420|i ?420|420|laser|ilca|29er|sunfish|fj|club ?420|feva|byte|radial|wing ?foil)\b/i.test(fleet);
