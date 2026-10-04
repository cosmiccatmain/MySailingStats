import type { Metadata } from "next";
import { RegattaPage } from "@/components/site/RegattaPage";
import { SitePage } from "@/components/site/SiteHeader";

export const metadata: Metadata = { title: "Regatta results" };

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return (
    <SitePage>
      <RegattaPage id={id} />
    </SitePage>
  );
}
