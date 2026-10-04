"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./Art";
import { fmtCredits, PLANS } from "@/lib/plans";
import { useWallet } from "@/lib/wallet";

export function CreditsPill() {
  const w = useWallet();
  return (
    <Link href="/pricing" className="s-credits" title="Credits left this month — 100 per search">
      <span className="gem" aria-hidden>
        ◆
      </span>
      {w.credits == null ? "Unlimited" : fmtCredits(w.credits)}
      <span className="lbl muted">credits</span>
    </Link>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const w = useWallet();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const plan = PLANS[w.plan];
  return (
    <header className="s-header">
      <Link href="/" className="s-logo" aria-label="MySailingStats home">
        <Logo />
        <span>MySailingStats</span>
      </Link>
      <div className="s-head-right" ref={ref}>
        <CreditsPill />
        <button className="s-menu-btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
          Menu
        </button>
        {open && (
          <nav className="s-menu" role="menu" onClick={() => setOpen(false)}>
            <Link href="/" role="menuitem">
              Search <small>regattas, sailors, clubs…</small>
            </Link>
            <Link href="/dashboard" role="menuitem">
              My dashboard <small>{plan.features.includes("dashboardPlus") ? "DashboardPlus" : "DashboardGo"}</small>
            </Link>
            <Link href="/pricing" role="menuitem">
              Plans & pricing <small>Boater · Parent · Platinum</small>
            </Link>
            <Link href="/pricing?for=enterprise" role="menuitem">
              For coaches & teams <small>Enterprise</small>
            </Link>
            <div className="s-menu-plan">
              <b>{plan.name} plan</b> · {w.credits == null ? "unlimited" : fmtCredits(w.credits)} credits left
              {w.renewsAt ? ` · renews ${new Date(w.renewsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="s-footer">
      <span>© {new Date().getFullYear()} MySailingStats · Results from Clubspot and Regatta Network</span>
      <nav>
        <Link href="/">Search</Link>
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/pricing?for=enterprise">Enterprise</Link>
      </nav>
    </footer>
  );
}
