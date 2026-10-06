"use client";

// The recruiter's program and recruiting board, kept in this browser.

import { useSyncExternalStore } from "react";

export type Program = {
  kind: "college" | "club";
  name: string;
  college: string; // Techscore college slug, when kind = college
  conference: string;
  district: string; // home ISSA district, for "near you"
  classes: number[]; // high school class years being recruited
  focus: "all" | "S" | "C";
};

export const STAGES = ["Watching", "Contacted", "Visit", "Offer", "Committed"] as const;
export type Stage = (typeof STAGES)[number];

export type BoardItem = {
  slug: string;
  name: string;
  school: string;
  year: number | null;
  district: string;
  score: number | null;
  stage: Stage;
  note: string;
  added: string;
};

type State = { program: Program | null; board: Record<string, BoardItem> };

const KEY = "mss:recruit";
const EVENT = "mss:recruit";
const EMPTY: State = { program: null, board: {} };

function read(): State {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as State) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

let cached: State | null = null;
function write(s: State) {
  cached = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: keep it for this visit */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const onStorage = () => {
    cached = read();
    cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useRecruit(): State {
  return useSyncExternalStore(subscribe, () => (cached ??= read()), () => EMPTY);
}

export const saveProgram = (program: Program) => write({ ...(cached ?? read()), program });

export function addToBoard(item: Omit<BoardItem, "stage" | "note" | "added"> & Partial<Pick<BoardItem, "stage" | "note">>) {
  const s = cached ?? read();
  const prev = s.board[item.slug];
  write({
    ...s,
    board: { ...s.board, [item.slug]: { ...{ stage: "Watching", note: "", added: new Date().toISOString() }, ...prev, ...item } as BoardItem },
  });
}

export function updateBoard(slug: string, patch: Partial<BoardItem>) {
  const s = cached ?? read();
  if (!s.board[slug]) return;
  write({ ...s, board: { ...s.board, [slug]: { ...s.board[slug], ...patch } } });
}

export function removeFromBoard(slug: string) {
  const s = cached ?? read();
  const board = { ...s.board };
  delete board[slug];
  write({ ...s, board });
}

/** Download the board as a CSV file. */
export function exportBoard(items: BoardItem[], programName: string) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [
    ["Name", "Class", "School", "District", "Recruit score", "Stage", "Notes", "Techscore"],
    ...items.map((i) => [i.name, i.year ?? "", i.school, i.district, i.score ?? "", i.stage, i.note, `https://scores.hssailing.org/sailors/${i.slug}/`]),
  ];
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(programName || "recruiting").replace(/[^\w]+/g, "-").toLowerCase()}-board.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
