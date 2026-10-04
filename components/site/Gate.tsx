"use client";

import Link from "next/link";
import { CREDITS_PER_SEARCH, FEATURE_LABEL, planFor, type Feature } from "@/lib/plans";

/** Teaser card shown in place of a feature the current plan doesn't include. */
export function Locked({ feature, title, text, wide }: { feature: Feature; title?: string; text: string; wide?: boolean }) {
  const p = planFor(feature);
  return (
    <div className={`card gate-card${wide ? " wide" : ""}`}>
      <span className="gate-lock" aria-hidden>
        🔒
      </span>
      <div>
        <b>{title ?? FEATURE_LABEL[feature]}</b>
        <p className="muted small" style={{ margin: "4px 0 10px" }}>
          {text}
        </p>
        <Link className="s-btn navy" href="/pricing">
          Unlock with {p.name}
        </Link>
      </div>
    </div>
  );
}

/** Shown when a search or sailor load would overdraw the wallet. */
export function OutOfCredits({ what }: { what: string }) {
  return (
    <div className="card gate-card wide">
      <span className="gate-lock" aria-hidden>
        ⚡
      </span>
      <div>
        <b>You&rsquo;re out of credits</b>
        <p className="muted small" style={{ margin: "4px 0 10px" }}>
          {what} costs {CREDITS_PER_SEARCH} credits. Pick a plan to top up your monthly allowance.
        </p>
        <Link className="s-btn navy" href="/pricing">
          See plans
        </Link>
      </div>
    </div>
  );
}
