import type { Metadata } from "next";
import { Suspense } from "react";
import { Home } from "@/components/organiser/Home";
import { getDb } from "@/db/client";
import { dashboardStats, listChits } from "@/server/chits";
import { Frame, Shell, Skeleton } from "@/server/org-page";
import { istNow } from "@/server/scheduler";

export const metadata: Metadata = { title: "Home" };

async function Content() {
  return (
    <Shell>
      {async (me) => {
        const db = await getDb();
        const [chits, stats] = await Promise.all([listChits(db, me.id), dashboardStats(db, me.id, istNow(new Date()).date)]);
        return (
          <Home
            ownerName={me.ownerName}
            stats={stats}
            chits={chits.map((c) => ({ id: c.id, code: c.code, status: c.status, totalPaise: c.terms.totalPaise, months: c.terms.months, seats: c.seats, current: c.current, next: c.next, collection: c.collection }))}
          />
        );
      }}
    </Shell>
  );
}

export default function Page() {
  return (
    <Frame>
      <Suspense fallback={<Skeleton />}>
        <Content />
      </Suspense>
    </Frame>
  );
}
