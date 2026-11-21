"use client";

import { AnimatePresence, motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { createChitAction } from "@/app/actions/chits";
import { Button, Segmented, cx } from "@/components/ui/kit";
import { MoneyError, defaultRateBps, formatINR, makeTerms, schedule } from "@/domain/money";
import { CHIT_CODE_MAX, isChitCode } from "@/domain/rules";
import { useL } from "@/lib/prefs";
import { useErrorText } from "./common";

const VALUES = [100000, 200000, 300000, 500000, 1000000];
const MONTHS = [10, 12, 15, 20, 25];

export function NewChitForm({ suggestedCode, usedCodes }: { suggestedCode: string; usedCodes: string[] }) {
  const L = useL();
  const err = useErrorText();
  const [code, setCode] = useState(suggestedCode);
  const codeError = !isChitCode(code) ? "INVALID_CODE" : usedCodes.includes(code) ? "CODE_TAKEN" : null;
  const shown = code || suggestedCode;
  const [total, setTotal] = useState("500000");
  const [months, setMonths] = useState("20");
  const [rate, setRate] = useState<string | null>(null); // null = follow 30 ÷ months
  const [step, setStep] = useState("500");
  const [time, setTime] = useState("09:00");
  const [display, setDisplay] = useState<"id" | "name">("id");
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const n = Number(months);
  const ratePct = rate ?? (n >= 2 ? String(defaultRateBps(n) / 100) : "");
  const preview = useMemo(() => {
    try {
      const t = makeTerms({ totalRupees: Number(total), months: n, ratePct: Number(ratePct), incrementRupees: Number(step) });
      return { ok: true as const, t, rows: schedule(t) };
    } catch (e) {
      return { ok: false as const, code: e instanceof MoneyError ? e.code : "INVALID_INPUT" };
    }
  }, [total, n, ratePct, step]);

  const submit = () => {
    if (!preview.ok || codeError) return;
    setServerError(null);
    start(async () => {
      const r = await createChitAction({ code, totalRupees: Number(total), months: n, ratePct: Number(ratePct), incrementRupees: Number(step), openTime: time, display });
      if (r && !r.ok) setServerError(r.error);
    });
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
      <motion.form
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="card flex flex-col gap-5 p-5 sm:p-6"
      >
        <div>
          <h1 className="font-display text-[24px] font-extrabold">{L("New chit", "புதிய சீட்டு")}</h1>
          <p className="text-[13.5px] text-ink-2">
            {L("Member IDs will be", "Member IDs")} <b className="text-ink">{shown}01, {shown}02…</b>
          </p>
        </div>

        <Field label={L("Chit code", "சீட்டு code")} hint={L("1–7 letters or numbers, you can change it", "1–7 எழுத்து/எண், மாற்றலாம்")}>
          <input
            value={code}
            maxLength={CHIT_CODE_MAX}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CHIT_CODE_MAX));
              setServerError(null);
            }}
            className={cx(inputCls, "font-display text-[18px] font-bold tracking-[.12em]", codeError && "border-danger")}
          />
        </Field>

        <Field label={L("Chit value", "சீட்டுத் தொகை")}>
          <Money value={total} onChange={setTotal} />
          <Chips values={VALUES.map(String)} value={total} onPick={setTotal} label={(v) => `${Number(v) / 100000}L`} />
        </Field>

        <Field label={L("Months (= seats)", "மாதங்கள் (= இடங்கள்)")}>
          <input inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value.replace(/\D/g, ""))} className={inputCls} />
          <Chips values={MONTHS.map(String)} value={months} onPick={setMonths} label={(v) => v} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={L("Monthly rate %", "மாத வட்டி %")} hint={rate == null ? L("30 ÷ months (default)", "30 ÷ மாதங்கள் (default)") : undefined}>
            <input inputMode="decimal" value={ratePct} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} className={inputCls} />
          </Field>
          <Field label={L("Bid step ₹", "ஏலப் படி ₹")}>
            <input inputMode="numeric" value={step} onChange={(e) => setStep(e.target.value.replace(/\D/g, ""))} className={inputCls} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={L("Auction opens at", "ஏலம் திறக்கும் நேரம்")}>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
          </Field>
          <Field label={L("Members see", "உறுப்பினர்கள் பார்ப்பது")}>
            <Segmented
              value={display}
              onChange={setDisplay}
              options={[
                { value: "id", label: L("ID only", "ID மட்டும்") },
                { value: "name", label: L("ID + name", "ID + பெயர்") },
              ]}
            />
          </Field>
        </div>

        <AnimatePresence>
          {(!preview.ok || serverError || codeError) && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13.5px] font-semibold text-danger">
                {err(serverError ?? codeError ?? (preview.ok ? "" : preview.code))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Button variant="gold" size="lg" type="submit" disabled={!preview.ok || !!codeError || pending} icon={<Sparkles size={18} />}>
          {pending ? L("Creating…", "உருவாக்குகிறது…") : L("Create chit", "சீட்டு உருவாக்கு")}
        </Button>
        <p className="-mt-2 text-center text-[12px] text-ink-3">{L("Your own seat is added as the first ID. Terms can't change after the chit starts.", "உங்கள் இடம் முதல் ID-ஆக சேர்க்கப்படும். தொடங்கிய பின் விதிகள் மாறாது.")}</p>
      </motion.form>

      {/* live schedule, like the paper sheet */}
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <div className="font-display text-[16px] font-bold">{L("Discount table", "தள்ளு அட்டவணை")}</div>
          {preview.ok && (
            <div className="flex flex-wrap gap-2 text-[12.5px]">
              <Pill>
                {L("Installment", "தவணை")} <b>{formatINR(preview.t.installmentPaise)}</b>
              </Pill>
              <Pill>
                {L("Monthly interest", "மாத வட்டி")} <b>{formatINR(preview.t.interestPaise)}</b>
              </Pill>
            </div>
          )}
        </div>
        {preview.ok ? (
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-[13.5px]">
              <thead className="sticky top-0 bg-elev">
                <tr className="text-left text-[11px] uppercase tracking-[.08em] text-ink-3">
                  <th className="px-5 py-2.5 font-semibold">{L("Month", "மாதம்")}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{L("Minimum discount", "குறைந்தபட்ச தள்ளு")}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{L("Winner gets", "எடுப்பவருக்கு")}</th>
                  <th className="px-5 py-2.5 text-right font-semibold">{L("Each pays", "ஒவ்வொருவரும்")}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.month} className={cx("border-t border-line", !r.bidding && "bg-[color-mix(in_oklab,var(--gold-2)_7%,transparent)]")}>
                    <td className="px-5 py-2 font-semibold">
                      {r.month}
                      {r.month === 1 && <span className="ml-2 text-[11px] font-semibold text-gold-ink">{L("you", "நீங்கள்")}</span>}
                      {r.month === preview.t.months && <span className="ml-2 text-[11px] font-semibold text-ink-3">{L("last seat", "கடைசி")}</span>}
                    </td>
                    <td className="tabular px-3 py-2 text-right">{r.bidding ? formatINR(r.minDiscountPaise) : "—"}</td>
                    <td className="tabular px-3 py-2 text-right">{formatINR(r.prizePaise)}</td>
                    <td className="tabular px-5 py-2 text-right font-semibold">{formatINR(r.payPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-16 text-center text-[13.5px] text-ink-3">{L("Fix the values on the left to see the table.", "அட்டவணை பார்க்க இடப்பக்க மதிப்புகளை சரி செய்யவும்.")}</div>
        )}
      </motion.div>
    </div>
  );
}

