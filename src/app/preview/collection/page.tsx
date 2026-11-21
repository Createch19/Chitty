import type { Metadata } from "next";
import { Aurora, PreviewBar } from "@/components/brand";
import { CollectionPreview } from "@/components/collection/CollectionPreview";

export const metadata: Metadata = { title: "Collection & payout" };

export default function Page() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <Aurora />
      <PreviewBar title="Collection & payout" />
      <CollectionPreview />
    </div>
  );
}
