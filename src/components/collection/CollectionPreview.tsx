"use client";

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "motion/react";
import { BadgeCheck, Check, HandCoins, MessageCircle, RotateCcw, Sparkles, Wand2, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { BowlStage } from "@/components/collection/BowlStage";
import { Badge, Button, ConfirmDialog, CountUp, Sphere, cx, useToast } from "@/components/ui/kit";
import { chitA, hue, organiser, seatsA } from "@/lib/mock";
import { eachPays, inr } from "@/lib/money";
import { haptic, useL, useLang } from "@/lib/prefs";

const DISCOUNT = 145000;
const PRIZE = chitA.total - DISCOUNT; // 3,55,000
const EACH = eachPays(chitA, DISCOUNT); // 17,750
const WINNER = 5; // A06 · Ravi
const SEATS = seatsA.length; // all 20 IDs pay, the organiser's A01 included
const DUE = EACH * SEATS; // 3,55,000 = the prize
const PAYERS = seatsA.map((_, i) => i).filter((i) => i !== WINNER); // 19 pay in cash; the winner's share is adjusted at payout
// A01 (organiser) starts unpaid so the organiser's own tick is visible in the preview.
const INITIAL_PAID = new Set([1, 2, 3, 4, 6, 8, 9, 11, 12, 14, 16, 18]);

type Dialog = { kind: "pay" | "unpay"; seat: number } | { kind: "payout" } | null;

export function CollectionPreview() {
  const L = useL();
  const [lang] = useLang();
  const toast = useToast();
  const [paid, setPaid] = useState<Set<number>>(() => new Set(INITIAL_PAID));
  const [dropKey, setDropKey] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pouring, setPouring] = useState(false);
  const [adjusted, setAdjusted] = useState(false); // winner's own share settled at payout
  const [paidOut, setPaidOut] = useState(false);
  const [wa, setWa] = useState<number | null>(null);

  const name = (i: number) => (lang === "ta" ? seatsA[i].nameTa : seatsA[i].name);
  const cashPaid = PAYERS.filter((i) => paid.has(i)).length;
  const paidCount = cashPaid + (adjusted ? 1 : 0); // out of all 20 IDs
  const collected = paidCount * EACH;
  const progress = collected / DUE;
  const allPaid = cashPaid === PAYERS.length; // payout opens when the other 19 have paid

  const mark = (i: number, value: boolean) => {
    setPaid((s) => {
      const n = new Set(s);
      if (value) n.add(i);
      else n.delete(i);
      return n;
    });
    if (value) {
      setDropKey((k) => k + 1);
      haptic(25);
      toast(
        <span className="inline-flex items-center gap-2">
          <BadgeCheck size={16} className="text-ok" /> {L(`${seatsA[i].id} marked paid · receipt sent`, `${seatsA[i].id} Paid · ரசீது அனுப்பப்பட்டது`)}
        </span>,
        "ok",
      );
    } else {
      toast(L(`Paid tick removed · correction sent to ${seatsA[i].id}`, `Paid நீக்கப்பட்டது · ${seatsA[i].id}-க்கு திருத்தம் அனுப்பப்பட்டது`), "warn");
    }
  };

  const onPoured = useCallback(() => {
    setPouring(false);
    setPaidOut(true);
    haptic([40, 40, 120]);
    confetti({ particleCount: 120, spread: 90, origin: { x: 0.75, y: 0.35 }, colors: ["#ffd34d", "#fff1b0", "#43d68a", "#ffffff"] });
  }, []);

  const fillAll = () => {
    setPaid(new Set(PAYERS));
    setDropKey((k) => k + 1);
  };
  const reset = () => {
    setPaid(new Set(INITIAL_PAID));
    setPaidOut(false);
    setPouring(false);
    setAdjusted(false);
  };

  const message = useMemo(() => {
    if (wa == null) return "";
    const s = seatsA[wa];
    return lang === "ta"
      ? `${organiser.businessTa}\n${s.id} · சீட்டு A · ₹5,00,000 (ஒவ்வொரு மாதம் 10-ஆம் தேதி)\n2-வது மாத ஏலம் முடிந்தது\nஏலம் முடிந்த தள்ளு: ${inr(DISCOUNT)}\nஉங்கள் பங்கு தள்ளு: ${inr(DISCOUNT / chitA.months)}\nகட்ட வேண்டிய தொகை: ${inr(EACH)}\nகடைசி தேதி: 20/12/2026`
      : `${organiser.business}\n${s.id} · Chit A · ₹5,00,000 (10th of every month)\nMonth 2 auction closed\nFinal discount: ${inr(DISCOUNT)}\nYour share of the discount: ${inr(DISCOUNT / chitA.months)}\nAmount to pay: ${inr(EACH)}\nLast date: 20/12/2026`;
  }, [wa, lang]);

  return (
    <div className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[.14em] text-gold-ink">{lang === "ta" ? organiser.businessTa : organiser.business}</div>
          <h1 className="font-display mt-1 text-[26px] font-extrabold leading-tight">
            {L("Collection", "வசூல்")} <span className="text-ink-3">·</span> {L("Chit A, month 2", "சீட்டு A, 2-வது மாதம்")}
          </h1>
          <div className="mt-1 text-[13.5px] text-ink-2">
            {L("Auction closed at", "ஏலம் முடிந்த தள்ளு")} <b className="text-ink">{inr(DISCOUNT)}</b> · {L("each pays", "ஒவ்வொருவரும்")} <b className="text-ink">{inr(EACH)}</b> ·{" "}
            {L("last day", "கடைசி நாள்")} <b className="text-ink">20/12/2026</b>
          </div>
        </div>
        <Badge tone={allPaid ? "ok" : "gold"}>{allPaid ? L("Everyone has paid", "அனைவரும் கட்டிவிட்டனர்") : L("6 days left", "இன்னும் 6 நாள்")}</Badge>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)]">
        {/* ---------- bowl + payout ---------- */}
        <section className="flex flex-col gap-4">
          <div className="card overflow-hidden p-4 text-ink sm:p-6">
            <BowlStage
              progress={progress}
              dropKey={dropKey}
              pouring={pouring}
              paidOut={paidOut}
              winnerLabel={`${seatsA[WINNER].id} · ${name(WINNER)}`}
              winnerHue={hue(WINNER)}
              onPoured={onPoured}
            />
            <div className="mt-2 grid grid-cols-3 gap-2 text-center sm:gap-3">
              <Stat label={paidOut ? L("Paid out", "கொடுத்தது") : L("Collected", "வசூலானது")}>
                <CountUp value={paidOut ? DUE : collected} className={cx("font-display text-[16px] font-extrabold sm:text-[24px]", paidOut ? "text-ok" : "gold-text-adaptive")} />
              </Stat>
              <Stat label={L("Total due · 20 IDs", "மொத்தம் · 20 ID")}>
                <span className="font-display tabular text-[16px] font-extrabold sm:text-[24px]">{inr(DUE)}</span>
              </Stat>
              <Stat label={L("Paid", "கட்டியவர்கள்")}>
                <span className="font-display tabular text-[16px] font-extrabold sm:text-[24px]">
                  {paidCount}
                  <span className="text-ink-3">/{SEATS}</span>
                </span>
              </Stat>
            </div>
          </div>

          <div className={cx("card p-5 transition-all", allPaid && !paidOut && "shadow-[0_0_0_2px_var(--gold-2),var(--shadow-card)]")}>
            <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[.12em] text-gold-ink">
              <HandCoins size={15} /> {L("Payout to the winner", "வெற்றியாளருக்கு payout")}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Sphere index={WINNER} size={40} />
              <div className="min-w-0 flex-1">
                <div className="font-display text-[17px] font-bold">
                  {seatsA[WINNER].id} · {name(WINNER)}
                </div>
                <div className="text-[12.5px] text-ink-3">{L("Won month 2 at", "2-வது மாதம் வென்றது")} {inr(DISCOUNT)}</div>
              </div>
              {paidOut && (
                <Badge tone="ok">
                  <Check size={13} /> {L("Paid out", "கொடுத்தாச்சு")}
                </Badge>
              )}
            </div>
            <div className="mt-4 divide-y divide-line rounded-2xl border border-line text-[14px]">
              <Line k={L("Prize (recorded in the system)", "சீட்டுத் தொகை (system-ல் பதிவு)")} v={inr(PRIZE)} />
              <Line k={L("Their own installment, adjusted", "அவர் கட்ட வேண்டியது, கழிக்கப்படும்")} v={`− ${inr(EACH)}`} muted />
              <Line k={L("Cash to hand over", "கையில் கொடுப்பது")} v={inr(PRIZE - EACH)} strong />
            </div>
            <Button
              variant="gold"
              size="lg"
              className="mt-4 w-full"
              icon={<HandCoins size={18} />}
              disabled={!allPaid || paidOut || pouring}
              onClick={() => setDialog({ kind: "payout" })}
            >
              {paidOut ? L("Payout done", "Payout முடிந்தது") : allPaid ? L(`Pay out ${inr(PRIZE - EACH)}`, `${inr(PRIZE - EACH)} payout கொடு`) : L(`Waiting for ${PAYERS.length - paidCount} more`, `இன்னும் ${PAYERS.length - paidCount} பேர் கட்ட வேண்டும்`)}
            </Button>
            <p className="mt-2 text-center text-[12px] text-ink-3">
              {L(`Payout opens when the other ${PAYERS.length} IDs have paid. ${seatsA[WINNER].id}'s own ${inr(EACH)} is adjusted at payout, making it ${SEATS}/${SEATS}.`, `மற்ற ${PAYERS.length} ID-களும் கட்டியதும் payout. ${seatsA[WINNER].id}-ன் ${inr(EACH)} payout-ல் கழிக்கப்பட்டு ${SEATS}/${SEATS} ஆகும்.`)}
            </p>
          </div>
        </section>

        {/* ---------- payer list ---------- */}
        <section className="card p-2 sm:p-3">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="text-[13px] font-bold text-ink-2">{L("Member IDs", "Member IDs")}</div>
            <div className="text-[12px] text-ink-3">{L("Tap to mark paid", "Paid ஆக்க தொடவும்")}</div>
          </div>
          <ul>
            {seatsA.map((s, i) => {
              const isWinner = i === WINNER;
              const done = isWinner ? adjusted : paid.has(i);
              return (
                <li key={s.id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-[color-mix(in_oklab,var(--ink)_4%,transparent)]">
                  <Sphere index={i} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-[15px] font-bold leading-tight">
                      {s.id}
                      {s.organiser && (
                        <Badge tone="violet" className="ml-1.5 -translate-y-px px-2 py-0 font-sans text-[10.5px]">
                          {L("Organiser · you", "Organiser · நீங்கள்")}
                        </Badge>
                      )}
                    </div>
                    <div className="truncate text-[12.5px] text-ink-2">
                      {name(i)} <span className="text-ink-3">·</span>{" "}
                      <span className="text-ink-3">{isWinner ? L("winner, adjusted from payout", "வெற்றியாளர், payout-ல் கழிவு") : inr(EACH)}</span>
                    </div>
                  </div>
                  {!isWinner && (
                    <button aria-label={L("Send on WhatsApp", "WhatsApp-ல் அனுப்பு")} onClick={() => setWa(i)} className="grid h-9 w-9 place-items-center rounded-xl text-[#25d366] hover:bg-[rgba(37,211,102,.12)]">
                      <MessageCircle size={18} />
                    </button>
                  )}
                  {isWinner ? (
                    <Badge tone={done ? "ok" : "plain"}>{done ? L("Paid (adjusted)", "Paid (கழிவு)") : L("At payout", "Payout-ல்")}</Badge>
                  ) : (
                    <PaidToggle done={done} onClick={() => setDialog({ kind: done ? "unpay" : "pay", seat: i })} labelPaid={L("Paid", "Paid")} labelMark={L("Mark paid", "Paid ஆக்கு")} />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {/* preview-only */}
      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-[22px] border border-dashed border-line-2 p-4">
        <span className="mr-2 inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[.12em] text-ink-3">
          <Sparkles size={13} /> {L("Preview controls", "முன்னோட்ட கட்டுப்பாடு")}
        </span>
        <Button size="sm" icon={<Wand2 size={14} />} onClick={fillAll} disabled={allPaid}>
          {L("Everyone pays now", "அனைவரும் கட்டியதாக")}
        </Button>
        <Button size="sm" icon={<RotateCcw size={14} />} onClick={reset}>
          {L("Reset", "மீட்டமை")}
        </Button>
      </div>

      {/* dialogs */}
      <ConfirmDialog
        open={dialog?.kind === "pay"}
        tone="ok"
        icon={<span className="grid h-14 w-14 place-items-center rounded-full bg-ok-soft text-ok"><Check size={28} /></span>}
        title={dialog && "seat" in dialog ? L(`Mark ${seatsA[dialog.seat].id} as paid?`, `${seatsA[dialog.seat].id}-ஐ Paid ஆக்கலாமா?`) : ""}
        body={dialog && "seat" in dialog ? L(`${inr(EACH)} for month 2. A receipt notification goes to ${seatsA[dialog.seat].id}.`, `2-வது மாதம் ${inr(EACH)}. ${seatsA[dialog.seat].id}-க்கு ரசீது notification போகும்.`) : null}
        yes={L("Yes", "ஆம்")}
        no={L("No", "இல்லை")}
        onNo={() => setDialog(null)}
        onYes={() => {
          if (dialog && "seat" in dialog) mark(dialog.seat, true);
          setDialog(null);
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === "unpay"}
        tone="danger"
        icon={<span className="grid h-14 w-14 place-items-center rounded-full bg-danger-soft text-danger"><X size={28} /></span>}
        title={dialog && "seat" in dialog ? L(`Remove the paid tick for ${seatsA[dialog.seat].id}?`, `${seatsA[dialog.seat].id}-ன் Paid-ஐ நீக்கலாமா?`) : ""}
        body={L("This is recorded in the audit log and a correction notification is sent.", "இது audit log-ல் பதிவாகும்; திருத்தம் notification போகும்.")}
        yes={L("Yes, remove", "ஆம், நீக்கு")}
        no={L("No", "இல்லை")}
        onNo={() => setDialog(null)}
        onYes={() => {
          if (dialog && "seat" in dialog) mark(dialog.seat, false);
          setDialog(null);
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === "payout"}
        icon={<span className="gold-fill grid h-14 w-14 place-items-center rounded-full"><HandCoins size={26} /></span>}
        title={L("Mark the payout as done?", "Payout கொடுத்ததாக பதிவு செய்யலாமா?")}
        body={L(`Cash ${inr(PRIZE - EACH)} to ${seatsA[WINNER].id}. The system records the full prize ${inr(PRIZE)} and marks their own ${inr(EACH)} as paid.`, `${seatsA[WINNER].id}-க்கு கையில் ${inr(PRIZE - EACH)}. System-ல் முழு ${inr(PRIZE)} பதிவாகும்; அவர் கட்ட வேண்டிய ${inr(EACH)} Paid ஆகும்.`)}
        yes={L("Yes", "ஆம்")}
        no={L("No", "இல்லை")}
        onNo={() => setDialog(null)}
        onYes={() => {
          setDialog(null);
          // 1) the winner's own share is settled by adjustment: bowl tops up to 20/20
          setAdjusted(true);
          setDropKey((k) => k + 1);
          toast(L(`${seatsA[WINNER].id}: ${inr(EACH)} marked Paid (adjusted from payout)`, `${seatsA[WINNER].id}: ${inr(EACH)} Paid (payout-ல் கழிவு)`), "ok");
          // 2) then the full bowl pours to the winner
          setTimeout(() => setPouring(true), 1300);
        }}
      />

      {/* WhatsApp message preview */}
      <AnimatePresence>
        {wa != null && (
          <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-[rgba(8,6,14,.55)] backdrop-blur-sm" onClick={() => setWa(null)} />
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 32 }} className="card-solid relative w-full max-w-sm p-5">
              <div className="flex items-center gap-2 text-[13px] font-bold text-[#1faa55]">
                <MessageCircle size={16} /> {L("WhatsApp message", "WhatsApp செய்தி")} · {seatsA[wa].id}
              </div>
              <div className="mt-3 whitespace-pre-line rounded-2xl rounded-tl-sm bg-[#dcf8c6] p-3.5 text-[13.5px] leading-relaxed text-[#14301f] shadow-sm">{message}</div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Button onClick={() => setWa(null)}>{L("Close", "மூடு")}</Button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#25d366] px-4 text-[14.5px] font-bold text-white"
                >
                  <MessageCircle size={17} /> {L("Open WhatsApp", "WhatsApp திற")}
                </a>
              </div>
              <p className="mt-2 text-center text-[11.5px] text-ink-3">{L("WhatsApp opens with the message ready; you tap Send.", "செய்தி தயாராக WhatsApp திறக்கும்; நீங்கள் Send தொட வேண்டும்.")}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PaidToggle({ done, onClick, labelPaid, labelMark }: { done: boolean; onClick: () => void; labelPaid: string; labelMark: string }) {
  return (
    <motion.button
      layout
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      className={cx(
        "inline-flex h-9 min-w-[88px] shrink-0 items-center sm:min-w-[104px] justify-center gap-1.5 rounded-xl px-3 text-[13px] font-bold transition-colors",
        done ? "bg-ok text-white shadow-[0_8px_20px_-10px_var(--ok)]" : "btn-ghost",
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {done ? (
          <motion.span key="p" className="inline-flex items-center gap-1.5" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ type: "spring", stiffness: 600, damping: 20 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.05 }} />
            </svg>
            {labelPaid}
          </motion.span>
        ) : (
          <motion.span key="m" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {labelMark}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
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
