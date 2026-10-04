"use client";

// The credit wallet: current plan, credits left this month, and renewal date.
// Billing isn't connected yet, so the wallet lives in this browser and
// choosing a plan activates it immediately (demo mode).

import { useSyncExternalStore } from "react";
import { CREDITS_PER_SEARCH, FREE_CREDITS, PLANS, type PlanId } from "./plans";

export type Wallet = {
  plan: PlanId;
  credits: number | null; // null = unlimited
  renewsAt: string | null;
  spent: number; // credits spent this period
};

const KEY = "mss:wallet";
const EVENT = "mss:wallet";
const DEFAULT: Wallet = { plan: "free", credits: FREE_CREDITS, renewsAt: null, spent: 0 };

function addMonth(d: Date): Date {
  const n = new Date(d);
  n.setMonth(n.getMonth() + 1);
  return n;
}

function read(): Wallet {
  try {
    const raw = localStorage.getItem(KEY);
    const w: Wallet = raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
    // Monthly renewal: allowances reset (they don't roll over).
    if (w.renewsAt && Date.now() >= Date.parse(w.renewsAt) && w.plan !== "free") {
      let next = new Date(w.renewsAt);
      while (Date.now() >= next.getTime()) next = addMonth(next);
      const plan = PLANS[w.plan];
      const renewed = { ...w, credits: Number.isFinite(plan.credits) ? plan.credits : null, renewsAt: next.toISOString(), spent: 0 };
      write(renewed);
      return renewed;
    }
    return w;
  } catch {
    return DEFAULT;
  }
}

function write(w: Wallet) {
  try {
    localStorage.setItem(KEY, JSON.stringify(w));
  } catch {
    /* storage blocked */
  }
  cached = w;
  window.dispatchEvent(new Event(EVENT));
}

let cached: Wallet | null = null;
const snapshot = () => (cached ??= read());
const serverSnapshot = () => DEFAULT;
function subscribe(cb: () => void) {
  const onChange = () => {
    cached = read();
    cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onChange);
  };
}

export function useWallet(): Wallet {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export const canAfford = (w: Wallet, cost = CREDITS_PER_SEARCH) => w.credits == null || w.credits >= cost;

/** Spend credits; returns false (and spends nothing) if the balance is too low. */
export function spend(cost = CREDITS_PER_SEARCH): boolean {
  const w = read();
  if (w.credits == null) {
    write({ ...w, spent: w.spent + cost });
    return true;
  }
  if (w.credits < cost) return false;
  write({ ...w, credits: w.credits - cost, spent: w.spent + cost });
  return true;
}

/** Activate a plan (demo: no payment is taken). Starts a fresh monthly allowance. */
export function choosePlan(id: PlanId) {
  const plan = PLANS[id];
  write({
    plan: id,
    credits: id === "free" ? FREE_CREDITS : Number.isFinite(plan.credits) ? plan.credits : null,
    renewsAt: id === "free" ? null : addMonth(new Date()).toISOString(),
    spent: 0,
  });
}

// Each sailor's results cost one search the first time they're loaded in a period.
const PAID_KEY = "mss:paid";
export function paidFor(key: string): boolean {
  try {
    const m = JSON.parse(localStorage.getItem(PAID_KEY) ?? "{}") as Record<string, string>;
    const w = read();
    // Current billing period started one month before the next renewal.
    const since = w.renewsAt ? (() => { const d = new Date(w.renewsAt!); d.setMonth(d.getMonth() - 1); return d.getTime(); })() : 0;
    return !!m[key] && Date.parse(m[key]) >= since;
  } catch {
    return false;
  }
}
export function markPaid(key: string) {
  try {
    const m = JSON.parse(localStorage.getItem(PAID_KEY) ?? "{}") as Record<string, string>;
    m[key] = new Date().toISOString();
    localStorage.setItem(PAID_KEY, JSON.stringify(m));
  } catch {
    /* storage blocked */
  }
}
