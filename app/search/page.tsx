import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchResults } from "@/components/site/SearchResults";
import { SitePage } from "@/components/site/SiteHeader";

export const metadata: Metadata = { title: "Search" };

export default function SearchPage() {
  return (
    <SitePage>
      <Suspense>
        <SearchResults />
      </Suspense>
    </SitePage>
  );
}
