"use client";

import { Link2Off, PauseCircle } from "lucide-react";
import { Logo } from "@/components/brand";
import { useL } from "@/lib/prefs";

/** Shown when a member link is invalid/revoked, or the organiser's account is paused. */
export function LinkState({ kind }: { kind: "invalid" | "paused" | "month" }) {
  const L = useL();
  const t = {
    invalid: [L("This link doesn't work", "இந்த link வேலை செய்யவில்லை"), L("It may have been replaced by a new one. Please ask your chit organiser for your latest link.", "புதிய link அனுப்பப்பட்டிருக்கலாம். உங்கள் சீட்டு நடத்துநரிடம் புதிய link கேளுங்கள்.")],
    paused: [L("Temporarily unavailable", "தற்காலிகமாக கிடைக்கவில்லை"), L("This chit's account is paused right now. Please contact your organiser.", "இந்த சீட்டு கணக்கு இப்போது நிறுத்தப்பட்டுள்ளது. நடத்துநரை தொடர்பு கொள்ளுங்கள்.")],
    month: [L("Auction not found", "ஏலம் கிடைக்கவில்லை"), L("This auction isn't part of your chit.", "இந்த ஏலம் உங்கள் சீட்டில் இல்லை.")],
  }[kind];
  return (
    <div className="relative z-10 mx-auto flex min-h-[80vh] max-w-sm flex-col items-center justify-center px-6 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-3xl border border-line bg-glass text-ink-2">{kind === "paused" ? <PauseCircle size={30} /> : <Link2Off size={30} />}</span>
      <h1 className="font-display mt-5 text-[22px] font-extrabold">{t[0]}</h1>
      <p className="mt-2 text-[14px] text-ink-2">{t[1]}</p>
      <div className="mt-10 opacity-60">
        <Logo size={20} />
      </div>
    </div>
  );
}
