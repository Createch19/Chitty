"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/brand";

export function OpenRedirect() {
  const router = useRouter();
  useEffect(() => {
    // from a notification: /open?s=<seat>&n=<message>[&room=<month>] → that ID's page (the token never leaves the phone)
    const q = new URLSearchParams(window.location.search);
    const uuid = /^[0-9a-f-]{36}$/i;
    let to = "/login";
    try {
      const ids = JSON.parse(localStorage.getItem("chitty.ids") || "[]") as { token: string; seat?: string }[];
      const s = q.get("s");
      const hit = (s && ids.find((x) => x.seat === s)) || ids[0];
      if (hit?.token) {
        const room = q.get("room");
        const n = q.get("n");
        to = room && uuid.test(room) ? `/m/${hit.token}/room/${room}` : `/m/${hit.token}${n && uuid.test(n) ? `?n=${n}` : ""}`;
      }
    } catch {}
    router.replace(to);
  }, [router]);
  return (
    <div className="relative z-10 grid min-h-screen place-items-center">
      <div className="animate-pulse">
        <Logo size={44} />
      </div>
    </div>
  );
}
