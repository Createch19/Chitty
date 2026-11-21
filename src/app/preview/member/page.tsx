import type { Metadata } from "next";
import { Aurora, PreviewBar } from "@/components/brand";
import { MemberApp } from "@/components/screens/MemberApp";

export const metadata: Metadata = { title: "Member app" };

export default function Page() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <Aurora />
      <PreviewBar title="Member app" />
      <MemberApp />
    </div>
  );
}
