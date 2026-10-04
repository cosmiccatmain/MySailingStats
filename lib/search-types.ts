// Shared between the search API and the browser (no server-only imports).
export type SearchType = "all" | "sailors" | "regattas" | "clubs" | "boats" | "coaches";
export const SEARCH_TYPES: [SearchType, string][] = [
  ["all", "Everything"],
  ["sailors", "Sailors"],
  ["regattas", "Regattas"],
  ["clubs", "Clubs"],
  ["boats", "Boats"],
  ["coaches", "Coaches"],
];
