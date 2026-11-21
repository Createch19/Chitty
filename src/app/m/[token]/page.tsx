import { connection } from "next/server";
import { Suspense } from "react";
import { Aurora } from "@/components/brand";
import { LinkState } from "@/components/member/LinkState";
import { MemberHome } from "@/components/member/MemberHome";
import { getDb } from "@/db/client";
import { memberHome, resolveLink } from "@/server/members";
import { messagesFor, vapidPublicKey } from "@/server/notify";
import { istNow } from "@/server/scheduler";

async function Content({ params, searchParams }: { params: PageProps<"/m/[token]">["params"]; searchParams: PageProps<"/m/[token]">["searchParams"] }) {
  const { token } = await params;
  const { n } = await searchParams;
  await connection();
  const db = await getDb();
  const link = await resolveLink(db, token);
  if (link === null) return <LinkState kind="invalid" />;
  if (link === "paused") return <LinkState kind="paused" />;
  const d = await memberHome(db, link);
  const inbox = await messagesFor(db, link.organiserId, link.seatId); // one after the other: PGlite (dev) has one connection
  return (
    <MemberHome
      token={token}
      d={d}
      today={istNow(new Date()).date}
      publicKey={vapidPublicKey()}
      inbox={inbox.map((m) => ({ id: m.id, kind: m.kind, fields: m.fields, createdAt: m.createdAt.toISOString() }))}
      focus={typeof n === "string" ? n : undefined}
    />
  );
}

export default function Page(props: PageProps<"/m/[token]">) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <Aurora />
      <Suspense fallback={<div className="relative z-10 mx-auto mt-16 h-96 max-w-md animate-pulse rounded-[22px] bg-glass" />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
