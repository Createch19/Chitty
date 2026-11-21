import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportsView } from "@/components/organiser/ReportsView";
import { getDb } from "@/db/client";
import { Frame, Shell, Skeleton } from "@/server/org-page";
import { loadReport, parseQuery } from "@/server/report-load";
import { reportChoices } from "@/server/reports";
import { istNow } from "@/server/scheduler";

export const metadata: Metadata = { title: "Reports" };

async function Content({ searchParams }: { searchParams: PageProps<"/app/reports">["searchParams"] }) {
  const q = parseQuery(await searchParams);
  return (
    <Shell>
      {async (me) => {
        const db = await getDb();
        const choices = await reportChoices(db, me.id);
        const report = await loadReport(db, me.id, q, istNow(new Date()).date);
        return <ReportsView q={q} choices={choices} report={report} business={me.businessName} />;
      }}
    </Shell>
  );
}

export default function Page({ searchParams }: PageProps<"/app/reports">) {
  return (
    <Frame>
      <Suspense fallback={<Skeleton />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </Frame>
  );
}
