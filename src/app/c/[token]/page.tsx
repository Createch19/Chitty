import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { Aurora } from "@/components/brand";
import { GroupJoin } from "@/components/member/GroupJoin";
import { LinkState } from "@/components/member/LinkState";
import { ToastProvider } from "@/components/ui/kit";
import { getDb } from "@/db/client";
import { groupCookie } from "@/lib/group";
import { resolveLink } from "@/server/members";
import { groupView, resolveGroup } from "@/server/pins";

export const metadata: Metadata = { title: "Chit group", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const viewport: Viewport = { themeColor: "#0a0813" };

async function Content({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await connection();
  const db = await getDb();
  const g = await resolveGroup(db, token);
  if (g === null) return <LinkState kind="invalid" />;
  if (g === "paused") return <LinkState kind="paused" />;
  const view = await groupView(db, g);
  // a phone that already joined this chit goes straight on
  const saved = (await cookies()).get(groupCookie(g.chitId))?.value;
  const link = saved ? await resolveLink(db, saved) : null;
  const known = link && link !== "paused" && link.chitId === g.chitId ? { token: saved!, label: view.seats.find((s) => s.id === link.seatId)?.label ?? "" } : null;
  return <GroupJoin key={known?.token ?? "new"} token={token} view={view} known={known} />;
}

export default function Page({ params }: { params: Promise<{ token: string }> }) {
  return (
    <ToastProvider>
      <div className="relative min-h-screen overflow-hidden">
        <Aurora />
        <Suspense fallback={<div className="relative z-10 mx-auto mt-16 h-96 max-w-md animate-pulse rounded-[22px] bg-glass" />}>
          <Content params={params} />
        </Suspense>
      </div>
    </ToastProvider>
  );
}
