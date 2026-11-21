import type { Metadata } from "next";
import { Suspense } from "react";
import { AuditView } from "@/components/organiser/AuditView";
import { getDb } from "@/db/client";
import { listAudit, type AuditGroup } from "@/server/audit-view";
import { Frame, Shell, Skeleton } from "@/server/org-page";

export const metadata: Metadata = { title: "Audit log" };

async function Content({ searchParams }: { searchParams: PageProps<"/app/audit">["searchParams"] }) {
  const q = await searchParams;
  const group = (["all", "money", "auction", "members", "aadhaar"] as const).find((g) => g === q.group) ?? "all";
  const before = typeof q.before === "string" && /^\d+$/.test(q.before) ? Number(q.before) : undefined;
  return (
    <Shell>
      {async (me) => {
        const data = await listAudit(await getDb(), me.id, { group: group as AuditGroup, before });
        return <AuditView group={group} before={before} data={data} />;
      }}
    </Shell>
  );
}

export default function Page({ searchParams }: PageProps<"/app/audit">) {
  return (
    <Frame>
      <Suspense fallback={<Skeleton />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </Frame>
  );
}
