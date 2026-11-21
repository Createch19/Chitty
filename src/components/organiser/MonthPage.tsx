"use client";

import confetti from "canvas-confetti";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, CalendarDays, Check, Crown, Dices, Gavel, HandCoins, MessageCircle, Play, RotateCcw, Users, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { changeDateAction, closeAuctionAction, lotteryAction, openMonthAction, payoutAction, setPaidAction, undoPayoutAction } from "@/app/actions/chits";
import { BowlStage } from "@/components/collection/BowlStage";
import { Badge, Button, ConfirmDialog, CountUp, Sphere, cx, useToast } from "@/components/ui/kit";
import { groupText, whatsappText } from "@/domain/messages";
import { formatINR } from "@/domain/money";
import { addDays } from "@/domain/rules";
import { haptic, useL, useLang } from "@/lib/prefs";
import { useDateText, useErrorText } from "./common";

export type Board = {
  chit: { id: string; code: string; status: string; months: number; display: string; startDate: string | null; openTime: string; terms: { totalPaise: number; months: number; incrementPaise: number } };
  month: { id: string; month: number; status: string; bidding: boolean; auctionDate: string; lastPayDate: string; minDiscountPaise: number; discountPaise: number | null; winnerSeatId: string | null; lottery: boolean };
  seats: { id: string; code: string; name: string; phone: string; isOrganiser: boolean; wonMonth: number | null; joined: boolean; hasArrears: boolean; paid: boolean; adjusted: boolean }[];
  bids: { id: number; seatId: string; amountPaise: number; at: string }[];
  leader: { seatId: string; amountPaise: number } | null;
  nextMinPaise: number;
  payout: null | { payPaise: number; prizePaise: number; ownPaise: number; arrears: { monthId: string; month: number; amountPaise: number }[]; cashPaise: number; roundingDiffPaise: number; paidCount: number; seatsTotal: number; ready: boolean; done: boolean };
};

export function MonthPage({ b, business, today }: { b: Board; business: string; today: string }) {
  const L = useL();
  const [lang] = useLang();
  const dt = useDateText();
  const router = useRouter();
  const m = b.month;

  // live push: members bid from their phones; the server says "changed" and we re-render with fresh data
  useEffect(() => {
    const es = new EventSource(`/api/org/months/${m.id}/events`);
    let first = true;
    es.addEventListener("changed", () => {
      if (first) return void (first = false); // the stream's first push is just "connected"
      router.refresh();
    });
    return () => es.close();
  }, [m.id, router]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/app/chits/${b.chit.id}`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink">
            <ArrowLeft size={14} /> {L(`Chit ${b.chit.code}`, `சீட்டு ${b.chit.code}`)}
          </Link>
          <h1 className="font-display mt-1 text-[26px] font-extrabold leading-tight">
            {L(`Month ${m.month}`, `${m.month}-வது மாதம்`)} <span className="text-ink-3">·</span> {dt(m.auctionDate)}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {m.status !== "closed" && (
          <a
            href={`https://wa.me/?text=${encodeURIComponent(groupText(m.status === "open" ? "open" : "date", { business, chitCode: b.chit.code, totalPaise: b.chit.terms.totalPaise, month: m.month, auctionDate: m.auctionDate, openTime: b.chit.openTime, minDiscountPaise: m.minDiscountPaise }, lang))}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[rgba(37,211,102,.4)] px-3 text-[12.5px] font-semibold text-[#1fa855] hover:bg-[rgba(37,211,102,.1)]"
          >
            <MessageCircle size={14} /> {L("Post in WhatsApp group", "WhatsApp group-ல் போடு")}
          </a>
        )}
        {m.status === "open" ? (
          <Badge tone="live">
            <span className="live-dot" /> {L("Auction live", "ஏலம் நடக்கிறது")}
          </Badge>
        ) : m.status === "closed" ? (
          b.payout?.done ? <Badge tone="ok">{L("Paid out", "Payout முடிந்தது")}</Badge> : <Badge tone="gold">{L(`Last day to pay ${dt(m.lastPayDate)}`, `கட்ட கடைசி நாள் ${dt(m.lastPayDate)}`)}</Badge>
        ) : (
          <Badge>{L("Upcoming", "வரவிருக்கிறது")}</Badge>
        )}
        </div>
      </div>
      {m.status === "pending" && <Pending b={b} />}
      {m.status === "open" && <Auction b={b} />}
      {m.status === "closed" && <Collection b={b} business={business} today={today} />}
    </div>
  );
}

