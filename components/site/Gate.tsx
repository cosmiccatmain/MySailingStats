"use client";

import { Gauge, Lock } from "lucide-react";
import Link from "next/link";
import { CREDITS_PER_SEARCH, FEATURE_LABEL, planFor, type Feature } from "@/lib/plans";

/** Shown in place of a feature the current plan doesn't include. */
export function Locked({ feature, title, text, wide }: { feature: Feature; title?: string; text: string; wide?: boolean }) {
  const p = planFor(feature);
  return (
    <div className={`locked-card fx-in${wide ? " wide" : ""}`}>
      <span className="ico" aria-hidden>
        <Lock />
      </span>
      <span className="tag">{FEATURE_LABEL[feature]}</span>
      <h3>{title ?? FEATURE_LABEL[feature]}</h3>
      <p>{text}</p>
      <Link className="btn btn-primary btn-sm" href="/pricing">
        Available on {p.name}
      </Link>
    </div>
  );
}

/** Shown when a search or sailor load would overdraw the wallet. */
export function OutOfCredits({ what }: { what: string }) {
  return (
    <div className="locked-card wide fx-in" style={{ minHeight: 0 }}>
      <span className="ico" aria-hidden>
        <Gauge />
      </span>
      <h3>You&rsquo;re out of credits</h3>
      <p>
        {what} uses {CREDITS_PER_SEARCH} credits. Choose a plan to get a monthly allowance.
      </p>
      <Link className="btn btn-primary btn-sm" href="/pricing">
        See plans
      </Link>
    </div>
  );
}
