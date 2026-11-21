import type { Metadata } from "next";
import { Suspense } from "react";
import { NewChitForm } from "@/components/organiser/NewChitForm";
import { getDb } from "@/db/client";
import { listChits, nextChitCode } from "@/server/chits";
import { Frame, Shell, Skeleton } from "@/server/org-page";

export const metadata: Metadata = { title: "New chit" };

async function Content() {
  return (
    <Shell>
      {async (me) => {
        const chits = await listChits(await getDb(), me.id);
        const used = chits.map((c) => c.code);
        return <NewChitForm suggestedCode={nextChitCode(used)} usedCodes={used} />;
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