/* ------------------------------- pending ------------------------------- */

function Pending({ b }: { b: Board }) {
  const L = useL();
  const err = useErrorText();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(b.month.auctionDate);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="card p-5">
        <div className="font-display text-[17px] font-bold">{L("Opens automatically", "தானாக திறக்கும்")}</div>
        <p className="mt-1 text-[13.5px] text-ink-2">
          {b.month.month === b.chit.months
            ? L("Last month: the one remaining ID wins at no discount.", "கடைசி மாதம்: மீதமுள்ள ஒரு ID தள்ளு இல்லாமல் வெல்லும்.")
            : L(`On the auction day at the chit's open time. Minimum discount ${formatINR(b.month.minDiscountPaise)}.`, `ஏல நாளில் திறக்கும் நேரத்தில். குறைந்தபட்ச தள்ளு ${formatINR(b.month.minDiscountPaise)}.`)}
        </p>
        <Button variant="gold" className="mt-4" icon={<Play size={16} />} disabled={pending} onClick={() => setConfirm(true)}>
          {L("Open now", "இப்போதே திற")}
        </Button>
      </div>
      <div className="card p-5">
        <div className="font-display flex items-center gap-2 text-[17px] font-bold">
          <CalendarDays size={17} /> {L("Move this month's date", "இந்த மாத தேதியை மாற்று")}
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-3 h-12 w-full rounded-2xl border border-line-2 bg-[color-mix(in_oklab,var(--ink)_3%,transparent)] px-4 text-[15px] outline-none focus:border-gold-3" />
        <Button
          className="mt-3"
          disabled={pending || date === b.month.auctionDate}
          onClick={() =>
            start(async () => {
              const r = await changeDateAction(b.month.id, date);
              toast(r.ok ? L("Date changed", "தேதி மாற்றப்பட்டது") : err((r as { error: string }).error), r.ok ? "ok" : "warn");
            })
          }
        >
          {L("Save date", "தேதி சேமி")}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        icon={<span className="gold-fill grid h-14 w-14 place-items-center rounded-full"><Play size={26} /></span>}
        title={L(`Open month ${b.month.month} now?`, `${b.month.month}-வது மாதத்தை இப்போதே திறக்கலாமா?`)}
        yes={L("Yes, open", "ஆம், திற")}
        no={L("No", "இல்லை")}
        onNo={() => setConfirm(false)}
        onYes={() => {
          setConfirm(false);
          start(async () => {
            const r = await openMonthAction(b.month.id);
            toast(r.ok ? L("Opened", "திறக்கப்பட்டது") : err((r as { error: string }).error), r.ok ? "ok" : "warn");
          });
        }}
      />
    </div>
  );
}

/* ------------------------------- open auction ------------------------------- */

