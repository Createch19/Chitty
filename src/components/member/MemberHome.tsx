"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Download, Gavel, Smartphone, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { LangToggle, Logo } from "@/components/brand";
import { Badge, Button, Ring, Sphere, cx } from "@/components/ui/kit";
import { formatINR } from "@/domain/money";
import type { memberHome } from "@/server/members";
import { useL, useLang } from "@/lib/prefs";
import { useDateText } from "@/components/organiser/common";
import { Inbox, type InboxItem } from "./Inbox";
import { NotifyCard } from "./NotifyCard";

type Data = Awaited<ReturnType<typeof memberHome>>;
type Saved = { token: string; code: string; business: string; seat?: string };

/* IDs saved on this phone (one phone can hold several member IDs). */
const KEY = "chitty.ids";
const subs = new Set<() => void>();
const readSaved = (): Saved[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
};
let cache = "";
let parsed: Saved[] = [];
function useSaved() {
  return useSyncExternalStore(
    (cb) => (subs.add(cb), () => subs.delete(cb)),
    () => {
      let raw = "";
      try {
        raw = localStorage.getItem(KEY) || "[]";
      } catch {}
      if (raw !== cache) {
        cache = raw;
        parsed = readSaved();
      }
      return parsed;
    },
    () => parsed,
  );
}
function remember(s: Saved) {
  const list = readSaved().filter((x) => x.token !== s.token);
  try {
    localStorage.setItem(KEY, JSON.stringify([s, ...list].slice(0, 12)));
  } catch {}
  subs.forEach((f) => f());
}

type BIP = Event & { prompt: () => Promise<void> };

