import type { Metadata } from "next";
import { ClubPage } from "@/components/site/ClubPage";
import { SitePage } from "@/components/site/SiteHeader";

export const metadata: Metadata = { title: "Club" };

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return (
    <SitePage>
      <ClubPage id={id} />
    </SitePage>
  );
}