function Auction({ b }: { b: Board }) {
  const L = useL();
  const err = useErrorText();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<null | "close" | "lottery">(null);
  const [spin, setSpin] = useState<string | null>(null);
  const seat = (id: string) => b.seats.find((s) => s.id === id)!;
  const label = (id: string) => `${seat(id).code} · ${seat(id).name}`;
  const eligible = b.seats.filter((s) => s.wonMonth == null);
  const joined = eligible.filter((s) => s.joined).length;
  const prize = b.chit.terms.totalPaise - (b.leader?.amountPaise ?? b.month.minDiscountPaise);
  const celebrate = () => {
    haptic([60, 50, 120]);
    const colors = ["#ffd34d", "#fff1b0", "#f0a90a", "#6ff0ff", "#ffffff"];
    confetti({ particleCount: 140, spread: 100, startVelocity: 48, origin: { y: 0.35 }, colors });
  };

  const runLottery = () =>
    start(async () => {
      // spin through the eligible IDs while the server draws
      let i = 0;
      const t = setInterval(() => setSpin(eligible[i++ % eligible.length].code), 90);
      const r = await lotteryAction(b.month.id);
      await new Promise((res) => setTimeout(res, 1800));
      clearInterval(t);
      if (r.ok) {
        const w = (r.data as { winnerSeatId: string }).winnerSeatId;
        setSpin(seat(w).code);
        celebrate();
        toast(L(`Lottery winner: ${label(w)}`, `குலுக்கல் வெற்றியாளர்: ${label(w)}`), "gold");
        setTimeout(() => setSpin(null), 2500);
      } else {
        setSpin(null);
        toast(err((r as { error: string }).error), "warn");
      }
    });

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="theme-stage relative overflow-hidden rounded-[28px] border border-[rgba(255,211,77,.25)] bg-[radial-gradient(120%_120%_at_50%_0%,#3a2a6b_0%,#171230_50%,#0b0914_100%)] p-6 text-ink shadow-pop">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
            <Users size={15} /> {L(`Joined ${joined}/${eligible.length}`, `இணைந்தவர்கள் ${joined}/${eligible.length}`)}
          </span>
          <span className="text-[13px] text-ink-2">{L(`Minimum ${formatINR(b.month.minDiscountPaise)}`, `குறைந்தபட்சம் ${formatINR(b.month.minDiscountPaise)}`)}</span>
        </div>
        <div className="mt-6 flex flex-col items-center text-center">
          <div className="relative grid h-40 w-40 place-items-center">
            <span className="absolute inset-0 rounded-full border border-dashed border-[rgba(255,211,77,.5)] [animation:spin_14s_linear_infinite]" />
            <span className="gold-fill float-slow grid h-32 w-32 place-items-center rounded-full shadow-[0_0_70px_rgba(255,211,77,.55),inset_-6px_-8px_14px_rgba(0,0,0,.25),inset_5px_5px_10px_rgba(255,255,255,.6)]">
              <span>
                <span className="block text-[9.5px] font-bold tracking-wider text-[#6b4300]">{b.leader ? L("CURRENT BID", "தற்போதைய ஏலம்") : L("MINIMUM", "குறைந்தபட்சம்")}</span>
                <CountUp value={(b.leader?.amountPaise ?? b.month.minDiscountPaise) / 100} className="font-display block text-[19px] font-extrabold" />
                <span className="block text-[10px] font-semibold text-[#5b3a05]">→ {formatINR(prize)}</span>
              </span>
            </span>
          </div>
          <div className="mt-4 text-[14px] text-ink-2">{b.leader ? <>{L("Leading", "முன்னிலை")}: <b className="text-gold-2">{label(b.leader.seatId)}</b></> : L("No bids yet", "இன்னும் ஏலம் இல்லை")}</div>
          <AnimatePresence>
            {spin && (
              <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 rounded-2xl border border-[rgba(125,255,176,.5)] bg-[rgba(125,255,176,.12)] px-5 py-2 font-display text-[26px] font-extrabold text-[#7dffb0]">
                {spin}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="mt-6">
          {b.leader ? (
            <Button variant="gold" size="lg" className="w-full" icon={<Gavel size={18} />} disabled={pending} onClick={() => setConfirm("close")}>
              {L("Close the auction", "ஏலத்தை முடி")}
            </Button>
          ) : (
            <Button variant="gold" size="lg" className="w-full" icon={<Dices size={18} />} disabled={pending} onClick={() => setConfirm("lottery")}>
              {L("No bids — run the lottery", "ஏலம் இல்லை — குலுக்கல்")}
            </Button>
          )}
          <p className="mt-2 text-center text-[12px] text-ink-3">{L("Closing is final. Members bid from their own link; this page updates live.", "முடித்தால் நிரந்தரம். உறுப்பினர்கள் தங்கள் link-ல் ஏலம் கேட்பார்கள்; இந்தப் பக்கம் உடனுக்குடன் மாறும்.")}</p>
        </div>
      </div>

      <div className="card p-4 sm:p-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[13px] font-bold text-ink-2">{L("Bids", "ஏலங்கள்")}</div>
          <div className="text-[12px] text-ink-3">{b.bids.length}</div>
        </div>
        {b.bids.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-ink-3">{L("No bids yet.", "இன்னும் ஏலம் இல்லை.")}</div>
        ) : (
          <ul>
            <AnimatePresence initial={false}>
              {b.bids.map((x, i) => (
                <motion.li key={x.id} layout initial={{ opacity: 0, x: -14, backgroundColor: "rgba(255,211,77,.22)" }} animate={{ opacity: 1, x: 0, backgroundColor: "rgba(255,211,77,0)" }} className="flex items-center gap-3 rounded-xl border-b border-line px-1 py-2 last:border-0">
                  <Sphere index={Number(seat(x.seatId).code.slice(-2)) - 1} size={26} />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                    {label(x.seatId)}
                    {i === 0 && <Crown size={13} className="ml-1.5 inline -translate-y-px text-gold-ink" />}
                  </span>
                  <b className="font-display tabular text-[15px] text-gold-ink">{formatINR(x.amountPaise)}</b>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={confirm === "close"}
        icon={<span className="gold-fill grid h-14 w-14 place-items-center rounded-full"><Gavel size={26} /></span>}
        title={L("Close the auction?", "ஏலத்தை முடிக்கலாமா?")}
        body={b.leader ? <>{L("Winner", "வெற்றியாளர்")} <b className="text-ink">{label(b.leader.seatId)}</b>, <b className="text-gold-ink">{formatINR(b.leader.amountPaise)}</b><br /><span className="text-[12.5px]">{L("This is final.", "இது நிரந்தரம்.")}</span></> : null}
        yes={L("Yes, close", "ஆம், முடி")}
        no={L("No", "இல்லை")}
        onNo={() => setConfirm(null)}
        onYes={() => {
          setConfirm(null);
          start(async () => {
            const r = await closeAuctionAction(b.month.id);
            if (r.ok) celebrate();
            else toast(err((r as { error: string }).error), "warn");
          });
        }}
      />
      <ConfirmDialog
        open={confirm === "lottery"}
        icon={<span className="gold-fill grid h-14 w-14 place-items-center rounded-full"><Dices size={26} /></span>}
        title={L("Nobody bid. Run the lottery?", "யாரும் ஏலம் கேட்கவில்லை. குலுக்கல் போடலாமா?")}
        body={L(`All ${eligible.length} IDs that haven't won join the draw. The winner gets the prize at the minimum ${formatINR(b.month.minDiscountPaise)}.`, `இன்னும் வெல்லாத ${eligible.length} ID-களும் குலுக்கலில். வெற்றியாளருக்கு குறைந்தபட்சம் ${formatINR(b.month.minDiscountPaise)}-ல்.`)}
        yes={L("Yes, run it", "ஆம், போடு")}
        no={L("No", "இல்லை")}
        onNo={() => setConfirm(null)}
        onYes={() => {
          setConfirm(null);
          runLottery();
        }}
      />
    </div>
  );
}

/* ------------------------------- collection & payout ------------------------------- */

function Collection({ b, business, today }: { b: Board; business: string; today: string }) {
  const L = useL();
  const [lang] = useLang();
  const err = useErrorText();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [dropKey, setDropKey] = useState(0);
  const [pouring, setPouring] = useState(false);
  const [dialog, setDialog] = useState<null | { kind: "pay" | "unpay"; seatId: string } | { kind: "payout" | "undo" }>(null);
  const p = b.payout!;
  const winner = b.seats.find((s) => s.id === b.month.winnerSeatId)!;
  const discount = b.month.discountPaise ?? 0;
  const seat = (id: string) => b.seats.find((s) => s.id === id)!;
  const prevPaid = useRef(p.paidCount);

  useEffect(() => {
    if (p.paidCount > prevPaid.current && !p.done) setDropKey((k) => k + 1);
    prevPaid.current = p.paidCount;
  }, [p.paidCount, p.done]);

  const onPoured = useCallback(() => {
    setPouring(false);
    haptic([40, 40, 120]);
    confetti({ particleCount: 120, spread: 90, origin: { x: 0.75, y: 0.35 }, colors: ["#ffd34d", "#fff1b0", "#43d68a", "#ffffff"] });
  }, []);

  // WhatsApp backup (§12): the same text as the app notification; within 2 days of the last day it is the reminder
  const reminderDue = today >= addDays(b.month.lastPayDate, -2);
  const message = (s: Board["seats"][number]) =>
    whatsappText(
      reminderDue && !s.paid ? "reminder" : "closed",
      {
        business,
        code: s.code,
        chitCode: b.chit.code,
        totalPaise: b.chit.terms.totalPaise,
        chitDay: b.chit.startDate ? Number(b.chit.startDate.slice(8, 10)) : null,
        month: b.month.month,
        auctionDate: b.month.auctionDate,
        lastPayDate: b.month.lastPayDate,
        discountPaise: discount,
        sharePaise: Math.round(discount / b.chit.months),
        payPaise: p.payPaise,
      },
      lang,
    );

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string, ok?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast(okText, "ok");
        ok?.();
      } else toast(err((r as { error: string }).error), "warn");
    });

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)]">
      <section className="flex flex-col gap-4">
        <div className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Sphere index={Number(winner.code.slice(-2)) - 1} size={44} />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold uppercase tracking-[.12em] text-gold-ink">{b.month.lottery ? L("Lottery winner", "குலுக்கல் வெற்றியாளர்") : b.month.month === 1 ? L("Month 1 · organiser", "1-வது மாதம் · organiser") : L("Winner", "வெற்றியாளர்")}</div>
              <div className="font-display text-[19px] font-extrabold">
                {winner.code} · {winner.name}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[12px] text-ink-3">{L("Discount", "தள்ளு")}</div>
              <div className="font-display tabular text-[18px] font-extrabold">{formatINR(discount)}</div>
            </div>
          </div>
        </div>

        <div className="card overflow-hidden p-4 text-ink sm:p-6">
          <BowlStage progress={p.paidCount / p.seatsTotal} dropKey={dropKey} pouring={pouring} paidOut={p.done && !pouring} winnerLabel={`${winner.code} · ${winner.name}`} winnerHue={((Number(winner.code.slice(-2)) - 1) * 47 + 175) % 360} onPoured={onPoured} />
          <div className="mt-2 grid grid-cols-3 gap-2 text-center sm:gap-3">
            <Stat label={p.done ? L("Paid out", "கொடுத்தது") : L("Collected", "வசூலானது")}>
              <CountUp value={(p.done ? p.prizePaise : p.paidCount * p.payPaise) / 100} className={cx("font-display text-[16px] font-extrabold sm:text-[22px]", p.done ? "text-ok" : "gold-text-adaptive")} />
            </Stat>
            <Stat label={L(`Total due · ${p.seatsTotal} IDs`, `மொத்தம் · ${p.seatsTotal} ID`)}>
              <span className="font-display tabular text-[16px] font-extrabold sm:text-[22px]">{formatINR(p.payPaise * p.seatsTotal)}</span>
            </Stat>
            <Stat label={L("Paid", "கட்டியவர்கள்")}>
              <span className="font-display tabular text-[16px] font-extrabold sm:text-[22px]">
                {p.paidCount}
                <span className="text-ink-3">/{p.seatsTotal}</span>
              </span>
            </Stat>
          </div>
        </div>

        <div className={cx("card p-5 transition-shadow", p.ready && !p.done && "shadow-[0_0_0_2px_var(--gold-2),var(--shadow-card)]")}>
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[.12em] text-gold-ink">
            <HandCoins size={15} /> {L("Payout", "Payout")}
          </div>
          <div className="mt-3 divide-y divide-line rounded-2xl border border-line text-[14px]">
            <Line k={L("Prize (recorded)", "சீட்டுத் தொகை (பதிவு)")} v={formatINR(p.prizePaise)} />
            <Line k={L("Their own installment, adjusted", "அவர் கட்ட வேண்டியது, கழிவு")} v={`− ${formatINR(p.ownPaise)}`} muted />
            {p.arrears.map((a) => (
              <Line key={a.monthId} k={L(`Arrears, month ${a.month}, adjusted`, `${a.month}-வது மாத பாக்கி, கழிவு`)} v={`− ${formatINR(a.amountPaise)}`} muted />
            ))}
            <Line k={L("Cash to hand over", "கையில் கொடுப்பது")} v={formatINR(p.cashPaise)} strong />
          </div>
          {p.roundingDiffPaise !== 0 && <p className="mt-2 text-[12px] text-ink-3">{L(`Rounding: ${formatINR(Math.abs(p.roundingDiffPaise))} ${p.roundingDiffPaise > 0 ? "extra collected (yours)" : "short (you cover it)"}.`, `Rounding: ${formatINR(Math.abs(p.roundingDiffPaise))} ${p.roundingDiffPaise > 0 ? "கூடுதல் (உங்களுக்கு)" : "குறைவு (நீங்கள் போடுவது)"}.`)}</p>}
          {p.done ? (
            <Button className="mt-4 w-full" icon={<RotateCcw size={16} />} disabled={pending} onClick={() => setDialog({ kind: "undo" })}>
              {L("Undo payout", "Payout-ஐ திருத்து")}
            </Button>
          ) : (
            <Button variant="gold" size="lg" className="mt-4 w-full" icon={<HandCoins size={18} />} disabled={!p.ready || pending} onClick={() => setDialog({ kind: "payout" })}>
              {p.ready ? L(`Pay out ${formatINR(p.cashPaise)}`, `${formatINR(p.cashPaise)} payout கொடு`) : L(`Waiting for ${p.seatsTotal - 1 - (p.paidCount - (winner.paid ? 1 : 0))} more`, `இன்னும் ${p.seatsTotal - 1 - (p.paidCount - (winner.paid ? 1 : 0))} பேர் கட்ட வேண்டும்`)}
            </Button>
          )}
        </div>
      </section>

      <section className="card p-2 sm:p-3">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="text-[13px] font-bold text-ink-2">{L(`Member IDs · ${formatINR(p.payPaise)} each`, `Member IDs · ஒவ்வொருவரும் ${formatINR(p.payPaise)}`)}</div>
        </div>
        <ul>
          {b.seats.map((s) => {
            const isWinner = s.id === winner.id;
            return (
              <li key={s.id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-[color-mix(in_oklab,var(--ink)_4%,transparent)]">
                <Sphere index={Number(s.code.slice(-2)) - 1} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="font-display flex items-center gap-1.5 text-[15px] font-bold leading-tight">
                    {s.code}
                    {s.isOrganiser && <Badge tone="violet" className="px-2 py-0 font-sans text-[10.5px]">{L("You", "நீங்கள்")}</Badge>}
                    {s.hasArrears && !isWinner && <Badge tone="warn" className="px-2 py-0 font-sans text-[10.5px]">{L("Arrears", "பாக்கி")}</Badge>}
                  </div>
                  <div className="truncate text-[12.5px] text-ink-2">
                    {s.name} {isWinner && <span className="text-ink-3">· {L("winner, adjusted at payout", "வெற்றியாளர், payout-ல் கழிவு")}</span>}
                  </div>
                </div>
                {!isWinner && (
                  <a aria-label={L("Send on WhatsApp", "WhatsApp-ல் அனுப்பு")} href={`https://wa.me/91${s.phone}?text=${encodeURIComponent(message(s))}`} target="_blank" rel="noreferrer" className="grid h-9 w-9 place-items-center rounded-xl text-[#25d366] hover:bg-[rgba(37,211,102,.12)]">
                    <MessageCircle size={18} />
                  </a>
                )}
                {isWinner ? (
                  <Badge tone={s.paid ? "ok" : "plain"}>{s.paid ? L("Paid (adjusted)", "Paid (கழிவு)") : L("At payout", "Payout-ல்")}</Badge>
                ) : (
                  <button
                    onClick={() => setDialog({ kind: s.paid ? "unpay" : "pay", seatId: s.id })}
                    disabled={pending || (s.paid && p.done) || s.adjusted}
                    className={cx("inline-flex h-9 min-w-[88px] shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] font-bold transition-colors disabled:opacity-60 sm:min-w-[104px]", s.paid ? "bg-ok text-white shadow-[0_8px_20px_-10px_var(--ok)]" : "btn-ghost")}
                  >
                    {s.paid ? (
                      <>
                        <Check size={15} strokeWidth={3} /> {s.adjusted ? L("Adjusted", "கழிவு") : L("Paid", "Paid")}
                      </>
                    ) : (
                      L("Mark paid", "Paid ஆக்கு")
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <ConfirmDialog
        open={dialog?.kind === "pay"}
        tone="ok"
        icon={<span className="grid h-14 w-14 place-items-center rounded-full bg-ok-soft text-ok"><Check size={28} /></span>}
        title={dialog && "seatId" in dialog ? L(`Mark ${seat(dialog.seatId).code} as paid?`, `${seat(dialog.seatId).code}-ஐ Paid ஆக்கலாமா?`) : ""}
        body={L(`${formatINR(p.payPaise)} for month ${b.month.month}. A receipt goes to the member.`, `${b.month.month}-வது மாதம் ${formatINR(p.payPaise)}. உறுப்பினருக்கு ரசீது போகும்.`)}
        yes={L("Yes", "ஆம்")}
        no={L("No", "இல்லை")}
        onNo={() => setDialog(null)}
        onYes={() => {
          const d = dialog as { seatId: string };
          setDialog(null);
          haptic(25);
          act(() => setPaidAction(b.month.id, d.seatId, true), L(`${seat(d.seatId).code} marked paid · receipt sent`, `${seat(d.seatId).code} Paid · ரசீது அனுப்பப்பட்டது`));
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === "unpay"}
        tone="danger"
        icon={<span className="grid h-14 w-14 place-items-center rounded-full bg-danger-soft text-danger"><X size={28} /></span>}
        title={dialog && "seatId" in dialog ? L(`Remove the paid tick for ${seat(dialog.seatId).code}?`, `${seat(dialog.seatId).code}-ன் Paid-ஐ நீக்கலாமா?`) : ""}
        body={L("Recorded in the audit log; a correction goes to the member.", "Audit log-ல் பதிவாகும்; திருத்தம் அனுப்பப்படும்.")}
        yes={L("Yes, remove", "ஆம், நீக்கு")}
        no={L("No", "இல்லை")}
        onNo={() => setDialog(null)}
        onYes={() => {
          const d = dialog as { seatId: string };
          setDialog(null);
          act(() => setPaidAction(b.month.id, d.seatId, false), L("Paid tick removed · correction sent", "Paid நீக்கப்பட்டது · திருத்தம் அனுப்பப்பட்டது"));
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === "payout"}
        icon={<span className="gold-fill grid h-14 w-14 place-items-center rounded-full"><HandCoins size={26} /></span>}
        title={L("Mark the payout as done?", "Payout கொடுத்ததாக பதிவு செய்யலாமா?")}
        body={L(`Cash ${formatINR(p.cashPaise)} to ${winner.code}. The full prize ${formatINR(p.prizePaise)} is recorded and their own share is marked paid.`, `${winner.code}-க்கு கையில் ${formatINR(p.cashPaise)}. முழு ${formatINR(p.prizePaise)} பதிவாகும்; அவர் பங்கு Paid ஆகும்.`)}
        yes={L("Yes", "ஆம்")}
        no={L("No", "இல்லை")}
        onNo={() => setDialog(null)}
        onYes={() => {
          setDialog(null);
          act(() => payoutAction(b.month.id), L(`${winner.code}: ${formatINR(p.ownPaise)} adjusted from the payout`, `${winner.code}: ${formatINR(p.ownPaise)} payout-ல் கழிக்கப்பட்டது`), () => {
            setDropKey((k) => k + 1);
            setTimeout(() => setPouring(true), 1300);
          });
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === "undo"}
        tone="danger"
        icon={<span className="grid h-14 w-14 place-items-center rounded-full bg-danger-soft text-danger"><RotateCcw size={24} /></span>}
        title={L("Undo this payout?", "இந்த payout-ஐ திருத்தலாமா?")}
        body={L("The winner's adjusted payments go back to unpaid. Recorded in the audit log.", "வெற்றியாளரின் கழிவுகள் மீண்டும் 'கட்டவில்லை' ஆகும். Audit log-ல் பதிவாகும்.")}
        yes={L("Yes, undo", "ஆம், திருத்து")}
        no={L("No", "இல்லை")}
        onNo={() => setDialog(null)}
        onYes={() => {
          setDialog(null);
          act(() => undoPayoutAction(b.month.id), L("Payout undone", "Payout திருத்தப்பட்டது"));
        }}
      />
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-[color-mix(in_oklab,var(--ink)_4%,transparent)] px-2 py-3">
      <div className="truncate text-[11.5px] font-semibold text-ink-3">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function Line({ k, v, strong, muted }: { k: string; v: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className={cx("min-w-0", muted ? "text-ink-3" : "text-ink-2")}>{k}</span>
      <b className={cx("tabular shrink-0", strong && "font-display text-[17px] gold-text-adaptive")}>{v}</b>
    </div>
  );
}

