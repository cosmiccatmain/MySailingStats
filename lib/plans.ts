// Subscription plans, monthly credit allowances and the features each unlocks.

export const CREDITS_PER_SEARCH = 100;
export const FREE_CREDITS = 500; // one-time starter balance: five searches

export type PlanId = "free" | "boater" | "parent" | "platinum" | "coach" | "recruiter" | "team" | "teamplus" | "club";
export type Feature = "dashboardGo" | "dashboardPlus" | "clubSearch" | "multiCompare" | "csvExport" | "rivalRadar" | "recruiter";

export type Plan = {
  id: PlanId;
  name: string;
  price: number | null; // USD per month; null = contact sales
  credits: number; // per month
  blurb: string;
  features: Feature[];
  compareLimit: number; // sailors in one Multi Compare (including you)
  perks: { text: string; soon?: boolean }[];
  enterprise?: boolean;
  highlight?: boolean;
};

const go: Feature[] = ["dashboardGo", "clubSearch", "csvExport"];
const plus: Feature[] = ["dashboardGo", "dashboardPlus", "clubSearch", "multiCompare", "csvExport", "rivalRadar"];

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    credits: 0,
    blurb: "Try it out",
    features: ["dashboardGo"],
    compareLimit: 1,
    perks: [{ text: `${FREE_CREDITS} starter credits` }, { text: "DashboardGo" }],
  },
  boater: {
    id: "boater",
    name: "Boater",
    price: 7.99,
    credits: 1000,
    blurb: "Every result and race in one place, for one sailor.",
    features: go,
    compareLimit: 1,
    perks: [
      { text: "1,000 credits / month" },
      { text: "DashboardGo" },
      { text: "Club Search: team results for any club" },
      { text: "Full race log with CSV export" },
      { text: "Regatta Watchlist", soon: true },
    ],
  },
  parent: {
    id: "parent",
    name: "Parent",
    price: 14.99,
    credits: 2000,
    blurb: "Follow your sailors and compare them side by side.",
    features: [...go, "multiCompare"],
    compareLimit: 3,
    highlight: true,
    perks: [
      { text: "2,000 credits / month" },
      { text: "Everything in Boater" },
      { text: "Multi Compare: up to 3 sailors" },
      { text: "Family hub for up to 3 sailors", soon: true },
      { text: "New-results alerts by email", soon: true },
    ],
  },
  platinum: {
    id: "platinum",
    name: "Platinum",
    price: 39.99,
    credits: 10000,
    blurb: "Fleet-strength ratings and the full analytics suite.",
    features: plus,
    compareLimit: 6,
    perks: [
      { text: "10,000 credits / month" },
      { text: "DashboardPlus" },
      { text: "Multi Compare: up to 6 sailors" },
      { text: "Rival Radar: head-to-head records" },
      { text: "Club Search and CSV export" },
      { text: "AI regatta recaps", soon: true },
    ],
  },
  coach: {
    id: "coach",
    name: "Coach",
    price: 59,
    credits: 25000,
    blurb: "Track a practice group with ratings and comparisons.",
    features: plus,
    compareLimit: 15,
    enterprise: true,
    perks: [
      { text: "25,000 credits / month" },
      { text: "DashboardPlus for every sailor you coach" },
      { text: "Multi Compare: up to 15 sailors" },
      { text: "Practice-group roster", soon: true },
      { text: "Coach notes on regattas", soon: true },
    ],
  },
  recruiter: {
    id: "recruiter",
    name: "Recruiter",
    price: 99,
    credits: 40000,
    blurb: "For college and club coaches: find, rank and track high school prospects.",
    features: [...plus, "recruiter"],
    compareLimit: 15,
    enterprise: true,
    highlight: true,
    perks: [
      { text: "40,000 credits / month" },
      { text: "Prospect rankings from high school sailing (Techscore): C420, FJ, Z420" },
      { text: "Class year, school, district and every result for each prospect" },
      { text: "Knows your program: roster by class year, feeder schools, local talent" },
      { text: "Recruiting board with stages, notes and CSV export" },
      { text: "Everything in Coach" },
    ],
  },
  team: {
    id: "team",
    name: "Team",
    price: 149,
    credits: 60000,
    blurb: "Season results and team scoring for a race team.",
    features: plus,
    compareLimit: 40,
    enterprise: true,
    perks: [
      { text: "60,000 credits / month" },
      { text: "Roster of up to 40 sailors" },
      { text: "Club team scoring at every regatta" },
      { text: "Team leaderboard and season report", soon: true },
      { text: "5 coach seats", soon: true },
    ],
  },
  teamplus: {
    id: "teamplus",
    name: "TeamPlus",
    price: 299,
    credits: 150000,
    blurb: "Get all the kids: every sailor in your program, in one account.",
    features: plus,
    compareLimit: 100,
    enterprise: true,
    perks: [
      { text: "150,000 credits / month" },
      { text: "Get all the kids: auto-import every sailor who races for your club", soon: true },
      { text: "Unlimited roster" },
      { text: "Club team scoring and rival clubs" },
      { text: "Unlimited coach seats", soon: true },
    ],
  },
  club: {
    id: "club",
    name: "Club",
    price: null,
    credits: Infinity,
    blurb: "For yacht clubs, class associations and regional programs.",
    features: [...plus, "recruiter"],
    compareLimit: 200,
    enterprise: true,
    perks: [
      { text: "Unlimited credits" },
      { text: "Every program on one account" },
      { text: "Branded results pages", soon: true },
      { text: "API access and data exports", soon: true },
      { text: "SSO and dedicated support" },
    ],
  },
};

