import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { NewChitForm } from "@/components/organiser/NewChitForm";
import { getDb } from "@/db/client";
import { ChitError, getChitDetail, listChits } from "@/server/chits";
import { Frame, Shell, Skeleton } from "@/server/org-page";

export const metadata: Metadata = { title: "Edit chit" };

async function Content({ params }: { params: Promise<{ chitId: string }> }) {
  const { chitId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(chitId)) notFound();
  return (
    <Shell>
      {async (me) => {
        const db = await getDb();
        let d;
        try {
          d = await getChitDetail(db, me.id, chitId);
        } catch (e) {
          if (e instanceof ChitError) notFound();
          throw e;
        }
        if (d.chit.status !== "draft") redirect(`/app/chits/${chitId}`); // terms are fixed once it starts
        const used = (await listChits(db, me.id)).map((c) => c.code).filter((c) => c !== d.chit.code);
        const t = d.chit.terms;
        return (
          <NewChitForm
            suggestedCode={d.chit.code}
            usedCodes={used}
            edit={{
              chitId,
              topSeat: Math.max(0, ...d.seats.map((s) => s.number)),
              values: {
                code: d.chit.code,
                totalRupees: t.totalPaise / 100,
                months: t.months,
                ratePct: t.rateBps / 100,
                incrementRupees: t.incrementPaise / 100,
                openTime: d.chit.openTime,
                display: d.chit.display === "name" ? "name" : "id",
              },
            }}
          />
        );
      }}
    </Shell>
  );
}

export default function Page({ params }: { params: Promise<{ chitId: string }> }) {
  return (
    <Frame>
      <Suspense fallback={<Skeleton />}>
        <Content params={params} />
      </Suspense>
    </Frame>
  );
}