export function MemberHome({ token, d, today, publicKey, inbox, focus }: { token: string; d: Data; today: string; publicKey: string; inbox: InboxItem[]; focus?: string }) {
  const L = useL();
  const [lang] = useLang();
  const dt = useDateText();
  const saved = useSaved();
  const [openSched, setOpenSched] = useState(false);
  const [install, setInstall] = useState<BIP | null>(null);
  const [hideInstall, setHideInstall] = useState(false);
  const business = lang === "ta" && d.businessTa ? d.businessTa : d.business;
  const due = [...d.history].reverse().find((h) => !h.paid && !h.atPayout);
  const daysLeft = due ? Math.round((Date.parse(due.lastPayDate) - Date.parse(today)) / 86_400_000) : 0;

  useEffect(() => {
    remember({ token, code: d.me.code, business: d.business, seat: d.me.seatId });
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => {});
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as BIP);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [token, d.me.code, d.me.seatId, d.business]);

  const others = saved.filter((s) => s.token !== token);
  const seatNo = Number(d.me.code.slice(-2)) - 1;

  return (
    <div className="relative z-10 mx-auto w-full max-w-md px-4 pb-16 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-ink-3">{L("Your chit with", "உங்கள் சீட்டு")}</div>
          <div className="font-display truncate text-[19px] font-extrabold leading-tight">{business}</div>
        </div>
        <LangToggle />
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        <div className="relative flex shrink-0 items-center gap-2.5 rounded-2xl px-3 py-2.5">
          <span className="gold-fill absolute inset-0 -z-10 rounded-2xl" />
          <Sphere index={seatNo} size={30} />
          <span className="text-[#3a2300]">
            <span className="font-display block text-[15px] font-extrabold leading-tight">{d.me.code}</span>
            <span className="block text-[11.5px] text-[#6b4300]">{L(`Chit ${d.chit.code}`, `சீட்டு ${d.chit.code}`)}</span>
          </span>
        </div>
        {others.map((s) => (
          <Link key={s.token} href={`/m/${s.token}`} className="flex shrink-0 items-center gap-2.5 rounded-2xl border border-line bg-glass px-3 py-2.5">
            <Sphere index={Number(s.code.slice(-2)) - 1} size={30} />
            <span>
              <span className="font-display block text-[15px] font-extrabold leading-tight">{s.code}</span>
              <span className="block max-w-[110px] truncate text-[11.5px] text-ink-3">{s.business}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {d.chit.status === "draft" ? (
          <div className="card p-5 text-[14px] text-ink-2">{L("Your chit hasn't started yet. You'll see the schedule here once it starts.", "உங்கள் சீட்டு இன்னும் தொடங்கவில்லை.")}</div>
        ) : d.open && d.open.bidding ? (
          <Link href={`/m/${token}/room/${d.open.id}`} className="theme-stage relative block overflow-hidden rounded-[26px] border border-[rgba(255,211,77,.3)] bg-[radial-gradient(120%_130%_at_90%_0%,#3d2c70_0%,#161130_50%,#0a0813_100%)] p-5 text-ink shadow-pop">
            <div aria-hidden className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(255,211,77,.4),transparent_65%)] blur-xl" />
            <Badge tone="live">
              <span className="live-dot" /> {L("Auction is live", "ஏலம் நடக்கிறது")}
            </Badge>
            <div className="font-display mt-2 text-[21px] font-extrabold leading-tight">{L(`Month ${d.open.month} auction`, `${d.open.month}-வது மாத ஏலம்`)}</div>
            <span className="btn-gold mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold">
              <Gavel size={18} /> {L("Enter the room", "அறைக்குள் செல்")}
            </span>
          </Link>
        ) : d.next ? (
          <div className="card p-5">
            <div className="text-[12px] font-semibold uppercase tracking-[.12em] text-ink-3">{L("Next auction", "அடுத்த ஏலம்")}</div>
            <div className="font-display mt-1 text-[20px] font-extrabold">
              {L(`Month ${d.next.month}`, `${d.next.month}-வது மாதம்`)} · {dt(d.next.auctionDate)}
            </div>
            <div className="text-[13px] text-ink-2">{L(`Opens at ${d.chit.openTime}`, `${d.chit.openTime}-க்கு திறக்கும்`)}</div>
          </div>
        ) : null}

        {d.me.wonMonth != null && (
          <div className="card relative overflow-hidden p-5">
            <Badge tone="gold">🏆 {L(`You won month ${d.me.wonMonth}`, `${d.me.wonMonth}-வது மாதம் நீங்கள் வென்றீர்கள்`)}</Badge>
            <div className="font-display gold-text mt-2 text-[28px] font-extrabold leading-none">{formatINR(d.me.wonPrizePaise ?? 0)}</div>
            <div className="mt-1 text-[13px] text-ink-2">{L("This ID can't bid again in this chit.", "இந்த ID இனி இந்த சீட்டில் ஏலம் கேட்க முடியாது.")}</div>
          </div>
        )}

        {due && (
          <div className="card p-5">
            <div className="flex items-center gap-4">
              <Ring value={Math.max(0, Math.min(1, daysLeft / 10))} size={74} stroke={7}>
                <div className="text-center leading-none">
                  <div className={cx("font-display text-[20px] font-extrabold", daysLeft < 0 && "text-danger")}>{Math.abs(daysLeft)}</div>
                  <div className="text-[10px] text-ink-3">{daysLeft < 0 ? L("late", "தாமதம்") : L("days", "நாள்")}</div>
                </div>
              </Ring>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold text-ink-3">{L(`Pay for month ${due.month}`, `${due.month}-வது மாதம் கட்ட வேண்டியது`)}</div>
                <div className="font-display tabular text-[30px] font-extrabold leading-tight">{formatINR(due.amountPaise)}</div>
                <div className="text-[12.5px] text-ink-2">{L(`Last date ${dt(due.lastPayDate)}`, `கடைசி தேதி ${dt(due.lastPayDate)}`)}</div>
              </div>
            </div>
          </div>
        )}

        <NotifyCard publicKey={publicKey} tokens={[token, ...others.map((o) => o.token)]} />

        <Inbox items={inbox} focus={focus} />

        {d.history.length > 0 && (
          <div className="card p-5">
            <div className="text-[13px] font-bold text-ink-2">{L("Your payments", "உங்கள் கட்டணங்கள்")}</div>
            <ol className="relative mt-3 flex flex-col gap-3 border-l border-dashed border-line-2 pl-5">
              {d.history.map((h) => (
                <li key={h.month} className="relative">
                  <span className={cx("absolute -left-[29px] top-0.5 grid h-[18px] w-[18px] place-items-center rounded-full", h.paid ? "bg-ok text-white" : h.atPayout ? "border-2 border-line-2 bg-bg" : "border-2 border-gold-3 bg-bg")}>{h.paid && <Check size={11} strokeWidth={3.5} />}</span>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[14px] font-semibold">{L(`Month ${h.month}`, `${h.month}-வது மாதம்`)}</div>
                      <div className="text-[12px] text-ink-3">{h.paid ? (h.adjusted ? L("Adjusted from your prize", "பரிசில் கழிக்கப்பட்டது") : L("Paid", "கட்டியது")) : h.atPayout ? L("Taken from your prize at payout", "Payout-ல் உங்கள் தொகையில் கழிக்கப்படும்") : L(`Due by ${dt(h.lastPayDate)}`, `${dt(h.lastPayDate)}-க்குள்`)}</div>
                    </div>
                    <b className={cx("tabular", !h.paid && !h.atPayout && "text-gold-ink", h.atPayout && "text-ink-3")}>{formatINR(h.amountPaise)}</b>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="card overflow-hidden">
          <button onClick={() => setOpenSched((o) => !o)} className="flex w-full items-center justify-between p-5 text-left">
            <span className="text-[13px] font-bold text-ink-2">{L("Chit table (minimum discount)", "சீட்டு அட்டவணை (குறைந்தபட்ச தள்ளு)")}</span>
            <motion.span animate={{ rotate: openSched ? 180 : 0 }}>
              <ChevronDown size={18} />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {openSched && (
              <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                <div className="grid grid-cols-2 gap-x-6 px-5 pb-5 text-[13px]">
                  {d.schedule.map((r) => (
                    <div key={r.month} className="flex justify-between border-b border-line py-1.5">
                      <span className="text-ink-3">{r.month}</span>
                      <span className="tabular font-semibold">{r.minDiscountPaise ? formatINR(r.minDiscountPaise) : "—"}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {!hideInstall && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="card mt-4 flex items-start gap-3 p-4">
            <span className="gold-fill grid h-11 w-11 shrink-0 place-items-center rounded-2xl">
              <Smartphone size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold">{L("Add Chitty to your home screen", "Chitty-ஐ home screen-ல் சேர்க்கவும்")}</div>
              <div className="text-[12.5px] text-ink-2">
                {install
                  ? L("One tap, and it opens like an app.", "ஒரு தொடுதல்; app போல திறக்கும்.")
                  : L("Chrome: menu ⋮ → Add to Home screen. iPhone Safari: Share → Add to Home Screen.", "Chrome: ⋮ menu → Add to Home screen. iPhone Safari: Share → Add to Home Screen.")}
              </div>
              {install && (
                <Button size="sm" variant="gold" className="mt-2.5" icon={<Download size={14} />} onClick={() => void install.prompt().then(() => setHideInstall(true))}>
                  {L("Install", "நிறுவு")}
                </Button>
              )}
            </div>
            <button aria-label={L("Dismiss", "மூடு")} onClick={() => setHideInstall(true)} className="text-ink-3">
              <X size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-8 flex justify-center opacity-60">
        <Logo size={20} />
      </div>
    </div>
  );
}