export const PERSONAL_PLANS: PlanId[] = ["boater", "parent", "platinum"];

export const hasFeature = (plan: PlanId, f: Feature) => PLANS[plan].features.includes(f);

/** Cheapest plan that includes a feature (for upgrade prompts). */
export function planFor(f: Feature): Plan {
  return [PLANS.boater, PLANS.parent, PLANS.platinum, PLANS.recruiter].find((p) => p.features.includes(f)) ?? PLANS.platinum;
}

export const FEATURE_LABEL: Record<Feature, string> = {
  dashboardGo: "DashboardGo",
  dashboardPlus: "DashboardPlus",
  clubSearch: "Club Search",
  multiCompare: "Multi Compare",
  csvExport: "CSV export",
  rivalRadar: "Rival Radar",
  recruiter: "Recruiter",
};

export const fmtCredits = (n: number) => (Number.isFinite(n) ? n.toLocaleString("en-US") : "Unlimited");

/** What each dashboard includes, in plain words (landing page, pricing, dashboard). */
export const DASHBOARDS = {
  go: {
    name: "DashboardGo",
    tagline: "Your results, organized.",
    summary: "Every regatta and race a sailor has scored on Clubspot, with finish charts and filters.",
    items: [
      ["Every regatta and race", "Places, race-by-race scores and the full fleet results"],
      ["Season and fleet filters", "Split Championship, Red/White/Blue and Green fleets"],
      ["Finish charts", "Results over time, early vs late races, finish distribution"],
      ["Recent form and personal bests", "Last results at a glance, best finishes by fleet"],
    ] as [string, string][],
    plans: "Free, Boater and Parent",
  },
  plus: {
    name: "DashboardPlus",
    tagline: "Know how good the result really was.",
    summary: "Everything in DashboardGo, plus a rating that accounts for how strong each fleet was.",
    items: [
      ["Fleet-strength rating", "Beating a Championship fleet counts for more than winning Green"],
      ["Rating history and trend", "See the rating move after every regatta"],
      ["Performance insights", "Consistency, starts, early vs late races, fleet-size effects"],
      ["Rival Radar", "Your head-to-head record against every sailor you race"],
    ] as [string, string][],
    plans: "Platinum and every Enterprise plan",
  },
} as const;
