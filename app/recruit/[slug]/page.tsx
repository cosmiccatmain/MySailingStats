import type { Metadata } from "next";
import { ProspectPage } from "@/components/recruit/ProspectPage";
import { SitePage } from "@/components/site/SiteHeader";

export const metadata: Metadata = { title: "Prospect" };

export default async function Prospect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <SitePage>
      <ProspectPage slug={slug} />
    </SitePage>
  );
}
