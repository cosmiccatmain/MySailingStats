import type { Metadata } from "next";
import { ClubPage } from "@/components/site/ClubPage";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";

export const metadata: Metadata = { title: "Club" };

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return (
    <div className="s-page">
      <div className="s-shell" style={{ marginTop: 12 }}>
        <SiteHeader />
        <ClubPage id={id} />
      </div>
      <div className="s-wrap">
        <SiteFooter />
      </div>
    </div>
  );
}
