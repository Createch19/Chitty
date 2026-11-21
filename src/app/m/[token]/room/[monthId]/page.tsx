import { connection } from "next/server";
import { Suspense } from "react";
import { LinkState } from "@/components/member/LinkState";
import { LiveRoom } from "@/components/member/LiveRoom";
import { getDb } from "@/db/client";
import { ChitError } from "@/server/chits";
import { memberRoom, resolveLink } from "@/server/members";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Content({ params }: { params: PageProps<"/m/[token]/room/[monthId]">["params"] }) {
  const { token, monthId } = await params;
  await connection();
  const db = await getDb();
  const link = await resolveLink(db, token);
  if (link === null) return <LinkState kind="invalid" />;
  if (link === "paused") return <LinkState kind="paused" />;
  if (!UUID.test(monthId)) return <LinkState kind="month" />;
  const initial = await memberRoom(db, link, monthId).catch((e) => {
    if (e instanceof ChitError) return null;
    throw e;
  });
  if (!initial) return <LinkState kind="month" />;
  return <LiveRoom token={token} initial={initial} />;
}

export default function Page(props: PageProps<"/m/[token]/room/[monthId]">) {
  return (
    <div className="theme-stage min-h-screen bg-bg text-ink">
      <Suspense fallback={<div className="mx-auto h-screen max-w-md animate-pulse" />}>
        <Content params={props.params} />
      </Suspense>
    </div>
  );
}
