"use client";

import { AnimatePresence, motion } from "motion/react";
import { Bell, BellOff, BellRing, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { memberSubscribeAction, memberUnsubscribeAction } from "@/app/actions/member";
import { Button, useToast } from "@/components/ui/kit";
import { useL, useLang } from "@/lib/prefs";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

const keyBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function currentSub() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Turn push notifications on/off for every member ID saved on this phone (BUSINESS-CONCEPT §12). */
export function NotifyCard({ publicKey, tokens }: { publicKey: string; tokens: string[] }) {
  const L = useL();
  const [lang] = useLang();
  const toast = useToast();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const key = tokens.join(",");

  // find the state; if already on, re-send (all IDs on this phone, current language)
  useEffect(() => {
    let dead = false;
    const set = (s: State) => !dead && setState(s);
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || !publicKey) return set(ios && !standalone ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return set("denied");
      const sub = await currentSub();
      if (!sub || Notification.permission !== "granted") return set("off");
      set("on");
      await memberSubscribeAction(key.split(","), sub.toJSON(), lang);
    })().catch(() => set("unsupported"));
    return () => {
      dead = true;
    };
  }, [publicKey, key, lang]);

  const turnOn = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const r = await memberSubscribeAction(tokens, sub.toJSON(), lang);
      if (!r.ok) throw new Error("save failed");
      setState("on");
      toast(L("Notifications are on", "அறிவிப்புகள் இயக்கப்பட்டன"), "ok");
    } catch {
      toast(L("Couldn't turn on notifications. Try again.", "அறிவிப்புகளை இயக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."), "warn");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      const sub = await currentSub();
      if (sub) {
        await memberUnsubscribeAction(tokens, sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading" || state === "unsupported") return null;
  return (
    <AnimatePresence mode="wait">
      <motion.div key={state} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card flex items-start gap-3 p-4">
        <span className={state === "on" ? "grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[color-mix(in_oklab,var(--ok)_18%,transparent)] text-ok" : "gold-fill grid h-11 w-11 shrink-0 place-items-center rounded-2xl"}>
          {state === "on" ? <BellRing size={20} /> : state === "denied" ? <BellOff size={20} /> : <Bell size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold">
            {state === "on" ? L("Notifications are on", "அறிவிப்புகள் இயக்கத்தில்") : L("Get auction and payment alerts", "ஏலம், கட்டண அறிவிப்புகள் பெறுங்கள்")}
          </div>
          <div className="text-[12.5px] text-ink-2">
            {state === "on"
              ? L("You'll be told when the auction opens, when it closes, 2 days before the last day, and when your payment is marked.", "ஏலம் திறக்கும்போது, முடியும்போது, கடைசி நாளுக்கு 2 நாள் முன், கட்டணம் பதிவானபோது தெரிவிக்கப்படும்.")
              : state === "denied"
                ? L("Notifications are blocked for this site. Allow them in your browser's site settings, then reopen this page.", "இந்த தளத்துக்கு அறிவிப்புகள் தடுக்கப்பட்டுள்ளன. Browser site settings-ல் அனுமதித்து, பக்கத்தை மீண்டும் திறக்கவும்.")
                : state === "ios-install"
                  ? L("On iPhone, first add Chitty to your home screen (Share → Add to Home Screen), then open it from there.", "iPhone-ல் முதலில் Chitty-ஐ home screen-ல் சேர்க்கவும் (Share → Add to Home Screen), பிறகு அங்கிருந்து திறக்கவும்.")
                  : L("Free. Works for every ID saved on this phone.", "இலவசம். இந்த phone-ல் உள்ள எல்லா ID-க்கும்.")}
          </div>
          {state === "off" && (
            <Button size="sm" variant="gold" className="mt-2.5" icon={<Bell size={14} />} disabled={busy} onClick={() => void turnOn()}>
              {L("Turn on", "இயக்கு")}
            </Button>
          )}
          {state === "on" && (
            <div className="mt-2 flex items-center gap-3">
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ok">
                <Check size={13} /> {L(`${tokens.length} ID${tokens.length > 1 ? "s" : ""}`, `${tokens.length} ID`)}
              </span>
              <button className="text-[12px] font-semibold text-ink-3 underline underline-offset-2" disabled={busy} onClick={() => void turnOff()}>
                {L("Turn off", "நிறுத்து")}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
