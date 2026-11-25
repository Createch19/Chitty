"use client";

import confetti from "canvas-confetti";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Crown, Dices, Gavel, KeyRound, Lock, Trophy, Users, Wifi, WifiOff, Zap } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { memberBidAction, memberJoinAction } from "@/app/actions/member";
import { LangToggle } from "@/components/brand";
import { Stage, type StageHandle } from "@/components/room/Stage";
import { Badge, Button, Portal, Sphere, cx, useToast } from "@/components/ui/kit";
import { formatINR } from "@/domain/money";
import type { RoomSnapshot } from "@/server/members";
import { haptic, useL, useLang } from "@/lib/prefs";
import { useDateText } from "@/components/organiser/common";

const hue = (i: number) => (i * 47 + 175) % 360;

export function LiveRoom({ token, initial }: { token: string; initial: RoomSnapshot }) {
  const L = useL();
  const dt = useDateText();
  const [lang] = useLang();
  const toast = useToast();
  const stage = useRef<StageHandle>(null);
  const [snap, setSnap] = useState(initial);
  const [price, setPrice] = useState((initial.bids.at(-1)?.amountPaise ?? initial.month.minDiscountPaise) / 100);
  const [online, setOnline] = useState(true);
  const [draft, setDraft] = useState<string | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [pin, setPin] = useState<string | null>(null); // kept in memory only, once the server accepted it
  const [ask, setAsk] = useState<{ value: string; error: string | null } | null>(null);
  const autoAmount = useRef(false); // the PIN dialog froze an untouched amount
  const [pending, start] = useTransition();
  const seen = useRef({ bids: initial.bids.length, joined: new Set(initial.seats.filter((s) => s.joined).map((s) => s.n)), status: initial.month.status });

  const m = snap.month;
  const me = snap.me;
  const top = snap.bids.at(-1) ?? null;
  const iLead = snap.leader === me.index;
  const T = snap.chit.totalPaise;
  const inc = snap.chit.incrementPaise;
  const next = snap.nextMinPaise / 100;

  // live updates over SSE (auto-reconnects; every message is a full snapshot)
  useEffect(() => {
    const es = new EventSource(`/api/m/${token}/rooms/${m.id}/events`);
    es.addEventListener("snapshot", (e) => {
      setOnline(true);
      setSnap(JSON.parse((e as MessageEvent).data));
    });
    es.addEventListener("gone", () => es.close());
    es.onerror = () => setOnline(false);
    return () => es.close();
  }, [token, m.id]);

  // animate what changed since the last snapshot
  useEffect(() => {
    const s = seen.current;
    for (const seat of snap.seats) {
      if (seat.joined && !s.joined.has(seat.n)) {
        s.joined.add(seat.n);
        void stage.current?.bolt(seat.n - 1, true);
      }
    }
    if (snap.bids.length > s.bids) {
      const fresh = snap.bids.slice(s.bids);
      s.bids = snap.bids.length;
      for (const b of fresh) {
        void stage.current?.bolt(b.seat).then(() => setPrice((p) => Math.max(p, b.amountPaise / 100)));
        if (b.seat === me.index) haptic([30, 40, 60]);
        else haptic(18);
      }
      const last = fresh.at(-1)!;
      const prev = snap.bids.at(-1 - fresh.length);
      if (prev && prev.seat === me.index && last.seat !== me.index) toast(L(`${snap.seats[last.seat].label} outbid you — raise to lead again`, `${snap.seats[last.seat].label} உங்களை மிஞ்சினார் — மீண்டும் உயர்த்துங்கள்`), "warn");
    }
    if (snap.month.status === "closed" && s.status !== "closed") {
      s.status = "closed";
      setOverlay(true);
      haptic([60, 50, 120]);
      const colors = ["#ffd34d", "#fff1b0", "#f0a90a", "#6ff0ff", "#ffffff"];
      confetti({ particleCount: 140, spread: 100, startVelocity: 48, origin: { y: 0.35 }, colors });
    }
  }, [snap, me.index, toast, L]);

  const amountStr = draft ?? String(next);
  const amount = Number(amountStr.replace(/\D/g, ""));
  const minR = m.minDiscountPaise / 100;
  const problem: null | "low" | "grid" | "high" = !amountStr ? "low" : amount * 100 >= T ? "high" : amount < next ? "low" : (amount - minR) % (inc / 100) !== 0 ? "grid" : null;
  const canBid = m.status === "open" && m.bidding && me.joined && !me.won && !iLead && me.arrearsPaise === 0;

  const errText = (code: string, minPaise?: number) =>
    ({
      BID_TOO_LOW: L(`Someone was faster — at least ${formatINR(minPaise ?? snap.nextMinPaise)} now`, `வேறொருவர் முந்திவிட்டார் — இப்போது குறைந்தது ${formatINR(minPaise ?? snap.nextMinPaise)}`),
      OFF_GRID: L(`Only in steps of ${formatINR(inc)}`, `${formatINR(inc)} படிகளில் மட்டும்`),
      ALREADY_LEADING: L("You are already leading", "நீங்கள் ஏற்கனவே முன்னிலை"),
      HAS_ARREARS: L("Pay your arrears to bid", "பாக்கி கட்டினால் தான் ஏலம்"),
      AUCTION_NOT_OPEN: L("The auction is closed", "ஏலம் முடிந்தது"),
      PIN_NEEDED: L("Enter your 6-digit PIN to bid", "ஏலம் கேட்க 6 இலக்க PIN போடுங்கள்"),
      PIN_NOT_SET: L("No PIN yet. Ask the organiser for your PIN.", "இன்னும் PIN இல்லை. நடத்துநரிடம் PIN கேளுங்கள்."),
      PIN_WRONG: L("Wrong PIN", "PIN தவறு"),
      PIN_LOCKED: L("Too many wrong PINs. Try again in 15 minutes or call the organiser.", "பல முறை தவறான PIN. 15 நிமிடம் கழித்து முயலவும் அல்லது நடத்துநரை அழைக்கவும்."),
      TOO_FAST: L("Slow down a little", "கொஞ்சம் மெதுவாக"),
      PAUSED: L("Service is paused", "சேவை நிறுத்தப்பட்டுள்ளது"),
      LINK_INVALID: L("This link no longer works", "இந்த link இனி வேலை செய்யாது"),
    })[code] ?? L("Could not place the bid", "ஏலம் பதிவாகவில்லை");

  const submit = () => {
    if (!canBid || problem || pending) return;
    if (pin) send(pin);
    else {
      // hold the amount still while the PIN is typed, even if others bid meanwhile
      autoAmount.current = draft == null;
      setDraft(String(amount));
      setAsk({ value: "", error: null });
    }
  };
  const closeAsk = () => {
    setAsk(null);
    if (autoAmount.current) setDraft(null);
  };
  const send = (p: string) =>
    start(async () => {
      const r = await memberBidAction(token, m.id, amount, p);
      if (!r.ok && ["PIN_NEEDED", "PIN_NOT_SET", "PIN_WRONG", "PIN_LOCKED"].includes(r.error)) {
        setPin(null);
        setAsk({ value: "", error: errText(r.error) });
        return;
      }
      setPin(p);
      setAsk(null);
      if (r.ok) {
        setDraft(null);
        toast(L(`Bid placed: ${formatINR(amount * 100)}`, `ஏலம் பதிவானது: ${formatINR(amount * 100)}`), "gold");
      } else toast(errText(r.error, r.minPaise), "warn");
    });
  const join = () =>
    start(async () => {
      const r = await memberJoinAction(token, m.id);
      if (!r.ok) toast(errText(r.error), "warn");
    });

  const status = (() => {
    if (m.status === "closed") return { tone: "plain", text: L("Auction closed", "ஏலம் முடிந்தது") };
    if (!m.bidding) return { tone: "plain", text: L("No auction this month", "இந்த மாதம் ஏலம் இல்லை") };
    if (me.won) return { tone: "plain", text: L("This ID has already won a month — you can watch", "இந்த ID ஏற்கனவே வென்றுவிட்டது — பார்க்கலாம்") };
    if (!me.joined) return { tone: "plain", text: L("Join the room to start bidding", "ஏலம் கேட்க முதலில் அறையில் சேருங்கள்") };
    if (me.arrearsPaise > 0) return { tone: "warn", text: L(`Pay your arrears of ${formatINR(me.arrearsPaise)} to bid`, `${formatINR(me.arrearsPaise)} பாக்கி கட்டினால் தான் ஏலம்`) };
    if (iLead) return { tone: "gold", text: L("You are leading 🏆", "நீங்கள் தான் முன்னிலை 🏆") };
    if (snap.leader != null) return { tone: "warn", text: L(`${snap.seats[snap.leader].label} is leading — raise to take the lead`, `${snap.seats[snap.leader].label} முன்னிலை — உயர்த்தி முன்னேறுங்கள்`) };
    return { tone: "plain", text: L("Be the first to bid", "முதல் ஏலம் உங்களுடையதாக இருக்கட்டும்") };
  })();

  const eligible = snap.seats.filter((s) => !s.won).length;
  const joinedN = snap.seats.filter((s) => s.joined && !s.won).length;
  const shown = top ? top.amountPaise : m.minDiscountPaise;

  return (
    <div className="theme-stage relative min-h-screen overflow-hidden bg-bg text-ink">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(124,92,255,.22),transparent_70%),radial-gradient(50%_40%_at_50%_100%,rgba(255,196,64,.10),transparent_70%)]" />
      <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-5 px-3 pb-24 pt-4 sm:px-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)] lg:gap-8">
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <Link href={`/m/${token}`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink">
              <ArrowLeft size={15} /> {L("My chit", "என் சீட்டு")}
            </Link>
            <div className="flex items-center gap-2">
              <span className={cx("inline-flex items-center gap-1 text-[12px] font-semibold", online ? "text-ok" : "text-warn")}>
                {online ? <Wifi size={14} /> : <WifiOff size={14} />} {online ? L("Live", "நேரலை") : L("Reconnecting…", "மீண்டும் இணைகிறது…")}
              </span>
              <LangToggle />
            </div>
          </div>
          <header className="mb-3 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold uppercase tracking-[.14em] text-gold-2/90">{lang === "ta" && snap.businessTa ? snap.businessTa : snap.business}</div>
              <h1 className="font-display mt-0.5 text-[22px] font-extrabold leading-tight sm:text-[26px]">
                {L("Live auction", "நேரடி ஏலம்")} <span className="text-ink-3">·</span> <span className="gold-text">{L(`Chit ${snap.chit.code}`, `சீட்டு ${snap.chit.code}`)}</span>
              </h1>
              <div className="mt-1 text-[13px] text-ink-2">
                {formatINR(T)} · {L(`Month ${m.month} of ${snap.chit.months}`, `${snap.chit.months}-ல் ${m.month}-வது மாதம்`)}
              </div>
            </div>
            <Badge tone="live" className="mt-1">
              <span className="live-dot" /> {m.status === "closed" ? L("Closed", "முடிந்தது") : "LIVE"}
            </Badge>
          </header>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge>
              <Users size={13} /> {L("Joined", "இணைந்தவர்கள்")} <b className="text-gold-2">{joinedN}/{eligible}</b>
            </Badge>
            <Badge>
              {L("You", "நீங்கள்")}: <b className="text-gold-2">{snap.seats[me.index].label}</b>
            </Badge>
            <Badge>
              {L("Minimum", "குறைந்தபட்சம்")} <b className="text-ink">{formatINR(m.minDiscountPaise)}</b>
            </Badge>
          </div>
          <div className="overflow-hidden rounded-[28px] shadow-[0_30px_80px_-30px_rgba(0,0,0,.9),0_0_0_1px_rgba(255,255,255,.07)]">
            <Stage
              ref={stage}
              seats={snap.seats.map((s, i) => ({ label: s.label.split(" · ")[0], hue: hue(i), state: s.won ? "won" : s.joined ? "on" : "off" }))}
              me={me.index}
              leader={m.status === "closed" ? m.winner : snap.leader}
              pick={null}
              price={m.status === "closed" ? (m.discountPaise ?? 0) / 100 : price}
              topLabel={top ? L("CURRENT BID", "தற்போதைய ஏலம்") : L("MINIMUM DISCOUNT", "குறைந்தபட்ச தள்ளு")}
              prizeLabel={`→ ${formatINR(T - (m.status === "closed" ? (m.discountPaise ?? 0) : shown))}`}
              ariaLabel={L("Live auction room", "நேரடி ஏல அறை")}
            />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="card p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <Sphere index={me.index} size={42} grey={!me.joined} />
              <div className="font-display text-[17px] font-bold">{snap.seats[me.index].label}</div>
            </div>
            <motion.div key={status.text} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cx("mt-4 rounded-2xl px-3.5 py-2.5 text-[14px] font-semibold", status.tone === "gold" && "bg-[rgba(255,211,77,.14)] text-gold-2", status.tone === "warn" && "bg-warn-soft text-warn", status.tone === "plain" && "bg-[rgba(255,255,255,.06)] text-ink-2")}>
              {status.text}
            </motion.div>

            {m.status === "open" && m.bidding && !me.won && !me.joined ? (
              <Button variant="gold" size="lg" className="mt-4 w-full" icon={<Zap size={18} />} disabled={pending} onClick={join}>
                {L("Join the room", "அறையில் சேர்")}
              </Button>
            ) : m.status === "open" && m.bidding && !me.won ? (
              <div className={cx("mt-4 transition-opacity", !canBid && "pointer-events-none opacity-45")}>
                <div className="mb-2 text-[12.5px] font-semibold text-ink-3">{L("Raise the current bid by", "தற்போதைய ஏலத்தை உயர்த்து")}</div>
                <div className="grid grid-cols-4 gap-2">
                  {[inc / 100, 1000, 5000, 10000].map((x, i, a) => (a.indexOf(x) !== i ? null : (
                    <Button key={x} size="sm" className="h-10 rounded-xl text-[13px]" onClick={() => setDraft(String((top ? top.amountPaise : m.minDiscountPaise) / 100 + x))}>
                      +{x >= 1000 ? `${x / 1000}K` : x}
                    </Button>
                  )))}
                </div>
                <div className="mt-3 flex gap-2">
                  <div className={cx("flex h-14 min-w-0 flex-1 items-center gap-1 rounded-2xl border bg-[rgba(0,0,0,.28)] px-4", problem && draft != null ? "border-danger shadow-[0_0_0_3px_var(--danger-soft)]" : "border-line-2 focus-within:border-gold-3")}>
                    <span className="font-display text-[20px] font-bold text-ink-3">₹</span>
                    <input
                      inputMode="numeric"
                      aria-label={L("Your bid amount", "உங்கள் ஏலத் தொகை")}
                      value={amount ? amount.toLocaleString("en-IN") : amountStr}
                      onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
                      onKeyDown={(e) => e.key === "Enter" && submit()}
                      className="font-display tabular min-w-0 flex-1 bg-transparent text-[22px] font-bold text-ink outline-none"
                    />
                  </div>
                  <Button variant="gold" size="lg" className="h-14 px-5" icon={<Gavel size={18} />} disabled={!canBid || !!problem || pending} onClick={submit}>
                    {L("Bid", "ஏலம்")}
                  </Button>
                </div>
                <AnimatePresence initial={false}>
                  {problem && draft != null && canBid && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-danger-soft px-3 py-2 text-[13px] font-semibold text-danger">
                        <span>
                          {problem === "low" && L(`At least ${formatINR(next * 100)}`, `குறைந்தது ${formatINR(next * 100)} வேண்டும்`)}
                          {problem === "grid" && L(`Only in steps of ${formatINR(inc)}`, `${formatINR(inc)} படிகளில் மட்டும்`)}
                          {problem === "high" && L(`Must be below ${formatINR(T)}`, `${formatINR(T)}-க்கு குறைவாக இருக்க வேண்டும்`)}
                        </span>
                        <button className="rounded-lg bg-danger px-2.5 py-1 text-[12px] font-bold text-white" onClick={() => setDraft(null)}>
                          {L(`Use ${formatINR(next * 100)}`, `${formatINR(next * 100)} போடு`)}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                {!problem && (
                  <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
                    {L("If you win at", "இந்தத் தொகையில் வென்றால்")} <b className="text-ink">{formatINR(amount * 100)}</b>: {L("you get", "உங்களுக்கு")} <b className="text-gold-2">{formatINR(T - amount * 100)}</b>
                    {L(", everyone pays ", "; ஒவ்வொருவரும் ")}
                    <b className="text-ink">{formatINR(Math.round((T - amount * 100) / snap.chit.months / 100) * 100)}</b>
                    {L(" this month.", " கட்டுவார்கள்.")}
                  </p>
                )}
                {me.arrearsPaise > 0 && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--warn)_40%,transparent)] px-3 py-2 text-[12.5px] text-warn">
                    <Lock size={14} /> {L("Bidding opens as soon as the organiser marks your arrears paid.", "உங்கள் பாக்கி Paid ஆனதும் ஏலம் திறக்கும்.")}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="card p-4 sm:p-5">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[13px] font-bold text-ink-2">{L("Bids", "ஏலங்கள்")}</div>
              <div className="text-[12px] text-ink-3">{snap.bids.length}</div>
            </div>
            {snap.bids.length === 0 ? (
              <div className="py-6 text-center text-[13px] text-ink-3">{L("No bids yet.", "இன்னும் ஏலம் இல்லை.")}</div>
            ) : (
              <ul>
                <AnimatePresence initial={false}>
                  {[...snap.bids].reverse().slice(0, 8).map((b, i) => (
                    <motion.li key={b.id} layout initial={{ opacity: 0, x: -16, backgroundColor: "rgba(255,211,77,.22)" }} animate={{ opacity: 1, x: 0, backgroundColor: "rgba(255,211,77,0)" }} transition={{ duration: 0.45 }} className="flex items-center gap-3 rounded-xl border-b border-line px-1 py-2 last:border-0">
                      <Sphere index={b.seat} size={26} />
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                        {snap.seats[b.seat].label}
                        {b.seat === me.index && <span className="text-ink-3"> {L("(you)", "(நீங்கள்)")}</span>}
                        {i === 0 && <Crown size={13} className="ml-1.5 inline -translate-y-px text-gold-2" />}
                      </span>
                      <b className="font-display tabular text-[15px] text-gold-2">{formatINR(b.amountPaise)}</b>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </section>
      </div>

      <Portal><AnimatePresence>
        {ask && (
          <motion.div className="theme-stage fixed inset-0 z-50 flex items-start justify-center p-3 pt-[12vh] sm:items-center sm:pt-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-[rgba(5,4,10,.75)] backdrop-blur-sm" onClick={closeAsk} />
            <motion.form
              role="dialog"
              aria-modal="true"
              aria-label={L("Enter your PIN", "PIN போடுங்கள்")}
              className="card-solid relative w-full max-w-sm p-6 text-ink"
              initial={{ y: 30, scale: 0.96, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (canBid && !problem && !pending && ask.value.length === 6) send(ask.value);
              }}
            >
              <div className="gold-fill mx-auto grid h-14 w-14 place-items-center rounded-full"><KeyRound size={26} /></div>
              <h3 className="font-display mt-3 text-center text-[19px] font-bold">{L(`PIN to bid ${formatINR(amount * 100)}`, `${formatINR(amount * 100)} ஏலம் கேட்க PIN`)}</h3>
              <p className="mt-1 text-center text-[13px] text-ink-2">{L("The 6-digit PIN your organiser sent you.", "நடத்துநர் உங்களுக்கு அனுப்பிய 6 இலக்க PIN.")}</p>
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                aria-label="PIN"
                value={ask.value}
                onChange={(e) => setAsk({ value: e.target.value.replace(/\D/g, "").slice(0, 6), error: null })}
                className={cx("font-display mt-4 h-14 w-full rounded-2xl border bg-[rgba(0,0,0,.28)] text-center text-[28px] font-bold tracking-[.35em] outline-none", ask.error ? "border-danger" : "border-line-2 focus:border-gold-3")}
              />
              {(ask.error || problem || !canBid) && (
                <div role="alert" className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-center text-[13px] font-semibold text-danger">
                  {ask.error ?? (canBid ? L("The price has moved. Close this and choose a new amount.", "ஏலத்தொகை மாறிவிட்டது. மூடிவிட்டு புதிய தொகை போடுங்கள்.") : status.text)}
                </div>
              )}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Button type="button" variant="ghost" size="lg" onClick={closeAsk}>{L("Cancel", "வேண்டாம்")}</Button>
                <Button type="submit" variant="gold" size="lg" disabled={pending || ask.value.length !== 6 || !!problem || !canBid}>{L("Bid", "ஏலம்")}</Button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence></Portal>

      <Portal><AnimatePresence>
        {overlay && m.status === "closed" && m.winner != null && (
          <motion.div className="fixed inset-0 z-50 grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-[rgba(5,4,10,.82)] backdrop-blur-md" onClick={() => setOverlay(false)} />
            <motion.div initial={{ scale: 0.8, y: 30, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 22 }} className="relative w-full max-w-sm overflow-hidden rounded-[30px] border border-[rgba(255,211,77,.35)] bg-[linear-gradient(180deg,#221a3d,#0e0b1a)] p-6 text-center shadow-[0_0_80px_rgba(255,211,77,.25)]">
              <div className="gold-fill mx-auto grid h-20 w-20 place-items-center rounded-full">{m.lottery ? <Dices size={38} /> : <Trophy size={38} />}</div>
              <div className="mt-4 text-[12px] font-semibold uppercase tracking-[.16em] text-gold-2">{m.lottery ? L("Lottery winner", "குலுக்கல் வெற்றியாளர்") : L("Winner", "வெற்றியாளர்")}</div>
              <div className="font-display mt-1 text-[24px] font-extrabold">{m.winner === me.index ? L("You won! 🎉", "நீங்கள் வென்றீர்கள்! 🎉") : snap.seats[m.winner].label}</div>
              <div className="font-display gold-text tabular mt-2 text-[40px] font-extrabold leading-none">{formatINR(T - (m.discountPaise ?? 0))}</div>
              <div className="mt-5 divide-y divide-line rounded-2xl bg-[rgba(255,255,255,.05)] px-4 text-[14px]">
                <Row k={L("Discount", "தள்ளு")} v={formatINR(m.discountPaise ?? 0)} />
                <Row k={L("Everyone pays this month", "ஒவ்வொருவரும் இந்த மாதம்")} v={formatINR(m.payPaise ?? 0)} />
                <Row k={L("Last day to pay", "கட்ட கடைசி நாள்")} v={dt(m.lastPayDate)} />
              </div>
              <Button variant="gold" className="mt-5 w-full" onClick={() => setOverlay(false)}>
                {L("OK", "சரி")}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence></Portal>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-ink-2">{k}</span>
      <b className="tabular">{v}</b>
    </div>
  );
}
