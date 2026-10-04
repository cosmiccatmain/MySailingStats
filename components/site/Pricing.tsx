"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CREDITS_PER_SEARCH, FREE_CREDITS, PERSONAL_PLANS, PLANS, fmtCredits, type Plan, type PlanId } from "@/lib/plans";
import { choosePlan, useWallet } from "@/lib/wallet";

const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL || "sales@mysailingstats.com";

/** Two-option pill slider. */
function Slider<T extends string>({ value, options, onChange, small, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; small?: boolean; label: string }) {
  const i = Math.max(0, options.findIndex(([v]) => v === value));
  const pad = small ? 3 : 5;
  return (
    <div className={`p-switch${small ? " small" : ""}`} role="radiogroup" aria-label={label} style={{ display: "inline-grid", gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      <span className="knob" aria-hidden style={{ left: `calc(${(i * 100) / options.length}% + ${i === 0 ? pad : 0}px)`, width: `calc(${100 / options.length}% - ${pad}px)` }} />
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={v === value} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

function PlanCard({ plan, current, onChoose, top, dark }: { plan: Plan; current: boolean; onChoose: (p: Plan) => void; top?: React.ReactNode; dark?: boolean }) {
  const perSearch = Number.isFinite(plan.credits) ? Math.floor(plan.credits / CREDITS_PER_SEARCH) : null;
  return (
    <div className={`p-card${plan.highlight && !dark ? " hl" : ""}${dark ? " dark" : ""}`}>
      {plan.highlight && <span className="p-ribbon">{plan.enterprise ? "Best for programs" : "Most popular"}</span>}
      <div className="p-name">
        <span>{plan.name}</span>
        {current && <span className="p-current">Current plan</span>}
      </div>
      {top}
      {plan.price == null ? (
        <div className="p-price" style={{ fontSize: 40 }}>
          Let&rsquo;s talk
        </div>
      ) : (
        <div className="p-price">
          ${plan.price % 1 ? plan.price.toFixed(2) : plan.price}
          <small> / month</small>
        </div>
      )}
      <span className="p-credits">⚡ {fmtCredits(plan.credits)} credits / mo</span>
      <p className="p-blurb">{plan.blurb}</p>
      <div className="p-per">{perSearch != null ? `≈ ${perSearch.toLocaleString("en-US")} searches a month` : "Unlimited searches"}</div>
      <ul>
        {plan.perks.map((p) => (
          <li key={p.text}>
            <span>
              {p.text}
              {p.soon && <span className="p-soon">Soon</span>}
            </span>
          </li>
        ))}
      </ul>
      {plan.price == null ? (
        <button type="button" className={`s-btn block ${dark ? "white" : "navy"}`} onClick={() => onChoose(plan)}>
          Contact sales
        </button>
      ) : (
        <button type="button" className={`s-btn block ${dark ? "white" : current ? "ghost" : "navy"}`} disabled={current} onClick={() => onChoose(plan)}>
          {current ? "You're on this plan" : `Choose ${plan.name}`}
        </button>
      )}
    </div>
  );
}

function SalesModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [sailors, setSailors] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const body = `Name: ${name}\nClub / organization: ${org}\nApprox. sailors: ${sailors}\n\n${msg}`;
  const href = `mailto:${SALES_EMAIL}?${new URLSearchParams({ subject: `Club plan — ${org || "inquiry"}`, body }).toString().replace(/\+/g, "%20")}`;
  return (
    <div className="m-backdrop" onClick={onClose}>
      <form
        className="m-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          window.location.href = href;
          onClose();
        }}
      >
        <h3>Talk to sales</h3>
        <p className="muted" style={{ margin: 0 }}>
          Club plans are priced by program size. Tell us a little about yours and we&rsquo;ll get back to you.
        </p>
        <label className="field">
          <span>Your name</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Club or organization</span>
          <input required value={org} onChange={(e) => setOrg(e.target.value)} />
        </label>
        <label className="field">
          <span>About how many sailors?</span>
          <input inputMode="numeric" value={sailors} onChange={(e) => setSailors(e.target.value)} />
        </label>
        <label className="field">
          <span>Anything else?</span>
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} />
        </label>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
          <button type="button" className="s-btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="s-btn navy">
            Send to sales
          </button>
        </div>
      </form>
    </div>
  );
}

