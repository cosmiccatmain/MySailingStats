"use client";

import { BarChart3, ChevronDown, CreditCard, Gauge, Search, User, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Logo } from "./Art";
import { ThemeToggle } from "./ThemeToggle";
import { FREE_CREDITS, fmtCredits, hasFeature, PLANS } from "@/lib/plans";
import { useWallet } from "@/lib/wallet";

const initialsOf = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

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
      <Gauge aria-hidden />
      {w.credits == null ? "Unlimited" : fmtCredits(w.credits)}
      <span className="lbl">credits</span>
    </Link>
  );
}

const LINKS: [string, string][] = [
  ["/", "Search"],
  ["/dashboard", "Dashboard"],
  ["/pricing", "Pricing"],
  ["/pricing?for=enterprise", "Teams"],
];

export function SiteHeader() {
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
  const left = w.credits;
  const pctLeft = left == null || !Number.isFinite(allowance) ? 100 : Math.max(0, Math.min(100, (left / allowance) * 100));

  return (
    <header className="nav-bar">
      <div className="container nav-inner">
        <Link href="/" className="logo" aria-label="MySailingStats home">
          <Logo />
          <span>MySailingStats</span>
        </Link>
        <nav className="nav-links" aria-label="Main">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} aria-current={path === href.split("?")[0] && (href !== "/pricing?for=enterprise") ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="nav-right" ref={ref}>
          <CreditsPill />
          <button className="account-btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)} aria-label="Account menu">
            <span className="av" aria-hidden>
              {name ? initialsOf(name) : <User />}
            </span>
            <span className="nm">{name ? name.split(" ")[0] : "Account"}</span>
            <ChevronDown aria-hidden />
          </button>
          {open && (
            <div className="dropdown acct-menu" role="menu">
              <div className="acct-plan">
                <div className="top">
                  <b>{plan.name} plan</b>
                  <span className="badge plain" style={{ ["--tier" as string]: plus ? "var(--accent)" : "var(--text-secondary)" }}>
                    {plus ? "DashboardPlus" : "DashboardGo"}
                  </span>
                </div>
                <div className="meter" aria-hidden>
                  <span style={{ width: `${pctLeft}%` }} />
                </div>
                <div className="meta">
                  <span>{left == null ? "Unlimited credits" : `${fmtCredits(left)} credits left`}</span>
                  {w.renewsAt ? (
                    <span>Renews {new Date(w.renewsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  ) : (
                    <Link className="upgrade" href="/pricing">
                      Upgrade
                    </Link>
                  )}
                </div>
              </div>
              <MenuLink href="/" icon={<Search />} title="Search" sub="Regattas, sailors, boats, clubs" />
              <MenuLink
                href="/dashboard"
                icon={<BarChart3 />}
                title={name ? `${name}` : "My dashboard"}
                sub={name ? `Open ${plus ? "DashboardPlus" : "DashboardGo"}` : "Set up your sailor"}
              />
              <MenuLink href="/pricing" icon={<CreditCard />} title="Plans & pricing" sub="Boater, Parent, Platinum" />
              <MenuLink href="/pricing?for=enterprise" icon={<Users />} title="Coaches & teams" sub="Coach, Team, TeamPlus, Club" />
              <hr />
              <div className="theme-row">
                <span>Appearance</span>
                <ThemeToggle />
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuLink({ href, icon, title, sub }: { href: string; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <Link href={href} role="menuitem" className="menu-item">
      <span className="mi-ico" aria-hidden>
        {icon}
      </span>
      <span className="mi-text">
        <span>{title}</span>
        <small>{sub}</small>
      </span>
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <span>© {new Date().getFullYear()} MySailingStats. Results from Clubspot and Regatta Network.</span>
        <nav aria-label="Footer">
          <Link href="/">Search</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/pricing?for=enterprise">Coaches & teams</Link>
        </nav>
      </div>
    </footer>
  );
}

/** Standard page frame: header, content, footer. */
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
