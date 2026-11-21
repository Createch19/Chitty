import type { Metadata } from "next";
import { Aurora } from "@/components/brand";
import { OpenRedirect } from "@/components/member/OpenRedirect";

export const metadata: Metadata = { title: "Opening", robots: { index: false } };

/** Start page of the installed app: goes to the member's last-opened ID, or to the organiser login. */
export default function Page() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <Aurora />
      <OpenRedirect />
    </div>
  );
}
