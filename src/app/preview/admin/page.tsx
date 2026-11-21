import type { Metadata } from "next";
import { Aurora, PreviewBar } from "@/components/brand";
import { AdminConsole } from "@/components/screens/AdminConsole";

export const metadata: Metadata = { title: "Super Admin" };

export default function Page() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <Aurora />
      <PreviewBar title="Super Admin" />
      <AdminConsole />
    </div>
  );
}
