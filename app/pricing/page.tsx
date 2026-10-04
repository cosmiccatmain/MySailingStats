import type { Metadata } from "next";
import { Suspense } from "react";
import { Pricing } from "@/components/site/Pricing";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";

export const metadata: Metadata = { title: "Plans & pricing" };

export default function PricingPage() {
  return (
    <div className="s-page">
      <div className="s-shell" style={{ marginTop: 12 }}>
        <SiteHeader />
        <Suspense>
          <Pricing />
        </Suspense>
      </div>
      <div className="s-wrap">
        <SiteFooter />
      </div>
    </div>
  );
}