const inputCls =
  "h-12 w-full rounded-2xl border border-line-2 bg-[color-mix(in_oklab,var(--ink)_3%,transparent)] px-4 text-[16px] outline-none transition-colors focus:border-gold-3 tabular";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2 text-[12.5px] font-semibold text-ink-2">
        {label}
        {hint && <span className="text-[11px] font-medium text-ink-3">{hint}</span>}
      </span>
      <div className="mt-1 flex flex-col gap-2">{children}</div>
    </label>
  );
}

function Money({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex h-12 items-center gap-1 rounded-2xl border border-line-2 bg-[color-mix(in_oklab,var(--ink)_3%,transparent)] px-4 focus-within:border-gold-3">
      <span className="font-display text-[18px] font-bold text-ink-3">₹</span>
      <input inputMode="numeric" value={Number(value) ? Number(value).toLocaleString("en-IN") : value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} className="font-display tabular min-w-0 flex-1 bg-transparent text-[18px] font-bold outline-none" />
    </div>
  );
}

function Chips({ values, value, onPick, label }: { values: string[]; value: string; onPick: (v: string) => void; label: (v: string) => string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <button type="button" key={v} onClick={() => onPick(v)} className={cx("h-8 rounded-xl px-3 text-[12.5px] font-bold transition-colors", v === value ? "gold-fill" : "btn-ghost")}>
          {label(v)}
        </button>
      ))}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-[color-mix(in_oklab,var(--ink)_3%,transparent)] px-2.5 py-1 text-ink-2">{children}</span>;
}
