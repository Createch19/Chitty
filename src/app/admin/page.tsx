import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminLive } from "@/components/admin/AdminLive";
import { Aurora } from "@/components/brand";
import { ToastProvider } from "@/components/ui/kit";
import { getDb } from "@/db/client";
import { listOrganisers } from "@/server/accounts";
import { requireAdmin } from "@/server/session";

export const metadata: Metadata = { title: "Admin" };

async function Console() {
  const admin = await requireAdmin();
  const rows = await listOrganisers(await getDb());
  const organisers = rows.map((o) => ({ ...o, createdAt: o.createdAt.toISOString() }));
  return <AdminLive admin={{ name: admin.name, mobile: admin.mobile }} organisers={organisers} />;
}

export default function Page() {
  return (
    <ToastProvider>
      <div className="relative min-h-screen overflow-hidden">
        <Aurora />
        <Suspense fallback={<div className="relative z-10 mx-auto mt-24 h-80 max-w-5xl animate-pulse rounded-[22px] bg-glass" />}>
          <Console />
        </Suspense>
      </div>
    </ToastProvider>
  );
}
