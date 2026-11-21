import type { Metadata } from "next";
import { Aurora, PreviewBar } from "@/components/brand";
import { Dashboard } from "@/components/screens/Dashboard";
import { OrganiserShell } from "@/components/screens/OrganiserShell";

export const metadata: Metadata = { title: "Organiser dashboard" };

export default function Page() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <Aurora />
      <PreviewBar title="Organiser dashboard" />
      <OrganiserShell>
        <Dashboard />
      </OrganiserShell>
    </div>
  );
}
