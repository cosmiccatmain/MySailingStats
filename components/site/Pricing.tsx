"use client";

import { BarChart3, Check, CheckCircle2, Gauge, Info, Minus, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardCompare } from "./DashboardCompare";
import { CREDITS_PER_SEARCH, FREE_CREDITS, PERSONAL_PLANS, PLANS, fmtCredits, hasFeature, type Plan, type PlanId } from "@/lib/plans";
import { choosePlan, useWallet } from "@/lib/wallet";

const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL || "sales@mysailingstats.com";

/** Two-option sliding switch. */
function Slider<T extends string>({ value, options, onChange, small, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; small?: boolean; label: string }) {
  const i = Math.max(0, options.findIndex(([v]) => v === value));
  const pad = small ? 3 : 4;
  return (
    <div className={`p-switch${small ? " small" : ""}`} role="radiogroup" aria-label={label} style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      <span className="knob" aria-hidden style={{ left: `calc(${(i * 100) / options.length}% + ${i === 0 ? pad : 0}px)`, width: `calc(${100 / options.length}% - ${pad}px)` }} />
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={v === value} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

function PlanCard({ plan, current, onChoose, top }: { plan: Plan; current: boolean; onChoose: (p: Plan) => void; top?: React.ReactNode }) {
  const perSearch = Number.isFinite(plan.credits) ? Math.floor(plan.credits / CREDITS_PER_SEARCH) : null;
  const plus = plan.features.includes("dashboardPlus");
  return (
    <div className={`p-card${plan.highlight ? " hl" : ""}`}>
      {plan.highlight && <span className="p-ribbon">{plan.enterprise ? "Best for programs" : "Most popular"}</span>}
      <div className="p-name">
        <span>{plan.name}</span>
        {current && <span className="p-current">Current plan</span>}
      </div>
      {top}
      {plan.price == null ? (
        <div className="p-price talk">Custom pricing</div>
      ) : (
        <div className="p-price">
          ${plan.price % 1 ? plan.price.toFixed(2) : plan.price}
          <small> / month</small>
        </div>
      )}
      <p className="p-blurb">{plan.blurb}</p>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <span className="p-credits">
          <Gauge aria-hidden /> {fmtCredits(plan.credits)} credits / mo
        </span>
        <span className="p-dash">
          {plus ? <Sparkles aria-hidden /> : <BarChart3 aria-hidden />}
          {plus ? "DashboardPlus" : "DashboardGo"}
        </span>
      </div>
      <div className="p-per">{perSearch != null ? `About ${perSearch.toLocaleString("en-US")} searches a month` : "Unlimited searches"}</div>
      <ul>
        {plan.perks.map((p) => (
          <li key={p.text}>
            <Check aria-hidden />
            <span>
              {p.text}
              {p.soon && <span className="p-soon">Soon</span>}
            </span>
          </li>
        ))}
      </ul>
      {plan.price == null ? (
        <button type="button" className="btn btn-primary btn-block btn-lg" onClick={() => onChoose(plan)}>
          Contact sales
        </button>
      ) : (
        <button type="button" className={`btn btn-block btn-lg ${current ? "btn-secondary" : "btn-primary"}`} disabled={current} onClick={() => onChoose(plan)}>
          {current ? "Your current plan" : `Choose ${plan.name}`}
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
        <h3>Contact sales</h3>
        <p className="muted small">Club plans are priced by program size. Tell us about yours and we&rsquo;ll be in touch.</p>
        <label>
          Your name
          <input required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>
          Club or organization
          <input required value={org} onChange={(e) => setOrg(e.target.value)} />
        </label>
        <label>
          Approximate number of sailors
          <input inputMode="numeric" value={sailors} onChange={(e) => setSailors(e.target.value)} />
        </label>
        <label>
          Anything else
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} />
        </label>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 6 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

type Row = [string, string | null, (p: Plan) => boolean | string];
const ROWS: Row[] = [
  ["Monthly credits", `${CREDITS_PER_SEARCH} per search`, (p) => fmtCredits(p.credits)],
  ["Dashboard", null, (p) => (p.features.includes("dashboardPlus") ? "Plus" : "Go")],
  ["Every regatta and race", "Results, scores and full fleets", () => true],
  ["Finish charts and filters", "Season, fleet and race-number views", () => true],
  ["CSV export", null, (p) => p.features.includes("csvExport")],
  ["Club Search", "Team results for any club", (p) => p.features.includes("clubSearch")],
  ["Multi Compare", "Sailors side by side", (p) => (p.features.includes("multiCompare") ? `Up to ${p.compareLimit}` : false)],
  ["Fleet-strength rating", "Adjusts for how strong each fleet was", (p) => p.features.includes("dashboardPlus")],
  ["Rating history and insights", null, (p) => p.features.includes("dashboardPlus")],
  ["Rival Radar", "Head-to-head record vs everyone", (p) => p.features.includes("rivalRadar")],
];

function CompareTable({ ids }: { ids: PlanId[] }) {
  return (
    <div className="card pad-0 table-wrap p-table" style={{ marginTop: 28 }}>
      <table>
        <thead>
          <tr>
            <th>Feature</th>
            {ids.map((id) => (
              <th key={id}>{PLANS[id].name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([label, sub, f]) => (
            <tr key={label}>
              <td>
                {label}
                {sub && <small>{sub}</small>}
              </td>
              {ids.map((id) => {
                const v = f(PLANS[id]);
                return (
                  <td key={id}>
                    {v === true ? <CheckCircle2 className="yes" aria-label="Included" /> : v === false ? <Minus className="no" aria-label="Not included" /> : <b className="small">{v}</b>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
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

  useEffect(() => setMode(sp.get("for") === "enterprise" ? "enterprise" : "personal"), [sp]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const pick = (p: Plan) => {
    if (p.price == null) return setSales(true);
    choosePlan(p.id);
    setToast(`${p.name} is active: ${fmtCredits(p.credits)} credits added. Demo mode, no payment taken.`);
  };

  const switchMode = (m: "personal" | "enterprise") => {
    setMode(m);
    const url = new URL(window.location.href);
    if (m === "enterprise") url.searchParams.set("for", "enterprise");
    else url.searchParams.delete("for");
    window.history.replaceState(null, "", url);
  };

  const cur = (id: PlanId) => wallet.plan === id;
  const ids: PlanId[] = mode === "personal" ? PERSONAL_PLANS : ["coach", teamTier, "club"];

  return (
    <div style={{ paddingBottom: 24 }}>
      <section className="pr-hero">
        <h1 className="fx">Plans and pricing</h1>
        <p className="fx" style={{ ["--d" as string]: "60ms" }}>
          Each search uses {CREDITS_PER_SEARCH} credits. Choose the monthly allowance and the tools you need.
        </p>
        <div className="fx" style={{ ["--d" as string]: "120ms" }}>
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

      <div key={mode} className="p-grid fx-stagger">
        {mode === "personal"
          ? PERSONAL_PLANS.map((id) => <PlanCard key={id} plan={PLANS[id]} current={cur(id)} onChoose={pick} />)
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
              <PlanCard key="club" plan={PLANS.club} current={cur("club")} onChoose={pick} />,
            ]}
      </div>

      <div className="p-note">
        <Info aria-hidden />
        <span>
          Billing is not connected yet. Choosing a plan activates it in this browser immediately and no card is charged. Features marked{" "}
          <span className="p-soon" style={{ marginLeft: 0 }}>Soon</span> are in development. New accounts start with {FREE_CREDITS} free credits.
          {wallet.plan !== "free" && (
            <>
              {" "}
              <button type="button" className="link" onClick={() => (choosePlan("free"), setToast("Switched back to the Free plan."))}>
                Switch back to Free
              </button>
            </>
          )}
        </span>
      </div>

      <section className="l-section" style={{ paddingTop: 72 }}>
        <div className="l-kicker">Compare</div>
        <h2 className="l-h2">What each plan includes</h2>
        <CompareTable ids={ids} />
      </section>

      <section className="l-section" id="dashboards" style={{ paddingTop: 72, scrollMarginTop: 80 }}>
        <div className="l-kicker">Dashboards</div>
        <h2 className="l-h2">DashboardGo and DashboardPlus</h2>
        <p className="l-lead">
          Both show every regatta and race. DashboardPlus adds a rating that weighs each result by the strength of the fleet, so a mid-fleet
          finish at Nationals can count for more than a Green fleet win.
        </p>
        <DashboardCompare />
      </section>

      <section className="l-section" style={{ paddingTop: 72 }}>
        <div className="l-kicker">FAQ</div>
        <h2 className="l-h2">Common questions</h2>
        <div className="p-faq">
          <div className="card">
            <h4>What uses credits?</h4>
            <p>
              Each search uses {CREDITS_PER_SEARCH} credits. Loading a sailor&rsquo;s dashboard uses {CREDITS_PER_SEARCH} the first time each
              month, unless you just found them by searching their name. Reopening a sailor that month is free.
            </p>
          </div>
          <div className="card">
            <h4>Do unused credits roll over?</h4>
            <p>No. Your allowance resets on your renewal date each month.</p>
          </div>
          <div className="card">
            <h4>Which dashboard do I get?</h4>
            <p>
              Free, Boater and Parent include DashboardGo. Platinum and every Enterprise plan include DashboardPlus.{" "}
              {hasFeature(wallet.plan, "dashboardPlus") ? "You have DashboardPlus." : "You have DashboardGo."}
            </p>
          </div>
          <div className="card">
            <h4>Where do results come from?</h4>
            <p>Clubspot (including every USODA event) and Regatta Network today. Techscore, Sailwave and Manage2Sail are planned.</p>
          </div>
        </div>
      </section>

      {sales && <SalesModal onClose={() => setSales(false)} />}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 aria-hidden />
          {toast}
        </div>
      )}
    </div>
  );
}
