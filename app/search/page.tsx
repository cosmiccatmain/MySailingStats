import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchResults } from "@/components/site/SearchResults";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";

export const metadata: Metadata = { title: "Search" };

export default function SearchPage() {
  return (
    <div className="s-page">
      <div className="s-shell" style={{ marginTop: 12 }}>
        <SiteHeader />
        <Suspense>
          <SearchResults />
        </Suspense>
      </div>
      <div className="s-wrap">
        <SiteFooter />
      </div>
    </div>
  );
}
