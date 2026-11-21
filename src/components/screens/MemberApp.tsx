"use client";

import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { BellRing, Check, ChevronDown, Download, Gavel, Smartphone, X } from "lucide-react";
import { useId, useState } from "react";
import { Logo } from "@/components/brand";
import { Badge, Button, Ring, Sphere, cx } from "@/components/ui/kit";
import { chitA, organiser, seatsA } from "@/lib/mock";
import { inr, schedule } from "@/lib/money";
import { useL, useLang } from "@/lib/prefs";

// Ravi holds two seats: A05 and A06. One phone, two IDs.
const MY_SEATS = [4, 5];

export function MemberApp() {
  const L = useL();
  const [lang] = useLang();
  const [me, setMe] = useState(4);
  const [install, setInstall] = useState(true);
  const [openSched, setOpenSched] = useState(false);
  const won = me === 5; // pretend A06 won month 2
  const group = useId();

  return (
    <div className="relative z-10 mx-auto w-full max-w-md px-4 pb-16 pt-4">
      {/* org header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-ink-3">{L("Your chit with", "உங்கள் சீட்டு")}</div>
          <div className="font-display text-[19px] font-extrabold leading-tight">{lang === "ta" ? organiser.businessTa : organiser.business}</div>
        </div>
        <button aria-label={L("Notifications", "அறிவிப்புகள்")} className="relative grid h-11 w-11 place-items-center rounded-2xl border border-line bg-glass">
          <BellRing size={19} />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[#ff4d5a]" />
        </button>
      </div>

      {/* ID switcher */}
      <LayoutGroup id={group}>
      <div className="mt-4 flex gap-2">
        {MY_SEATS.map((i) => (
          <button key={i} onClick={() => setMe(i)} className={cx("relative flex flex-1 items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-colors", me === i ? "border-transparent" : "border-line bg-glass")}>
            {me === i && <motion.span layoutId="me-id" className="gold-fill absolute inset-0 -z-10 rounded-2xl" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
            <Sphere index={i} size={30} />
            <span className={cx("min-w-0", me === i && "text-[#3a2300]")}>
              <span className="font-display block text-[15px] font-extrabold leading-tight">{seatsA[i].id}</span>
              <span className={cx("block text-[11.5px]", me === i ? "text-[#6b4300]" : "text-ink-3")}>{L("Chit A · ₹5L", "சீட்டு A · ₹5L")}</span>
            </span>
          </button>
        ))}
      </div>
      </LayoutGroup>

      <AnimatePresence mode="wait">
        <motion.div key={me} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className="mt-4 flex flex-col gap-4">
          {/* live banner */}
          {!won ? (
            <Link href="/preview/room" className="theme-stage relative block overflow-hidden rounded-[26px] border border-[rgba(255,211,77,.3)] bg-[radial-gradient(120%_130%_at_90%_0%,#3d2c70_0%,#161130_50%,#0a0813_100%)] p-5 text-ink shadow-pop">
              <div aria-hidden className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(255,211,77,.4),transparent_65%)] blur-xl" />
              <Badge tone="live">
                <span className="live-dot" /> {L("Auction is live", "ஏலம் நடக்கிறது")}
              </Badge>
              <div className="font-display mt-2 text-[21px] font-extrabold leading-tight">{L("Month 2 auction", "2-வது மாத ஏலம்")}</div>
              <div className="mt-1 text-[13.5px] text-ink-2">
                {L("Current bid", "தற்போதைய ஏலம்")} <b className="text-gold-2">₹1,52,000</b> · {L("13 joined", "13 பேர் இணைந்தனர்")}
              </div>
              <span className="btn-gold mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold">
                <Gavel size={18} /> {L("Enter the room", "அறைக்குள் செல்")}
              </span>
            </Link>
          ) : (
            <div className="card relative overflow-hidden p-5">
              <div aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[radial-gradient(circle,var(--aurora-1),transparent_65%)]" />
              <Badge tone="gold">🏆 {L("You won month 2", "2-வது மாதம் நீங்கள் வென்றீர்கள்")}</Badge>
              <div className="font-display gold-text mt-2 text-[30px] font-extrabold leading-none">{inr(355000)}</div>
              <div className="mt-1 text-[13px] text-ink-2">{L("Payout after everyone pays (by 20 Dec). This ID can't bid again.", "அனைவரும் கட்டிய பின் payout (20 டிச). இந்த ID மீண்டும் ஏலம் கேட்க முடியாது.")}</div>
            </div>
          )}

          {/* due card */}
          <div className="card p-5">
            <div className="flex items-center gap-4">
              <Ring value={4 / 10} size={74} stroke={7}>
                <div className="text-center leading-none">
                  <div className="font-display text-[20px] font-extrabold">6</div>
                  <div className="text-[10px] text-ink-3">{L("days", "நாள்")}</div>
                </div>
              </Ring>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold text-ink-3">{L("Pay for month 2", "2-வது மாதம் கட்ட வேண்டியது")}</div>
                <div className="font-display tabular text-[30px] font-extrabold leading-tight">{inr(17750)}</div>
                <div className="text-[12.5px] text-ink-2">{L("Last date 20 Dec 2026", "கடைசி தேதி 20 டிச 2026")}</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-[color-mix(in_oklab,var(--ink)_4%,transparent)] p-3 text-[12.5px]">
              <div>
                <div className="text-ink-3">{L("Discount this month", "இந்த மாத தள்ளு")}</div>
                <div className="tabular font-bold">{inr(145000)}</div>
              </div>
              <div>
                <div className="text-ink-3">{L("Your share", "உங்கள் பங்கு")}</div>
                <div className="tabular font-bold text-ok">− {inr(7250)}</div>
              </div>
            </div>
          </div>

          {/* history */}
          <div className="card p-5">
            <div className="text-[13px] font-bold text-ink-2">{L("Your payments", "உங்கள் கட்டணங்கள்")}</div>
            <ol className="relative mt-3 flex flex-col gap-3 border-l border-dashed border-line-2 pl-5">
              {[
                { m: 1, amt: 25000, ok: true, d: "14 Nov" },
                { m: 2, amt: 17750, ok: false, d: "20 Dec" },
              ].map((p) => (
                <li key={p.m} className="relative">
                  <span className={cx("absolute -left-[29px] top-0.5 grid h-[18px] w-[18px] place-items-center rounded-full", p.ok ? "bg-ok text-white" : "border-2 border-gold-3 bg-bg")}>{p.ok && <Check size={11} strokeWidth={3.5} />}</span>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[14px] font-semibold">{L(`Month ${p.m}`, `${p.m}-வது மாதம்`)}</div>
                      <div className="text-[12px] text-ink-3">{p.ok ? L(`Paid · ${p.d}`, `கட்டியது · ${p.d}`) : L(`Due · ${p.d}`, `கட்ட வேண்டியது · ${p.d}`)}</div>
                    </div>
                    <b className={cx("tabular", !p.ok && "text-gold-ink")}>{inr(p.amt)}</b>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* schedule */}
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
                    {schedule(chitA).map((r) => (
                      <div key={r.month} className="flex justify-between border-b border-line py-1.5">
                        <span className="text-ink-3">{r.month}</span>
                        <span className="tabular font-semibold">{r.bidding ? inr(r.min) : "—"}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* install prompt */}
      <AnimatePresence>
        {install && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="card mt-4 flex items-start gap-3 p-4">
            <span className="gold-fill grid h-11 w-11 shrink-0 place-items-center rounded-2xl">
              <Smartphone size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold">{L("Add Chitty to your home screen", "Chitty-ஐ home screen-ல் சேர்க்கவும்")}</div>
              <div className="text-[12.5px] text-ink-2">{L("Then tap Allow, so we can tell you when the auction opens.", "பிறகு Allow தொடவும், ஏலம் தொடங்கும்போது சொல்கிறோம்.")}</div>
              <Button size="sm" variant="gold" className="mt-2.5" icon={<Download size={14} />}>
                {L("Install", "நிறுவு")}
              </Button>
            </div>
            <button aria-label={L("Dismiss", "மூடு")} onClick={() => setInstall(false)} className="text-ink-3">
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
