// Subscription plans, monthly credit allowances and the features each unlocks.

export const CREDITS_PER_SEARCH = 100;
export const FREE_CREDITS = 500; // one-time starter balance: five searches

export type PlanId = "free" | "boater" | "parent" | "platinum" | "coach" | "team" | "teamplus" | "club";
export type Feature = "dashboardGo" | "dashboardPlus" | "clubSearch" | "multiCompare" | "csvExport" | "rivalRadar";

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
    blurb: "For the sailor who wants every result in one place.",
    features: go,
    compareLimit: 1,
    perks: [
      { text: "1,000 credits / month" },
      { text: "DashboardGo — results, races, season filters" },
      { text: "Club Search — team results for any club" },
      { text: "Full race log + CSV export" },
      { text: "Regatta Watchlist", soon: true },
    ],
  },
  parent: {
    id: "parent",
    name: "Parent",
    price: 14.99,
    credits: 2000,
    blurb: "Follow your kids' progress across every fleet.",
    features: [...go, "multiCompare"],
    compareLimit: 3,
    highlight: true,
    perks: [
      { text: "2,000 credits / month" },
      { text: "Everything in Boater" },
      { text: "Multi Compare — up to 3 sailors side by side" },
      { text: "Family hub — follow up to 3 sailors", soon: true },
      { text: "New-results alerts by email", soon: true },
    ],
  },
  platinum: {
    id: "platinum",
    name: "Platinum",
    price: 39.99,
    credits: 10000,
    blurb: "The full toolkit for serious competitors.",
    features: plus,
    compareLimit: 6,
    perks: [
      { text: "10,000 credits / month" },
      { text: "DashboardPlus — fleet-strength ratings, insights, rating history" },
      { text: "Multi Compare — up to 6 sailors" },
      { text: "Rival Radar — your head-to-head record vs everyone" },
      { text: "Club Search + CSV export" },
      { text: "AI regatta recaps", soon: true },
    ],
  },
  coach: {
    id: "coach",
    name: "Coach",
    price: 59,
    credits: 25000,
    blurb: "Track a practice group and plan training from real results.",
    features: plus,
    compareLimit: 15,
    enterprise: true,
    perks: [
      { text: "25,000 credits / month" },
      { text: "DashboardPlus for every sailor you coach" },
      { text: "Multi Compare — up to 15 sailors" },
      { text: "Practice-group roster", soon: true },
      { text: "Coach notes on regattas", soon: true },
    ],
  },
  team: {
    id: "team",
    name: "Team",
    price: 149,
    credits: 60000,
    blurb: "A season dashboard for your whole race team.",
    features: plus,
    compareLimit: 40,
    enterprise: true,
    perks: [
      { text: "60,000 credits / month" },
      { text: "Roster of up to 40 sailors" },
      { text: "Club team scoring at every regatta" },
      { text: "Team leaderboard + season report", soon: true },
      { text: "5 coach seats", soon: true },
    ],
  },
  teamplus: {
    id: "teamplus",
    name: "TeamPlus",
    price: 299,
    credits: 150000,
    blurb: "Get all the kids — every sailor in your program, automatically.",
    features: plus,
    compareLimit: 100,
    enterprise: true,
    highlight: true,
    perks: [
      { text: "150,000 credits / month" },
      { text: "Get all the kids — auto-import every sailor who races for your club", soon: true },
      { text: "Unlimited roster" },
      { text: "Club team scoring + rival clubs" },
      { text: "Unlimited coach seats", soon: true },
    ],
  },
  club: {
    id: "club",
    name: "Club",
    price: null,
    credits: Infinity,
    blurb: "For yacht clubs, class associations and regional programs.",
    features: plus,
    compareLimit: 200,
    enterprise: true,
    perks: [
      { text: "Unlimited credits" },
      { text: "Every program on one account" },
      { text: "Branded results pages", soon: true },
      { text: "API access + data exports", soon: true },
      { text: "SSO and dedicated support" },
    ],
  },
};

export const PERSONAL_PLANS: PlanId[] = ["boater", "parent", "platinum"];

export const hasFeature = (plan: PlanId, f: Feature) => PLANS[plan].features.includes(f);

/** Cheapest plan that includes a feature (for upgrade prompts). */
export function planFor(f: Feature): Plan {
  return [PLANS.boater, PLANS.parent, PLANS.platinum].find((p) => p.features.includes(f)) ?? PLANS.platinum;
}

export const FEATURE_LABEL: Record<Feature, string> = {
  dashboardGo: "DashboardGo",
  dashboardPlus: "DashboardPlus",
  clubSearch: "Club Search",
  multiCompare: "Multi Compare",
  csvExport: "CSV export",
  rivalRadar: "Rival Radar",
};

export const fmtCredits = (n: number) => (Number.isFinite(n) ? n.toLocaleString("en-US") : "Unlimited");
