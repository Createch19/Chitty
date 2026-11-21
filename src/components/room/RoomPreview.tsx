"use client";

import confetti from "canvas-confetti";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Crown, Dices, Gavel, Lock, Pause, Play, RotateCcw, Sparkles, Trophy, Users, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, type StageHandle, type StageSeat } from "@/components/room/Stage";
import { Badge, Button, Portal, ConfirmDialog, Segmented, Sphere, cx, useToast } from "@/components/ui/kit";
import { chitA, hue, organiser, seatsA } from "@/lib/mock";
import { eachPays, inr, minimumDiscount, nextValidBid, onGrid } from "@/lib/money";
import { haptic, useL, useLang } from "@/lib/prefs";

type Bid = { id: number; seat: number; amount: number; at: number };
type Result = { seat: number; amount: number; lottery: boolean };

const MIN = minimumDiscount(chitA, chitA.month);
const INC = chitA.increment;
const TOTAL = chitA.total;
const ME_DEFAULT = 6; // A07 Meena

const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

export function RoomPreview() {
  const L = useL();
  const [lang] = useLang();
  const toast = useToast();
  const stage = useRef<StageHandle>(null);

  const [joined, setJoined] = useState<Set<number>>(() => new Set());
  const [bids, setBids] = useState<Bid[]>([]);
  const [shownPrice, setShownPrice] = useState(MIN);
  const [me, setMe] = useState(ME_DEFAULT);
  const [view, setView] = useState<"member" | "organiser">("member");
  const [arrears, setArrears] = useState(false);
  const [display, setDisplay] = useState<"id" | "name">("id");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const [dialog, setDialog] = useState<null | "close" | "lottery">(null);
  const [now, setNow] = useState(0);

  // Bid box: shows the next valid amount live; once the member edits it, their draft is kept.
  const [draft, setDraft] = useState<string | null>(null);

  const bidsRef = useRef<Bid[]>([]);
  const closedRef = useRef(false);

  const highest = bids.length ? bids[bids.length - 1] : null;
  const leader = highest ? highest.seat : null;
  const next = nextValidBid(MIN, INC, highest ? highest.amount : null);
  const closed = result != null;
  const amountStr = draft ?? String(next);
  const dirty = draft != null;
  useEffect(() => {
    closedRef.current = closed;
  }, [closed]);
  const meJoined = joined.has(me);
  const eligible = useMemo(() => seatsA.map((_, i) => i).filter((i) => !seatsA[i].organiser), []);

  const label = useCallback(
    (i: number) => {
      const s = seatsA[i];
      if (display === "id" && view === "member") return s.id;
      return `${s.id} · ${lang === "ta" ? s.nameTa : s.name}`;
    },
    [display, view, lang],
  );

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  // ---- core actions -------------------------------------------------------
  const join = useCallback((i: number) => {
    setJoined((s) => {
      if (s.has(i)) return s;
      const n = new Set(s);
      n.add(i);
      return n;
    });
    void stage.current?.bolt(i, true);
  }, []);

  // The same rules the server will enforce: >= next valid, on the grid, below total, leader can't re-bid.
  const place = useCallback((seat: number, amount: number) => {
    const b = bidsRef.current;
    const top = b.length ? b[b.length - 1] : null;
    const need = nextValidBid(MIN, INC, top ? top.amount : null);
    if (closedRef.current || amount < need || amount >= TOTAL || !onGrid(amount, MIN, INC) || (top && top.seat === seat)) return false;
    const nb = [...b, { id: b.length + 1, seat, amount, at: Date.now() }];
    bidsRef.current = nb;
    setBids(nb);
    void stage.current?.bolt(seat).then(() => setShownPrice((p) => Math.max(p, amount)));
    return true;
  }, []);

  // React to new bids: haptics + outbid notice for "me".
  const lastSeen = useRef(0);
  useEffect(() => {
    if (!bids.length || bids.length === lastSeen.current) return;
    const prev = bids.length > 1 ? bids[bids.length - 2] : null;
    const cur = bids[bids.length - 1];
    lastSeen.current = bids.length;
    if (cur.seat === me) {
      haptic([30, 40, 60]);
    } else {
      haptic(18);
      if (prev && prev.seat === me && view === "member") toast(L(`${seatsA[cur.seat].id} outbid you — raise to lead again`, `${seatsA[cur.seat].id} உங்களை மிஞ்சினார் — மீண்டும் உயர்த்துங்கள்`), "warn");
    }
  }, [bids, me, view, toast, L]);

  // ---- bots ---------------------------------------------------------------
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
  const stopBots = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const stateRef = useRef({ joined, me, arrears, bids });
  useEffect(() => {
    stateRef.current = { joined, me, arrears, bids };
  }, [joined, me, arrears, bids]);

  const startBots = () => {
    setRunning(true);
    const pool = eligible.filter((i) => i !== me && !joined.has(i)).sort(() => Math.random() - 0.5).slice(0, Math.max(0, 13 - joined.size));
    pool.forEach((i, n) => later(() => join(i), 320 * (n + 1)));
    const loop = () => {
      const { joined: j, me: m, bids: b } = stateRef.current;
      if (closedRef.current) return;
      const top = b.length ? b[b.length - 1] : null;
      const cands = [...j].filter((i) => i !== m && (!top || top.seat !== i));
      if (cands.length && (!top || top.amount < 215000)) {
        const seat = cands[rnd(0, cands.length - 1)];
        place(seat, nextValidBid(MIN, INC, top ? top.amount : null) + INC * rnd(0, 6));
      }
      later(loop, rnd(1500, 3200));
    };
    later(loop, 320 * (pool.length + 1) + 500);
  };
  const pauseBots = () => {
    setRunning(false);
    stopBots();
  };
  useEffect(() => () => stopBots(), []);

  // ---- my bid -------------------------------------------------------------
  const amount = Number(amountStr.replace(/[^\d]/g, ""));
  const problem: null | "low" | "grid" | "high" =
    !amountStr ? "low" : amount >= TOTAL ? "high" : amount < next ? "low" : !onGrid(amount, MIN, INC) ? "grid" : null;
  const iLead = leader === me;
  const canBid = view === "member" && meJoined && !closed && !iLead && !arrears;

  const submit = () => {
    if (!canBid || problem) return;
    if (place(me, amount)) {
      setDraft(null);
      toast(L(`Bid placed: ${inr(amount)}`, `ஏலம் பதிவானது: ${inr(amount)}`), "gold");
    }
  };

  // ---- organiser: close / lottery ----------------------------------------
  const finish = (r: Result) => {
    pauseBots();
    closedRef.current = true;
    setResult(r);
    setTimeout(() => {
      setOverlay(true);
      haptic([60, 50, 120]);
      const colors = ["#ffd34d", "#fff1b0", "#f0a90a", "#6ff0ff", "#ffffff"];
      confetti({ particleCount: 140, spread: 100, startVelocity: 48, origin: { y: 0.35 }, colors, scalar: 1.05 });
      setTimeout(() => confetti({ particleCount: 90, angle: 60, spread: 70, origin: { x: 0, y: 0.6 }, colors }), 250);
      setTimeout(() => confetti({ particleCount: 90, angle: 120, spread: 70, origin: { x: 1, y: 0.6 }, colors }), 400);
    }, 350);
  };

  const runLottery = () => {
    pauseBots();
    const pool = eligible; // every ID that has not won yet (absent and arrears too)
    const winner = pool[rnd(0, pool.length - 1)];
    const steps = 30;
    let t = 0;
    let idx = rnd(0, pool.length - 1);
    for (let s = 0; s < steps; s++) {
      t += 55 + Math.pow(s / steps, 3) * 420;
      const last = s === steps - 1;
      idx = last ? pool.indexOf(winner) : (idx + 1 + rnd(0, 2)) % pool.length;
      const seat = pool[idx];
      later(() => {
        setPick(seat);
        haptic(last ? [40, 30, 90] : 6);
      }, t);
    }
    later(() => finish({ seat: winner, amount: MIN, lottery: true }), t + 900);
  };

  const reset = () => {
    stopBots();
    setRunning(false);
    setJoined(new Set());
    bidsRef.current = [];
    closedRef.current = false;
    setBids([]);
    setShownPrice(MIN);
    setResult(null);
    setOverlay(false);
    setPick(null);
    setDraft(null);
    lastSeen.current = 0;
  };

  // ---- stage model --------------------------------------------------------
  const stageSeats: StageSeat[] = seatsA.map((s, i) => ({
    label: s.id,
    hue: hue(i),
    state: s.organiser ? "won" : joined.has(i) ? "on" : "off",
  }));

  const joinedCount = eligible.filter((i) => joined.has(i)).length;
  const price = shownPrice;
  const status = (() => {
    if (closed) return { tone: "plain" as const, text: L("Auction closed", "ஏலம் முடிந்தது") };
    if (view === "organiser") return { tone: "plain" as const, text: L("You are watching as the organiser", "நீங்கள் organiser-ஆக பார்க்கிறீர்கள்") };
    if (!meJoined) return { tone: "plain" as const, text: L("Join the room to start bidding", "ஏலம் கேட்க முதலில் அறையில் சேருங்கள்") };
    if (arrears) return { tone: "warn" as const, text: L("Pay your arrears of ₹17,875 to bid", "₹17,875 பாக்கி கட்டினால் தான் ஏலம் கேட்க முடியும்") };
    if (iLead) return { tone: "gold" as const, text: L("You are leading 🏆", "நீங்கள் தான் முன்னிலை 🏆") };
    if (leader != null) return { tone: "warn" as const, text: L(`${seatsA[leader].id} is leading — raise to take the lead`, `${seatsA[leader].id} முன்னிலை — உயர்த்தி முன்னேறுங்கள்`) };
    return { tone: "plain" as const, text: L("Be the first to bid", "முதல் ஏலம் உங்களுடையதாக இருக்கட்டும்") };
  })();

  const ago = (t: number) => {
    const s = Math.max(0, Math.round((now - t) / 1000));
    return s < 5 ? L("now", "இப்போது") : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
  };

  return (
    <div className="theme-stage relative min-h-screen overflow-hidden bg-bg text-ink">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(124,92,255,.22),transparent_70%),radial-gradient(50%_40%_at_50%_100%,rgba(255,196,64,.10),transparent_70%)]" />

      <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-5 px-3 pb-24 pt-4 sm:px-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)] lg:gap-8 lg:pt-8">
        {/* ---------- left: header + stage ---------- */}
        <section>
          <header className="mb-3 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold uppercase tracking-[.14em] text-gold-2/90">{lang === "ta" ? organiser.businessTa : organiser.business}</div>
              <h1 className="font-display mt-0.5 text-[22px] font-extrabold leading-tight sm:text-[26px]">
                {L("Live auction", "நேரடி ஏலம்")} <span className="text-ink-3">·</span> <span className="gold-text">{L("Chit A", "சீட்டு A")}</span>
              </h1>
              <div className="mt-1 text-[13px] text-ink-2">
                {inr(TOTAL)} · {L(`Month ${chitA.month} of ${chitA.months}`, `${chitA.months}-ல் ${chitA.month}-வது மாதம்`)}
              </div>
            </div>
            <Badge tone="live" className="mt-1">
              <span className="live-dot" /> {closed ? L("Closed", "முடிந்தது") : "LIVE"}
            </Badge>
          </header>

          <div className="mb-3 flex flex-wrap gap-2">
            <Badge>
              <Users size={13} /> {L("Joined", "இணைந்தவர்கள்")} <b className="text-gold-2">{joinedCount}/{eligible.length}</b>
            </Badge>
            {view === "member" && (
              <Badge>
                {L("You", "நீங்கள்")}: <b className="text-gold-2">{seatsA[me].id}</b>
              </Badge>
            )}
            <Badge>
              {L("Minimum", "குறைந்தபட்சம்")} <b className="text-ink">{inr(MIN)}</b>
            </Badge>
            <Badge>
              {L("Steps", "படி")} <b className="text-ink">{inr(INC)}</b>
            </Badge>
          </div>

          <div className="overflow-hidden rounded-[28px] shadow-[0_30px_80px_-30px_rgba(0,0,0,.9),0_0_0_1px_rgba(255,255,255,.07)]">
            <Stage
              ref={stage}
              seats={stageSeats}
              me={view === "member" ? me : null}
              leader={leader}
              pick={pick}
              price={price}
              topLabel={highest ? L("CURRENT BID", "தற்போதைய ஏலம்") : L("MINIMUM DISCOUNT", "குறைந்தபட்ச தள்ளு")}
              prizeLabel={`→ ${inr(TOTAL - price)}`}
              ariaLabel={L("Live auction room", "நேரடி ஏல அறை")}
              onSeatClick={(i) => {
                if (view !== "member" || seatsA[i].organiser || closed) return;
                setMe(i);
                setDraft(null);
              }}
            />
          </div>
          {view === "member" && !closed && (
            <p className="mt-2 text-center text-[12px] text-ink-3">{L("Preview: tap any icon to try the room as that member", "முன்னோட்டம்: எந்த உறுப்பினராகவும் முயற்சிக்க அவர் படத்தைத் தொடவும்")}</p>
          )}
        </section>

        {/* ---------- right: panels ---------- */}
        <section className="flex flex-col gap-4">
          {view === "member" ? (
            <div className="card p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <Sphere index={me} size={42} grey={!meJoined} />
                <div className="min-w-0">
                  <div className="font-display text-[17px] font-bold">
                    {seatsA[me].id} <span className="text-ink-3">·</span> {lang === "ta" ? seatsA[me].nameTa : seatsA[me].name}
                  </div>
                  <div className="text-[12.5px] text-ink-3">{L("Your seat in Chit A", "சீட்டு A-ல் உங்கள் இடம்")}</div>
                </div>
              </div>

              <motion.div
                key={status.text}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cx(
                  "mt-4 rounded-2xl px-3.5 py-2.5 text-[14px] font-semibold",
                  status.tone === "gold" && "bg-[rgba(255,211,77,.14)] text-gold-2",
                  status.tone === "warn" && "bg-warn-soft text-warn",
                  status.tone === "plain" && "bg-[rgba(255,255,255,.06)] text-ink-2",
                )}
              >
                {status.text}
              </motion.div>

              {!meJoined && !closed ? (
                <Button variant="gold" size="lg" className="mt-4 w-full" icon={<Zap size={18} />} onClick={() => join(me)}>
                  {L("Join the room", "அறையில் சேர்")}
                </Button>
              ) : (
                <div className={cx("mt-4 transition-opacity", !canBid && "pointer-events-none opacity-45")}>
                  <div className="mb-2 text-[12.5px] font-semibold text-ink-3">{L("Raise the current bid by", "தற்போதைய ஏலத்தை உயர்த்து")}</div>
                  <div className="grid grid-cols-4 gap-2">
                    {[INC, 1000, 5000, 10000].map((x) => (
                      <Button
                        key={x}
                        size="sm"
                        className="h-10 rounded-xl text-[13px]"
                        onClick={() => {
                          setDraft(String((highest ? highest.amount : MIN) + x));
                        }}
                      >
                        +{x >= 1000 ? `${x / 1000}K` : x}
                      </Button>
                    ))}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <div
                      className={cx(
                        "flex h-14 min-w-0 flex-1 items-center gap-1 rounded-2xl border bg-[rgba(0,0,0,.28)] px-4 transition-colors",
                        problem && dirty ? "border-danger shadow-[0_0_0_3px_var(--danger-soft)]" : "border-line-2 focus-within:border-gold-3",
                      )}
                    >
                      <span className="font-display text-[20px] font-bold text-ink-3">₹</span>
                      <input
                        inputMode="numeric"
                        aria-label={L("Your bid amount", "உங்கள் ஏலத் தொகை")}
                        value={Number(amountStr) ? Number(amountStr).toLocaleString("en-IN") : amountStr}
                        onChange={(e) => {
                          setDraft(e.target.value.replace(/[^\d]/g, ""));
                        }}
                        onKeyDown={(e) => e.key === "Enter" && submit()}
                        className="font-display tabular min-w-0 flex-1 bg-transparent text-[22px] font-bold text-ink outline-none"
                      />
                    </div>
                    <Button variant="gold" size="lg" className="h-14 px-5" icon={<Gavel size={18} />} disabled={!canBid || !!problem} onClick={submit}>
                      {L("Bid", "ஏலம்")}
                    </Button>
                  </div>

                  <AnimatePresence initial={false}>
                    {problem && dirty && canBid && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-danger-soft px-3 py-2 text-[13px] font-semibold text-danger">
                          <span>
                            {problem === "low" && L(`At least ${inr(next)}`, `குறைந்தது ${inr(next)} வேண்டும்`)}
                            {problem === "grid" && L(`Only in steps of ${inr(INC)}`, `${inr(INC)} படிகளில் மட்டும்`)}
                            {problem === "high" && L(`Must be below ${inr(TOTAL)}`, `${inr(TOTAL)}-க்கு குறைவாக இருக்க வேண்டும்`)}
                          </span>
                          <button className="rounded-lg bg-danger px-2.5 py-1 text-[12px] font-bold text-white" onClick={() => setDraft(null)}>
                            {L(`Use ${inr(next)}`, `${inr(next)} போடு`)}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {!problem && (
                    <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
                      {L("If you win at", "இந்தத் தொகையில் வென்றால்")} <b className="text-ink">{inr(amount)}</b>:{" "}
                      {L("you get", "உங்களுக்கு")} <b className="text-gold-2">{inr(TOTAL - amount)}</b>
                      {L(", everyone pays ", "; ஒவ்வொருவரும் மாதம் ")}
                      <b className="text-ink">{inr(eachPays(chitA, amount))}</b>
                      {L(" this month.", " கட்டுவார்கள்.")}
                    </p>
                  )}
                </div>
              )}
              {arrears && meJoined && !closed && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--warn)_40%,transparent)] px-3 py-2 text-[12.5px] text-warn">
                  <Lock size={14} /> {L("Bidding is locked until the organiser marks your arrears as paid.", "உங்கள் பாக்கியை organiser Paid ஆக்கியதும் ஏலம் திறக்கும்.")}
                </div>
              )}
            </div>
          ) : (
            <div className="card p-4 sm:p-5">
              <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[.12em] text-gold-2">
                <Crown size={14} /> {L("Organiser controls", "Organiser கட்டுப்பாடு")}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-[rgba(255,255,255,.05)] p-3">
                  <div className="text-[12px] text-ink-3">{L("Highest bid", "அதிக ஏலம்")}</div>
                  <div className="font-display tabular mt-0.5 text-[20px] font-bold text-gold-2">{highest ? inr(highest.amount) : "—"}</div>
                  <div className="text-[12px] text-ink-2">{highest ? label(highest.seat) : L("No bids yet", "இன்னும் ஏலம் இல்லை")}</div>
                </div>
                <div className="rounded-2xl bg-[rgba(255,255,255,.05)] p-3">
                  <div className="text-[12px] text-ink-3">{L("Winner would get", "வெற்றியாளருக்கு")}</div>
                  <div className="font-display tabular mt-0.5 text-[20px] font-bold">{inr(TOTAL - (highest ? highest.amount : MIN))}</div>
                  <div className="text-[12px] text-ink-2">
                    {L("Each pays", "ஒவ்வொருவரும்")} {inr(eachPays(chitA, highest ? highest.amount : MIN))}
                  </div>
                </div>
              </div>
              {highest || closed ? (
                <Button variant="gold" size="lg" className="mt-4 w-full" icon={<Gavel size={18} />} disabled={closed} onClick={() => setDialog("close")}>
                  {L("Close the auction", "ஏலத்தை முடி")}
                </Button>
              ) : (
                <Button variant="gold" size="lg" className="mt-4 w-full" icon={<Dices size={18} />} disabled={closed || pick != null} onClick={() => setDialog("lottery")}>
                  {L("No bids — run the lottery", "ஏலம் இல்லை — குலுக்கல்")}
                </Button>
              )}
              <p className="mt-2 text-center text-[12px] text-ink-3">{L("Closing is final. There is no reopen.", "முடித்தால் நிரந்தரம். திரும்பத் திறக்க முடியாது.")}</p>
            </div>
          )}

          {/* bid log */}
          <div className="card p-4 sm:p-5">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[13px] font-bold text-ink-2">{L("Bids", "ஏலங்கள்")}</div>
              <div className="text-[12px] text-ink-3">{bids.length}</div>
            </div>
            {!bids.length ? (
              <div className="py-6 text-center text-[13px] text-ink-3">{L("No bids yet.", "இன்னும் ஏலம் இல்லை.")}</div>
            ) : (
              <LayoutGroup>
                <ul className="flex flex-col">
                  <AnimatePresence initial={false}>
                    {bids
                      .slice(-6)
                      .reverse()
                      .map((b, i) => (
                        <motion.li
                          key={b.id}
                          layout
                          initial={{ opacity: 0, x: -16, backgroundColor: "rgba(255,211,77,.22)" }}
                          animate={{ opacity: 1, x: 0, backgroundColor: "rgba(255,211,77,0)" }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.45 }}
                          className="flex items-center gap-3 rounded-xl border-b border-line px-1 py-2 last:border-0"
                        >
                          <Sphere index={b.seat} size={26} />
                          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                            {label(b.seat)}
                            {b.seat === me && view === "member" && <span className="text-ink-3"> {L("(you)", "(நீங்கள்)")}</span>}
                            {i === 0 && <Crown size={13} className="ml-1.5 inline -translate-y-px text-gold-2" />}
                          </span>
                          <span className="text-[11.5px] text-ink-3">{ago(b.at)}</span>
                          <b className="font-display tabular text-[15px] text-gold-2">{inr(b.amount)}</b>
                        </motion.li>
                      ))}
                  </AnimatePresence>
                </ul>
              </LayoutGroup>
            )}
          </div>

          {/* preview-only controls */}
          <div className="rounded-[22px] border border-dashed border-line-2 p-4">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[.12em] text-ink-3">
              <Sparkles size={13} /> {L("Preview controls (not in the real app)", "முன்னோட்ட கட்டுப்பாடு (உண்மை app-ல் இல்லை)")}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                value={view}
                onChange={(v) => setView(v)}
                options={[
                  { value: "member", label: L("Member view", "Member பார்வை") },
                  { value: "organiser", label: L("Organiser view", "Organiser பார்வை") },
                ]}
              />
              <Button size="sm" icon={running ? <Pause size={14} /> : <Play size={14} />} disabled={closed} onClick={running ? pauseBots : startBots}>
                {running ? L("Pause bots", "நிறுத்து") : L("Start bots", "Bots தொடங்கு")}
              </Button>
              <Button size="sm" icon={<RotateCcw size={14} />} onClick={reset}>
                {L("Reset", "மீட்டமை")}
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Segmented
                value={display}
                onChange={setDisplay}
                options={[
                  { value: "id", label: L("ID only", "ID மட்டும்") },
                  { value: "name", label: L("ID + name", "ID + பெயர்") },
                ]}
              />
              <Segmented
                value={arrears ? "yes" : "no"}
                onChange={(v) => setArrears(v === "yes")}
                options={[
                  { value: "no", label: L("No arrears", "பாக்கி இல்லை") },
                  { value: "yes", label: L("I have arrears", "எனக்கு பாக்கி") },
                ]}
              />
            </div>
          </div>
        </section>
      </div>

      {/* ---------- dialogs ---------- */}
      <ConfirmDialog
        open={dialog === "close"}
        icon={<span className="gold-fill grid h-14 w-14 place-items-center rounded-full shadow-lg"><Gavel size={26} /></span>}
        title={L("Close the auction?", "ஏலத்தை முடிக்கலாமா?")}
        body={
          highest ? (
            <>
              {L("Winner", "வெற்றியாளர்")} <b className="text-ink">{label(highest.seat)}</b>, <b className="text-gold-ink">{inr(highest.amount)}</b>
              <br />
              <span className="text-[12.5px]">{L("This is final.", "இது நிரந்தரம்.")}</span>
            </>
          ) : null
        }
        yes={L("Yes, close", "ஆம், முடி")}
        no={L("No", "இல்லை")}
        onNo={() => setDialog(null)}
        onYes={() => {
          setDialog(null);
          if (highest) finish({ seat: highest.seat, amount: highest.amount, lottery: false });
        }}
      />
      <ConfirmDialog
        open={dialog === "lottery"}
        icon={<span className="gold-fill grid h-14 w-14 place-items-center rounded-full shadow-lg"><Dices size={26} /></span>}
        title={L("Nobody bid. Run the lottery?", "யாரும் ஏலம் கேட்கவில்லை. குலுக்கல் போடலாமா?")}
        body={L(`Every ID that has not won joins the draw. The winner gets the prize at the minimum ${inr(MIN)}.`, `இன்னும் சீட்டு எடுக்காத எல்லா ID-களும் குலுக்கலில். வெற்றியாளருக்கு குறைந்தபட்ச தள்ளு ${inr(MIN)}-ல் கிடைக்கும்.`)}
        yes={L("Yes, run it", "ஆம், போடு")}
        no={L("No", "இல்லை")}
        onNo={() => setDialog(null)}
        onYes={() => {
          setDialog(null);
          runLottery();
        }}
      />

      {/* ---------- winner overlay ---------- */}
      <Portal><AnimatePresence>
        {overlay && result && (
          <motion.div className="fixed inset-0 z-50 grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-[rgba(5,4,10,.82)] backdrop-blur-md" onClick={() => setOverlay(false)} />
            <motion.div
              initial={{ scale: 0.8, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="relative w-full max-w-sm overflow-hidden rounded-[30px] border border-[rgba(255,211,77,.35)] bg-[linear-gradient(180deg,#221a3d,#0e0b1a)] p-6 text-center shadow-[0_0_80px_rgba(255,211,77,.25)]"
            >
              <motion.div className="mx-auto grid h-20 w-20 place-items-center rounded-full gold-fill shadow-[0_0_50px_rgba(255,211,77,.6)]" initial={{ rotate: -20, scale: 0.4 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 220, damping: 12, delay: 0.1 }}>
                {result.lottery ? <Dices size={38} /> : <Trophy size={38} />}
              </motion.div>
              <div className="mt-4 text-[12px] font-semibold uppercase tracking-[.16em] text-gold-2">
                {result.lottery ? L("Lottery winner", "குலுக்கல் வெற்றியாளர்") : L("Winner", "வெற்றியாளர்")}
              </div>
              <div className="font-display mt-1 text-[24px] font-extrabold">
                {result.seat === me && view === "member" ? L("You won! 🎉", "நீங்கள் வென்றீர்கள்! 🎉") : label(result.seat)}
              </div>
              <div className="font-display gold-text tabular mt-2 text-[40px] font-extrabold leading-none">{inr(TOTAL - result.amount)}</div>
              <div className="mt-5 divide-y divide-line rounded-2xl bg-[rgba(255,255,255,.05)] px-4 text-[14px]">
                <Row k={L("Discount", "தள்ளு")} v={inr(result.amount)} />
                <Row k={L("Winner gets", "வெற்றியாளருக்கு")} v={inr(TOTAL - result.amount)} />
                <Row k={L("Everyone pays this month", "ஒவ்வொருவரும் இந்த மாதம்")} v={inr(eachPays(chitA, result.amount))} />
                <Row k={L("Last day to pay", "கட்ட கடைசி நாள்")} v="20/12/2026" />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Button onClick={() => setOverlay(false)}>{L("Back to room", "அறைக்கு")}</Button>
                <Button variant="gold" icon={<RotateCcw size={16} />} onClick={reset}>
                  {L("Play again", "மீண்டும்")}
                </Button>
              </div>
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
