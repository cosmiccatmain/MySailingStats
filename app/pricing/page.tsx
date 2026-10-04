import type { Metadata } from "next";
import { Suspense } from "react";
import { Pricing } from "@/components/site/Pricing";
import { SitePage } from "@/components/site/SiteHeader";

export const metadata: Metadata = { title: "Plans and pricing" };

export default function PricingPage() {
  return (
    <SitePage>
      <Suspense>
        <Pricing />
      </Suspense>
    </SitePage>
  );
}
