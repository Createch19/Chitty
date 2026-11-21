import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChitPage } from "@/components/organiser/ChitPage";
import { getDb } from "@/db/client";
import { ChitError, getChitDetail } from "@/server/chits";
import { linkStatus } from "@/server/members";
import { Frame, Shell, Skeleton } from "@/server/org-page";
import { istNow } from "@/server/scheduler";

export const metadata: Metadata = { title: "Chit" };

async function Content({ params }: { params: Promise<{ chitId: string }> }) {
  const { chitId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(chitId)) notFound();
  return (
    <Shell>
      {async (me) => {
        try {
          const db = await getDb();
          const d = await getChitDetail(db, me.id, chitId);
          const links = Object.fromEntries((await linkStatus(db, me.id, chitId)).map((l) => [l.seatId, l.createdAt.toISOString()]));
          return <ChitPage d={d} links={links} today={istNow(new Date()).date} />;
        } catch (e) {
          if (e instanceof ChitError) notFound();
          throw e;
        }
      }}
    </Shell>
  );
}

export default function Page({ params }: PageProps<"/app/chits/[chitId]">) {
  return (
    <Frame>
      <Suspense fallback={<Skeleton />}>
        <Content params={params} />
      </Suspense>
    </Frame>
  );
}
