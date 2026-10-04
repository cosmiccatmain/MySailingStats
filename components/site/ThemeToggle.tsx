"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { setTheme, useTheme, type ThemeChoice } from "@/lib/theme";

const OPTIONS: [ThemeChoice, string, typeof Sun][] = [
  ["light", "Light", Sun],
  ["dark", "Dark", Moon],
  ["system", "Auto", Monitor],
];

export function ThemeToggle() {
  const theme = useTheme();
  return (
    <div className="seg" role="radiogroup" aria-label="Appearance">
      {OPTIONS.map(([v, label, Icon]) => (
        <button key={v} type="button" role="radio" aria-checked={theme === v} onClick={() => setTheme(v)} title={`${label} theme`}>
          <Icon aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
