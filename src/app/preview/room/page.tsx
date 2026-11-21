import type { Metadata } from "next";
import { PreviewBar } from "@/components/brand";
import { RoomPreview } from "@/components/room/RoomPreview";

export const metadata: Metadata = { title: "Auction room" };

export default function Page() {
  return (
    <>
      <div className="theme-stage bg-bg">
        <PreviewBar title="Auction room" stage />
      </div>
      <RoomPreview />
    </>
  );
}