export function Pricing() {
  const sp = useSearchParams();
  const wallet = useWallet();
  const [mode, setMode] = useState<"personal" | "enterprise">(sp.get("for") === "enterprise" ? "enterprise" : "personal");
  const [teamTier, setTeamTier] = useState<"team" | "teamplus">("teamplus");
  const [sales, setSales] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const pick = (p: Plan) => {
    if (p.price == null) return setSales(true);
    choosePlan(p.id);
    setToast(`${p.name} activated — ${fmtCredits(p.credits)} credits added. Demo mode: no payment taken.`);
  };

  const switchMode = (m: "personal" | "enterprise") => {
    setMode(m);
    const url = new URL(window.location.href);
    if (m === "enterprise") url.searchParams.set("for", "enterprise");
    else url.searchParams.delete("for");
    window.history.replaceState(null, "", url);
  };

  const cur = (id: PlanId) => wallet.plan === id;

  return (
    <>
      <section className="s-hero compact" style={{ paddingBottom: 8 }}>
        <h1>Plans that float your boat</h1>
        <p>Every search costs {CREDITS_PER_SEARCH} credits. Pick the allowance — and the tools — that fit how you sail.</p>
        <div style={{ marginTop: 26 }}>
          <Slider
            label="Plan type"
            value={mode}
            onChange={switchMode}
            options={[
              ["personal", "Personal"],
              ["enterprise", "Enterprise"],
            ]}
          />
        </div>
      </section>

      <div className="p-grid" style={{ padding: "0 4px 8px" }}>
        {mode === "personal"
          ? PERSONAL_PLANS.map((id) => <PlanCard key={id} plan={PLANS[id]} current={cur(id)} onChoose={pick} dark={id === "platinum"} />)
          : [
              <PlanCard key="coach" plan={PLANS.coach} current={cur("coach")} onChoose={pick} />,
              <PlanCard
                key="team"
                plan={PLANS[teamTier]}
                current={cur(teamTier)}
                onChoose={pick}
                top={
                  <Slider
                    small
                    label="Team size"
                    value={teamTier}
                    onChange={setTeamTier}
                    options={[
                      ["team", "Team"],
                      ["teamplus", "TeamPlus"],
                    ]}
                  />
                }
              />,
              <PlanCard key="club" plan={PLANS.club} current={cur("club")} onChoose={pick} dark />,
            ]}
      </div>

      <div className="p-note">
        <b>Heads up:</b> billing isn&rsquo;t connected yet, so choosing a plan activates it in this browser right away and no card is charged.
        Features tagged <span className="p-soon" style={{ marginLeft: 0 }}>Soon</span> are on the way. Everyone starts with {FREE_CREDITS} free credits.{" "}
        {wallet.plan !== "free" && (
          <button type="button" className="linklike" onClick={() => { choosePlan("free"); setToast("Back on the Free plan."); }}>
            Switch back to Free
          </button>
        )}
      </div>

      <section className="s-section" style={{ paddingBottom: 12 }}>
        <div className="s-eyebrow">Questions</div>
        <h2 className="s-h2">The fine print, without the fine print.</h2>
        <div className="p-faq">
          <div>
            <h4>What uses credits?</h4>
            <p>
              Each search costs {CREDITS_PER_SEARCH} credits, and so does loading a sailor&rsquo;s full history for the first time each month.
              Re-opening a sailor you&rsquo;ve already loaded this month is free.
            </p>
          </div>
          <div>
            <h4>Do unused credits roll over?</h4>
            <p>No — your allowance resets each month on your renewal date.</p>
          </div>
          <div>
            <h4>DashboardGo vs DashboardPlus?</h4>
            <p>
              DashboardGo has your results, race log, season filters and finish charts. DashboardPlus adds fleet-strength ratings, rating history,
              insights and Rival Radar.
            </p>
          </div>
          <div>
            <h4>Where do results come from?</h4>
            <p>
              Clubspot (including every USODA event) and Regatta Network today. Techscore, Sailwave and Manage2Sail are next.{" "}
              <Link href="/">Try a search</Link>.
            </p>
          </div>
        </div>
      </section>

      {sales && <SalesModal onClose={() => setSales(false)} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
