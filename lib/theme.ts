"use client";

// Appearance: follow the system, or force light or dark. Stored per browser and
// applied before first paint by THEME_SCRIPT (see app/layout.tsx).

import { useSyncExternalStore } from "react";

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "mss:theme";
const EVENT = "mss:theme";

/** Runs inline in <head> so the page never flashes the wrong theme. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

function read(): ThemeChoice {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function setTheme(t: ThemeChoice) {
  try {
    if (t === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    /* storage blocked: still apply for this page view */
  }
  const root = document.documentElement;
  root.classList.add("theme-switching");
  if (t === "system") delete root.dataset.theme;
  else root.dataset.theme = t;
  window.dispatchEvent(new Event(EVENT));
  // Let colours cross-fade, then drop the transition so normal interactions stay snappy.
  window.setTimeout(() => root.classList.remove("theme-switching"), 320);
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useTheme(): ThemeChoice {
  return useSyncExternalStore(subscribe, read, () => "system");
}
