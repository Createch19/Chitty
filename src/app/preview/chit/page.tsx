import type { Metadata } from "next";
import { Aurora, PreviewBar } from "@/components/brand";
import { ChitDetail } from "@/components/screens/ChitDetail";
import { OrganiserShell } from "@/components/screens/OrganiserShell";

export const metadata: Metadata = { title: "Chit A" };

export default function Page() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <Aurora />
      <PreviewBar title="Chit page" />
      <OrganiserShell>
        <ChitDetail />
      </OrganiserShell>
    </div>
  );
}
