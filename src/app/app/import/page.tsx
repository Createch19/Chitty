import type { Metadata } from "next";
import { Suspense } from "react";
import { ImportView } from "@/components/organiser/ImportView";
import { Frame, Shell, Skeleton } from "@/server/org-page";

export const metadata: Metadata = { title: "Import" };

export default function Page() {
  return (
    <Frame>
      <Suspense fallback={<Skeleton />}>
        <Shell>{() => <ImportView />}</Shell>
      </Suspense>
    </Frame>
  );
}
