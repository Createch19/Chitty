"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, Copy, Crown, Gavel, Pencil, Play, Rocket, Timer, Trash2, UserPlus, X } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { addSeatAction, changeDateAction, deleteChitAction, openMonthAction, removeSeatAction, setOrganiserSeatAction, startChitAction, updateSeatAction } from "@/app/actions/chits";
import { Badge, Button, Portal, ConfirmDialog, Ring, Sphere, cx, useToast } from "@/components/ui/kit";
import { formatINR } from "@/domain/money";
import { useL } from "@/lib/prefs";
import { useDateText, useErrorText } from "./common";
import { MemberLinks } from "./MemberLinks";

export type ChitDetailData = {
  chit: { id: string; code: string; status: string; startDate: string | null; openTime: string; display: string; terms: { totalPaise: number; months: number; rateBps: number; incrementPaise: number; installmentPaise: number; interestPaise: number } };
  seats: { id: string; number: number; code: string; name: string; phone: string; isOrganiser: boolean; wonMonth: number | null; aadhaarLast4: string | null }[];
  months: { id: string; month: number; auctionDate: string; lastPayDate: string; bidding: boolean; minDiscountPaise: number; status: string; discountPaise: number | null; winnerSeatId: string | null; lottery: boolean; payPaise: number | null; paidCount: number; payoutDone: boolean }[];
};

const fmtPhone = (p: string) => `${p.slice(0, 5)} ${p.slice(5)}`;

export function ChitPage({ d, links, today }: { d: ChitDetailData; links: Record<string, string>; today: string }) {
  const L = useL();
  const t = d.chit.terms;
  return (
    <div className="flex flex-col gap-5">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card relative overflow-hidden p-5 sm:p-6">
        <div aria-hidden className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,var(--aurora-1),transparent_65%)]" />
        {/* Phone: code tile · name + amount · ring on one row, facts full width below. Wider: facts sit under the name. */}
        <div className="relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-4 sm:gap-x-5">
          <div
            className={cx(
              "gold-fill font-display grid h-14 min-w-14 place-items-center whitespace-nowrap rounded-2xl px-2 font-extrabold shadow-[0_18px_40px_-16px_rgba(240,169,10,.9)] sm:row-span-2 sm:h-20 sm:min-w-20 sm:rounded-3xl sm:px-3",
              d.chit.code.length >= 4 ? "text-[12px] sm:text-[18px]" : d.chit.code.length === 3 ? "text-[18px] sm:text-[25px]" : d.chit.code.length === 2 ? "text-[22px] sm:text-[30px]" : "text-[26px] sm:text-[34px]",
            )}
          >
            {d.chit.code}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="font-display text-[20px] font-extrabold leading-tight sm:text-[24px]">{L(`Chit ${d.chit.code}`, `சீட்டு ${d.chit.code}`)}</h1>
              {d.chit.status === "draft" ? <Badge>{L("Draft", "வரைவு")}</Badge> : d.chit.status === "completed" ? <Badge tone="ok">{L("Completed", "முடிந்தது")}</Badge> : <Badge tone="gold">{L("Running", "நடக்கிறது")}</Badge>}
            </div>
            <div className="font-display gold-text tabular mt-1 whitespace-nowrap text-[20px] font-extrabold leading-none min-[400px]:text-[24px] sm:text-[30px]">{formatINR(t.totalPaise)}</div>
          </div>
          <div className="sm:row-span-2">
            {(() => {
              const done = d.chit.status === "draft" ? d.seats.length : d.months.filter((m) => m.status === "closed").length;
              return (
                <Ring value={done / t.months} size={68} stroke={7}>
                  <div className="text-center leading-none">
                    <div className="font-display text-[20px] font-extrabold">{done}</div>
                    <div className="text-[10.5px] text-ink-3">/ {t.months}</div>
                  </div>
                </Ring>
              );
            })()}
          </div>
          <div className="col-span-3 flex flex-wrap gap-2 text-[12.5px] sm:col-span-1 sm:col-start-2">
            <Fact icon={<CalendarDays size={14} />}>{L(`${t.months} months · ${formatINR(t.installmentPaise)} a month`, `${t.months} மாதம் · மாதம் ${formatINR(t.installmentPaise)}`)}</Fact>
            <Fact>{L(`${t.rateBps / 100}% a month = ${formatINR(t.interestPaise)}`, `மாத வட்டி ${t.rateBps / 100}% = ${formatINR(t.interestPaise)}`)}</Fact>
            <Fact icon={<Gavel size={14} />}>{L(`Steps of ${formatINR(t.incrementPaise)}`, `${formatINR(t.incrementPaise)} படிகள்`)}</Fact>
            <Fact icon={<Timer size={14} />}>{L(`Opens ${d.chit.openTime}`, `${d.chit.openTime}-க்கு திறக்கும்`)}</Fact>
          </div>
        </div>
      </motion.div>

      {d.chit.status === "draft" ? <Draft d={d} today={today} /> : <Running d={d} />}
      {d.seats.length > 0 && d.chit.status !== "completed" && <MemberLinks d={d} links={links} />}
    </div>
  );
}

