import type { Metadata } from "next";
import { Recruiter } from "@/components/recruit/Recruiter";
import { SitePage } from "@/components/site/SiteHeader";

export const metadata: Metadata = {
  title: "Recruiter",
  description: "Rank high school sailors by class year, school and district, and track them against your team.",
};

export default function RecruitPage() {
  return (
    <SitePage>
      <Recruiter />
    </SitePage>
  );
}
