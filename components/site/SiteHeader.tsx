"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Logo } from "./Art";
import { ThemeToggle } from "./ThemeToggle";
import { FREE_CREDITS, fmtCredits, hasFeature, PLANS } from "@/lib/plans";
import { useWallet } from "@/lib/wallet";

/** The sailor saved on this browser (set from the dashboard). */
function useProfileName(): string {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      window.addEventListener("mss:profile", cb);
      return () => {
        window.removeEventListener("storage", cb);
        window.removeEventListener("mss:profile", cb);
      };
    },
    () => {
      try {
        return (JSON.parse(localStorage.getItem("mss:profile") ?? "null") as { name?: string } | null)?.name ?? "";
      } catch {
        return "";
      }
    },
    () => "",
  );
}

export function CreditsPill() {
  const w = useWallet();
  return (
    <Link href="/pricing" className="credits" title="Credits left this month. Each search uses 100.">
      <b>{w.credits == null ? "Unlimited" : fmtCredits(w.credits)}</b> <span className="lbl">credits</span>
    </Link>
  );
}

/** Logo on the left, credits and the Menu pill on the right. `bar` pins it to the top of inner pages. */
export function SiteHeader({ variant = "bar" }: { variant?: "bar" | "shell" }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const w = useWallet();
  const name = useProfileName();
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
  useEffect(() => setOpen(false), [path]);

  const plan = PLANS[w.plan];
  const plus = hasFeature(w.plan, "dashboardPlus");
  const allowance = w.plan === "free" ? FREE_CREDITS : plan.credits;
  const pctLeft = w.credits == null || !Number.isFinite(allowance) ? 100 : Math.max(0, Math.min(100, (w.credits / allowance) * 100));

  return (
    <header className={`nav-bar${variant === "bar" ? " bar" : ""}`}>
      <div className={`nav-inner${variant === "bar" ? " container" : ""}`}>
        <Link href="/" className="logo" aria-label="MySailingStats home">
          <Logo />
          <span>MySailingStats</span>
        </Link>
        <div className="nav-right" ref={ref}>
          <CreditsPill />
          <button className="menu-btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>
            <span className="bars" aria-hidden>
              <i />
              <i />
            </span>
            Menu
          </button>
          {open && (
            <div className="menu-panel" role="menu">
              <div className="mp-col">
                <h4>Find</h4>
                <Link className="mp-link" href="/" role="menuitem">
                  <b>Search</b>
                  <small>Regattas, sailors, sail numbers, clubs</small>
                </Link>
                <Link className="mp-link" href="/dashboard" role="menuitem">
                  <b>{name || "My dashboard"}</b>
                  <small>{name ? "Your results and stats" : "Set up your sailor"}</small>
                </Link>
                <Link className="mp-link" href="/recruit" role="menuitem">
                  <b>Recruiter</b>
                  <small>High school prospects for your team</small>
                </Link>
              </div>
              <div className="mp-col">
                <h4>Plans</h4>
                <Link className="mp-link" href="/pricing" role="menuitem">
                  <b>Personal plans</b>
                  <small>Boater, Parent, Platinum</small>
                </Link>
                <Link className="mp-link" href="/pricing?for=enterprise" role="menuitem">
                  <b>Coaches and teams</b>
                  <small>Coach, Recruiter, Team, Club</small>
                </Link>
              </div>
              <div className="mp-col mp-account">
                <h4>Your account</h4>
                <div className="plan">
                  {plan.name}
                  <small>{plus ? "DashboardPlus" : "DashboardGo"}</small>
                </div>
                <div className="meter" aria-hidden>
                  <span style={{ width: `${pctLeft}%` }} />
                </div>
                <div className="cr">
                  <span>
                    <b>{w.credits == null ? "Unlimited" : fmtCredits(w.credits)}</b> credits left
                  </span>
                  {w.renewsAt ? (
                    <span>Renews {new Date(w.renewsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  ) : (
                    <Link href="/pricing">Upgrade</Link>
                  )}
                </div>
                <div className="theme">
                  Appearance
                  <ThemeToggle />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="brand-col">
          <Link href="/" className="logo" aria-label="MySailingStats home">
            <Logo />
            <span>MySailingStats</span>
          </Link>
          <p>Results, rankings and race-by-race history from Clubspot, Regatta Network and Techscore, checked against the official results.</p>
        </div>
        <div>
          <h4>Find</h4>
          <nav>
            <Link href="/">Search</Link>
            <Link href="/dashboard">My dashboard</Link>
            <Link href="/recruit">Recruiter</Link>
          </nav>
        </div>
        <div>
          <h4>Plans</h4>
          <nav>
            <Link href="/pricing">Personal plans</Link>
            <Link href="/pricing?for=enterprise">Coaches and teams</Link>
          </nav>
        </div>
        <div>
          <h4>Sources</h4>
          <nav>
            <a href="https://theclubspot.com" target="_blank" rel="noreferrer">
              Clubspot
            </a>
            <a href="https://www.regattanetwork.com" target="_blank" rel="noreferrer">
              Regatta Network
            </a>
            <a href="https://scores.hssailing.org" target="_blank" rel="noreferrer">
              Techscore
            </a>
          </nav>
        </div>
        <div className="credit">
          © {new Date().getFullYear()} MySailingStats. Home page photo:{" "}
          <a href="https://commons.wikimedia.org/wiki/File:005-_Optimist_(Loctudy_2012).jpg" target="_blank" rel="noreferrer">
            jakez29120
          </a>
          ,{" "}
          <a href="https://creativecommons.org/licenses/by-sa/2.0/" target="_blank" rel="noreferrer">
            CC BY-SA 2.0
          </a>
          .
        </div>
      </div>
    </footer>
  );
}

/** Standard page frame: header bar, content, footer. */
export function SitePage({ children }: { children: React.ReactNode }) {
  return (
    <div className="page">
      <SiteHeader />
      <main className="container" style={{ flex: 1 }}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
