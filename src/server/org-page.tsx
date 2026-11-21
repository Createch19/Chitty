/** Shared bits for organiser pages: the session guard and the page frame. Server-only. */
import "server-only";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Aurora } from "@/components/brand";
import { OrgShell } from "@/components/organiser/common";
import { ToastProvider } from "@/components/ui/kit";
import { requireOrganiser } from "./session";

export async function requireReadyOrganiser() {
  const me = await requireOrganiser();
  if (me.mustChangePassword) redirect("/app/password");
  return me;
}

export function Frame({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="relative min-h-screen overflow-hidden">
        <Aurora />
        {children}
      </div>
    </ToastProvider>
  );
}

export async function Shell({ children }: { children: (me: Awaited<ReturnType<typeof requireReadyOrganiser>>) => Promise<ReactNode> | ReactNode }) {
  const me = await requireReadyOrganiser();
  return <OrgShell me={{ businessName: me.businessName, businessNameTa: me.businessNameTa, ownerName: me.ownerName }}>{await children(me)}</OrgShell>;
}

export const Skeleton = () => <div className="relative z-10 mx-auto mt-24 h-80 max-w-6xl animate-pulse rounded-[22px] bg-glass" />;
