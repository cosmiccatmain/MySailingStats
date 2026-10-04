import type { Metadata } from "next";
import { RegattaPage } from "@/components/site/RegattaPage";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";

export const metadata: Metadata = { title: "Regatta results" };

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return (
    <div className="s-page">
      <div className="s-shell" style={{ marginTop: 12 }}>
        <SiteHeader />
        <RegattaPage id={id} />
      </div>
      <div className="s-wrap">
        <SiteFooter />
      </div>
    </div>
  );
}