/* ---------------------------- draft: seats + start ---------------------------- */

function Draft({ d, today }: { d: ChitDetailData; today: string }) {
  const L = useL();
  const err = useErrorText();
  const dt = useDateText();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ name: "", phone: "" });
  const [edit, setEdit] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [confirm, setConfirm] = useState<null | { kind: "start" } | { kind: "delete" } | { kind: "remove"; id: string; code: string }>(null);
  const full = d.seats.length === d.chit.terms.months;
  const own = d.seats.find((s) => s.isOrganiser);
  const day = Number(startDate.slice(8, 10));
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && day >= 1 && day <= 28;

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        if (okText) toast(okText, "ok");
        after?.();
      } else toast(err((r as { error: string }).error), "warn");
    });

  const submit = () => {
    if (edit) act(() => updateSeatAction(edit, form), L("Saved", "சேமிக்கப்பட்டது"), () => (setEdit(null), setForm({ name: "", phone: "" })));
    else act(() => addSeatAction(d.chit.id, form), L("Seat added", "இடம் சேர்க்கப்பட்டது"), () => setForm({ name: "", phone: "" }));
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)]">
      <section className="card p-2 sm:p-3">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="text-[13px] font-bold text-ink-2">{L("Member IDs", "Member IDs")}</div>
          <div className="text-[12px] text-ink-3">{L("A person can hold several IDs", "ஒருவர் பல ID வைத்திருக்கலாம்")}</div>
        </div>
        <ul>
          <AnimatePresence initial={false}>
            {d.seats.map((s) => (
              <motion.li key={s.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-[color-mix(in_oklab,var(--ink)_4%,transparent)]">
                <Sphere index={s.number - 1} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="font-display flex items-center gap-1.5 text-[15px] font-bold leading-tight">
                    {s.code}
                    {s.isOrganiser && <Badge tone="violet" className="px-2 py-0 font-sans text-[10.5px]">{L("You · Organiser", "நீங்கள் · நடத்துநர்")}</Badge>}
                  </div>
                  <div className="truncate text-[12.5px] text-ink-2">
                    {s.name} <span className="text-ink-3">· {fmtPhone(s.phone)}</span>
                  </div>
                </div>
                <IconBtn label={L("Another seat for this person", "இவருக்கு இன்னொரு இடம்")} onClick={() => (setEdit(null), setForm({ name: s.name, phone: s.phone }))} disabled={full}>
                  <Copy size={15} />
                </IconBtn>
                <IconBtn label={L("Edit", "திருத்து")} onClick={() => (setEdit(s.id), setForm({ name: s.name, phone: s.phone }))}>
                  <Pencil size={15} />
                </IconBtn>
                {!s.isOrganiser && (
                  <>
                    <IconBtn label={L("Make this my seat", "இதை என் இடமாக்கு")} onClick={() => act(() => setOrganiserSeatAction(d.chit.id, s.id), L(`${s.code} is now your seat`, `${s.code} இப்போது உங்கள் இடம்`))}>
                      <Crown size={15} />
                    </IconBtn>
                    <IconBtn label={L("Remove", "நீக்கு")} onClick={() => setConfirm({ kind: "remove", id: s.id, code: s.code })}>
                      <Trash2 size={15} />
                    </IconBtn>
                  </>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="card p-5"
        >
          <div className="flex items-center justify-between">
            <div className="font-display text-[16px] font-bold">{edit ? L("Edit member ID", "Member ID திருத்து") : L(`Add member ID ${d.seats.length + 1 <= d.chit.terms.months ? `(${d.seats.length + 1}/${d.chit.terms.months})` : ""}`, `Member ID சேர் ${d.seats.length + 1 <= d.chit.terms.months ? `(${d.seats.length + 1}/${d.chit.terms.months})` : ""}`)}</div>
            {(edit || form.name) && (
              <button type="button" aria-label={L("Clear", "அழி")} onClick={() => (setEdit(null), setForm({ name: "", phone: "" }))} className="text-ink-3">
                <X size={18} />
              </button>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-3">
            <Input label={L("Name", "பெயர்")} value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Selvi" />
            <Input label={L("Mobile number", "Mobile எண்")} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="98400 12345" inputMode="tel" />
          </div>
          <Button variant="gold" size="lg" type="submit" className="mt-4 w-full" icon={<UserPlus size={17} />} disabled={pending || (!edit && full)}>
            {edit ? L("Save", "சேமி") : full ? L("All seats filled", "எல்லா இடமும் நிரம்பியது") : L("Add", "சேர்")}
          </Button>
        </form>

        <div className={cx("card p-5 transition-shadow", full && "shadow-[0_0_0_2px_var(--gold-2),var(--shadow-card)]")}>
          <div className="flex items-center gap-2 font-display text-[16px] font-bold">
            <Rocket size={17} className="text-gold-ink" /> {L("Start the chit", "சீட்டைத் தொடங்கு")}
          </div>
          <p className="mt-1 text-[13px] text-ink-2">
            {full
              ? L("Pick the start date. It becomes month 1 and the auction day of every month (1st–28th only).", "தொடக்க தேதியைத் தேர்வு செய்யுங்கள். அதுவே 1-வது மாதமும் ஒவ்வொரு மாத ஏல நாளும் (1–28 மட்டும்).")
              : L(`Add ${d.chit.terms.months - d.seats.length} more member IDs first.`, `முதலில் இன்னும் ${d.chit.terms.months - d.seats.length} member ID சேர்க்கவும்.`)}
          </p>
          <input type="date" value={startDate} min={today} onChange={(e) => setStartDate(e.target.value)} disabled={!full} className="mt-3 h-12 w-full rounded-2xl border border-line-2 bg-[color-mix(in_oklab,var(--ink)_3%,transparent)] px-4 text-[15px] outline-none focus:border-gold-3 disabled:opacity-40" />
          {startDate && !dateOk && <div className="mt-2 text-[12.5px] font-semibold text-danger">{err("START_DAY_1_TO_28")}</div>}
          <Button variant="gold" size="lg" className="mt-3 w-full" icon={<Play size={17} />} disabled={!full || !dateOk || !own || pending} onClick={() => setConfirm({ kind: "start" })}>
            {L("Start", "தொடங்கு")}
          </Button>
        </div>

        <div className="card flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold">{L("Don't need this chit?", "இந்த சீட்டு வேண்டாமா?")}</div>
            <div className="text-[12.5px] text-ink-3">{L("Only before it starts. Its member IDs go too.", "தொடங்கும் முன் மட்டும். இதன் member IDs-ம் நீங்கும்.")}</div>
          </div>
          <Button variant="ghost" className="shrink-0 text-danger" icon={<Trash2 size={16} />} disabled={pending} onClick={() => setConfirm({ kind: "delete" })}>
            {L("Delete chit", "சீட்டை நீக்கு")}
          </Button>
        </div>
      </section>

      <ConfirmDialog
        open={confirm?.kind === "start"}
        icon={<span className="gold-fill grid h-14 w-14 place-items-center rounded-full"><Rocket size={26} /></span>}
        title={L(`Start Chit ${d.chit.code} on ${dt(startDate)}?`, `சீட்டு ${d.chit.code}-ஐ ${dt(startDate)} அன்று தொடங்கலாமா?`)}
        body={L(`Terms and member IDs are fixed after this. Month 1 goes to your seat ${own?.code ?? ""}; every member pays the full installment.`, `இதன் பிறகு விதிகளும் member IDs-ம் மாறாது. 1-வது மாதம் உங்கள் இடம் ${own?.code ?? ""}-க்கு; அனைவரும் முழுத் தவணை கட்டுவார்கள்.`)}
        yes={L("Yes, start", "ஆம், தொடங்கு")}
        no={L("No", "இல்லை")}
        onNo={() => setConfirm(null)}
        onYes={() => {
          setConfirm(null);
          act(() => startChitAction(d.chit.id, startDate), L("Chit started 🎉", "சீட்டு தொடங்கியது 🎉"));
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === "remove"}
        tone="danger"
        icon={<span className="grid h-14 w-14 place-items-center rounded-full bg-danger-soft text-danger"><Trash2 size={24} /></span>}
        title={L(`Remove ${confirm?.kind === "remove" ? confirm.code : ""}?`, `${confirm?.kind === "remove" ? confirm.code : ""}-ஐ நீக்கலாமா?`)}
        yes={L("Yes, remove", "ஆம், நீக்கு")}
        no={L("No", "இல்லை")}
        onNo={() => setConfirm(null)}
        onYes={() => {
          const c = confirm;
          setConfirm(null);
          if (c?.kind === "remove") act(() => removeSeatAction(c.id), L("Removed", "நீக்கப்பட்டது"));
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === "delete"}
        tone="danger"
        icon={<span className="grid h-14 w-14 place-items-center rounded-full bg-danger-soft text-danger"><Trash2 size={24} /></span>}
        title={L(`Delete Chit ${d.chit.code}?`, `சீட்டு ${d.chit.code}-ஐ நீக்கலாமா?`)}
        body={L(`This removes the chit and its ${d.seats.length} member IDs. It can't be undone.`, `சீட்டும் அதன் ${d.seats.length} member IDs-ம் நீங்கும். திரும்பப் பெற முடியாது.`)}
        yes={L("Yes, delete", "ஆம், நீக்கு")}
        no={L("No", "இல்லை")}
        onNo={() => setConfirm(null)}
        onYes={() => {
          setConfirm(null);
          act(() => deleteChitAction(d.chit.id), L(`Chit ${d.chit.code} deleted`, `சீட்டு ${d.chit.code} நீக்கப்பட்டது`));
        }}
      />
    </div>
  );
}

/* ---------------------------- running: months ---------------------------- */

function Running({ d }: { d: ChitDetailData }) {
  const L = useL();
  const dt = useDateText();
  const err = useErrorText();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [dateFor, setDateFor] = useState<{ id: string; month: number; date: string } | null>(null);
  const [openConfirm, setOpenConfirm] = useState<{ id: string; month: number } | null>(null);
  const code = (id: string | null) => d.seats.find((s) => s.id === id)?.code ?? "—";
  const current = d.months.find((m) => m.status === "open") ?? d.months.find((m) => m.status === "closed" && !m.payoutDone);
  const next = d.months.find((m) => m.status === "pending");
  const prevOfNextClosed = next ? next.month === 1 || d.months[next.month - 2]?.status === "closed" : false;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {current && (
          <Link href={`/app/chits/${d.chit.id}/months/${current.id}`} className="group">
            <motion.div whileHover={{ y: -3 }} className="theme-stage relative h-full overflow-hidden rounded-[24px] border border-[rgba(255,211,77,.25)] bg-[radial-gradient(120%_130%_at_90%_0%,#3d2c70_0%,#161130_50%,#0a0813_100%)] p-5 text-ink shadow-pop">
              {current.status === "open" ? (
                <Badge tone="live">
                  <span className="live-dot" /> {L("Auction live", "ஏலம் நடக்கிறது")}
                </Badge>
              ) : (
                <Badge tone="gold">{L(`Collecting · ${current.paidCount}/${d.chit.terms.months}`, `வசூல் · ${current.paidCount}/${d.chit.terms.months}`)}</Badge>
              )}
              <div className="font-display mt-2 text-[22px] font-extrabold">{L(`Month ${current.month}`, `${current.month}-வது மாதம்`)}</div>
              <div className="text-[13.5px] text-ink-2">
                {current.status === "open"
                  ? L(`Minimum ${formatINR(current.minDiscountPaise)} · close it in the evening`, `குறைந்தபட்சம் ${formatINR(current.minDiscountPaise)} · மாலையில் முடிக்கவும்`)
                  : L(`Each pays ${formatINR(current.payPaise ?? 0)} by ${dt(current.lastPayDate)}`, `ஒவ்வொருவரும் ${formatINR(current.payPaise ?? 0)} · ${dt(current.lastPayDate)}-க்குள்`)}
              </div>
              <span className="btn-gold mt-4 inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-[14px] font-bold">{current.status === "open" ? L("Open the auction", "ஏலத்தைத் திற") : L("Open collection", "வசூலைத் திற")}</span>
            </motion.div>
          </Link>
        )}
        {next && (
          <div className="card flex h-full flex-col p-5">
            <div className="text-[12px] font-semibold uppercase tracking-[.12em] text-ink-3">{L("Next auction", "அடுத்த ஏலம்")}</div>
            <div className="font-display mt-1 text-[22px] font-extrabold">
              {L(`Month ${next.month}`, `${next.month}-வது மாதம்`)} · {dt(next.auctionDate)}
            </div>
            <div className="text-[13.5px] text-ink-2">
              {next.month === d.chit.terms.months
                ? L("Last month: the one remaining ID wins automatically.", "கடைசி மாதம்: மீதமுள்ள ஒரு ID தானாக வெல்லும்.")
                : L(`Opens automatically at ${d.chit.openTime}. Minimum ${formatINR(next.minDiscountPaise)}.`, `${d.chit.openTime}-க்கு தானாக திறக்கும். குறைந்தபட்சம் ${formatINR(next.minDiscountPaise)}.`)}
            </div>
            <div className="mt-auto flex flex-wrap gap-2 pt-4">
              <Button size="sm" icon={<CalendarDays size={14} />} onClick={() => setDateFor({ id: next.id, month: next.month, date: next.auctionDate })}>
                {L("Change date", "தேதி மாற்று")}
              </Button>
              <Button size="sm" variant="gold" icon={<Play size={14} />} disabled={!prevOfNextClosed || pending} onClick={() => setOpenConfirm({ id: next.id, month: next.month })}>
                {L("Open now", "இப்போதே திற")}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[.08em] text-ink-3">
                <th className="px-4 py-3 font-semibold">{L("Month", "மாதம்")}</th>
                <th className="px-3 py-3 font-semibold">{L("Auction", "ஏலம்")}</th>
                <th className="px-3 py-3 text-right font-semibold">{L("Minimum", "குறைந்தபட்சம்")}</th>
                <th className="px-3 py-3 text-right font-semibold">{L("Discount", "தள்ளு")}</th>
                <th className="px-3 py-3 font-semibold">{L("Winner", "வென்றவர்")}</th>
                <th className="px-3 py-3 text-right font-semibold">{L("Each pays", "ஒவ்வொருவரும்")}</th>
                <th className="px-4 py-3 font-semibold">{L("Status", "நிலை")}</th>
              </tr>
            </thead>
            <tbody>
              {d.months.map((m) => (
                <tr key={m.id} className={cx("border-b border-line last:border-0", m.status === "open" && "bg-[color-mix(in_oklab,var(--gold-2)_10%,transparent)]")}>
                  <td className="px-4 py-2.5 font-semibold">
                    {m.status === "pending" ? (
                      m.month
                    ) : (
                      <Link className="underline decoration-dotted underline-offset-4 hover:text-gold-ink" href={`/app/chits/${d.chit.id}/months/${m.id}`}>
                        {m.month}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-ink-2">{dt(m.auctionDate)}</td>
                  <td className="tabular px-3 py-2.5 text-right">{m.bidding ? formatINR(m.minDiscountPaise) : <span className="text-ink-3">—</span>}</td>
                  <td className="tabular px-3 py-2.5 text-right font-semibold">{m.discountPaise != null ? formatINR(m.discountPaise) : ""}</td>
                  <td className="px-3 py-2.5">
                    {m.winnerSeatId ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Crown size={13} className="text-gold-ink" /> {code(m.winnerSeatId)}
                        {m.lottery && <span className="text-[11px] text-ink-3">{L("(lottery)", "(குலுக்கல்)")}</span>}
                      </span>
                    ) : (
                      ""
                    )}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right">{m.payPaise != null ? formatINR(m.payPaise) : ""}</td>
                  <td className="px-4 py-2.5">
                    {m.status === "open" ? (
                      <Badge tone="live">
                        <span className="live-dot" /> LIVE
                      </Badge>
                    ) : m.status === "closed" ? (
                      m.payoutDone ? <Badge tone="ok">{L("Paid out", "Payout முடிந்தது")}</Badge> : <Badge tone="gold">{`${m.paidCount}/${d.chit.terms.months}`}</Badge>
                    ) : (
                      <Badge>{L("Upcoming", "வரவிருக்கிறது")}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={openConfirm != null}
        icon={<span className="gold-fill grid h-14 w-14 place-items-center rounded-full"><Play size={26} /></span>}
        title={L(`Open month ${openConfirm?.month ?? ""} now?`, `${openConfirm?.month ?? ""}-வது மாதத்தை இப்போதே திறக்கலாமா?`)}
        body={L("It normally opens by itself on the auction day.", "பொதுவாக ஏல நாளில் தானாக திறக்கும்.")}
        yes={L("Yes, open", "ஆம், திற")}
        no={L("No", "இல்லை")}
        onNo={() => setOpenConfirm(null)}
        onYes={() => {
          const o = openConfirm!;
          setOpenConfirm(null);
          start(async () => {
            const r = await openMonthAction(o.id);
            toast(r.ok ? L("Opened", "திறக்கப்பட்டது") : err((r as { error: string }).error), r.ok ? "ok" : "warn");
          });
        }}
      />

      <Portal><AnimatePresence>
        {dateFor && (
          <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-[rgba(8,6,14,.55)] backdrop-blur-sm" onClick={() => setDateFor(null)} />
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} className="card-solid relative w-full max-w-sm p-6">
              <h3 className="font-display text-[19px] font-bold">{L(`Month ${dateFor.month} auction date`, `${dateFor.month}-வது மாத ஏல தேதி`)}</h3>
              <p className="mt-1 text-[13px] text-ink-2">{L("Only this month moves. Members are told, and the last pay day moves with it.", "இந்த மாதம் மட்டும் மாறும். உறுப்பினர்களுக்கு தெரிவிக்கப்படும்; கடைசி கட்டும் நாளும் மாறும்.")}</p>
              <input type="date" value={dateFor.date} onChange={(e) => setDateFor({ ...dateFor, date: e.target.value })} className="mt-4 h-12 w-full rounded-2xl border border-line-2 bg-[color-mix(in_oklab,var(--ink)_3%,transparent)] px-4 text-[15px] outline-none focus:border-gold-3" />
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Button size="lg" onClick={() => setDateFor(null)}>
                  {L("Cancel", "ரத்து")}
                </Button>
                <Button
                  size="lg"
                  variant="gold"
                  disabled={pending}
                  onClick={() => {
                    const x = dateFor;
                    start(async () => {
                      const r = await changeDateAction(x.id, x.date);
                      if (r.ok) {
                        setDateFor(null);
                        toast(L("Date changed", "தேதி மாற்றப்பட்டது"), "ok");
                      } else toast(err((r as { error: string }).error), "warn");
                    });
                  }}
                >
                  {L("Save", "சேமி")}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence></Portal>
    </>
  );
}

function Fact({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-[color-mix(in_oklab,var(--ink)_3%,transparent)] px-2.5 py-1 font-semibold text-ink-2">
      {icon}
      {children}
    </span>
  );
}

function IconBtn({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-3 transition-colors hover:bg-bg-2 hover:text-ink disabled:opacity-30">
      {children}
    </button>
  );
}

function Input({ label, value, onChange, placeholder, inputMode }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; inputMode?: "tel" }) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-semibold text-ink-2">{label}</span>
      <input value={value} inputMode={inputMode} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="mt-1 h-12 w-full rounded-2xl border border-line-2 bg-[color-mix(in_oklab,var(--ink)_3%,transparent)] px-4 text-[15px] outline-none transition-colors placeholder:text-ink-3 focus:border-gold-3" />
    </label>
  );
}
