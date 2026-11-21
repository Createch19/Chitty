import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MonthPage } from "@/components/organiser/MonthPage";
import { getDb } from "@/db/client";
import { ChitError, getMonthBoard } from "@/server/chits";
import { Frame, Shell, Skeleton } from "@/server/org-page";
import { istNow } from "@/server/scheduler";

export const metadata: Metadata = { title: "Month" };

async function Content({ params }: { params: Promise<{ chitId: string; monthId: string }> }) {
  const { monthId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(monthId)) notFound();
  return (
    <Shell>
      {async (me) => {
        try {
          const b = await getMonthBoard(await getDb(), me.id, monthId);
          return <MonthPage b={b} business={me.businessName} today={istNow(new Date()).date} />;
        } catch (e) {
          if (e instanceof ChitError) notFound();
          throw e;
        }
      }}
    </Shell>
  );
}

export default function Page({ params }: PageProps<"/app/chits/[chitId]/months/[monthId]">) {
  return (
    <Frame>
      <Suspense fallback={<Skeleton />}>
        <Content params={params} />
      </Suspense>
    </Frame>
  );
}
