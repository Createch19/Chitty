"use client";

import { motion } from "motion/react";
import { ArrowRight, KeyRound } from "lucide-react";
import { useState, useTransition } from "react";
import { groupJoinAction } from "@/app/actions/member";
import { LangToggle, Logo } from "@/components/brand";
import { Button, cx } from "@/components/ui/kit";
import { formatINR } from "@/domain/money";
import { useL, useLang } from "@/lib/prefs";

type View = { business: string; businessTa: string | null; code: string; totalPaise: number; seats: { id: string; label: string }[] };

/** The chit's group link: pick your ID, type your PIN once. A phone that already joined just continues. */
export function GroupJoin({ token, view, known }: { token: string; view: View; known: { token: string; label: string } | null }) {
  const L = useL();
  const [lang] = useLang();
  const [other, setOther] = useState(false);
  const [seat, setSeat] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ready = seat !== "" && pin.length === 6 && !pending;

  const text = (code: string) =>
    ({
      PIN_WRONG: L("Wrong ID or PIN", "ID அல்லது PIN தவறு"),
      PIN_NOT_SET: L("No PIN yet. Ask the organiser for your PIN.", "இன்னும் PIN இல்லை. நடத்துநரிடம் PIN கேளுங்கள்."),
      PIN_LOCKED: L("Too many wrong PINs. Try again in 15 minutes or call the organiser.", "பல முறை தவறான PIN. 15 நிமிடம் கழித்து முயலவும் அல்லது நடத்துநரை அழைக்கவும்."),
      PAUSED: L("Service is paused", "சேவை நிறுத்தப்பட்டுள்ளது"),
      LINK_INVALID: L("This link no longer works. Ask for the new group link.", "இந்த link இனி வேலை செய்யாது. புதிய group link கேளுங்கள்."),
    })[code] ?? L("Couldn't sign in. Try again.", "உள்ளே போக முடியவில்லை. மீண்டும் முயலவும்.");

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await groupJoinAction(token, seat, pin);
      if (!r.ok) {
        setPin("");
        return setError(text(r.error));
      }
      try {
        const old = JSON.parse(localStorage.getItem("chitty.ids") || "[]") as { seat?: string }[];
        const fresh = [...r.ids].sort((a, b) => Number(b.chosen) - Number(a.chosen)).map(({ token, code, business, seat }) => ({ token, code, business, seat }));
        localStorage.setItem("chitty.ids", JSON.stringify([...fresh, ...old.filter((o) => !fresh.some((f) => f.seat === o.seat))].slice(0, 12)));
      } catch {}
      window.location.replace(`/m/${r.ids.find((x) => x.chosen)!.token}`);
    });

  return (
    <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col px-4 pb-10 pt-5">
      <div className="flex items-center justify-between">
        <Logo size={26} />
        <LangToggle />
      </div>
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="card my-auto p-6">
        <div className="text-[12px] font-semibold uppercase tracking-[.12em] text-ink-3">{lang === "ta" && view.businessTa ? view.businessTa : view.business}</div>
        <h1 className="font-display mt-1 text-[24px] font-extrabold">{L(`Chit ${view.code}`, `சீட்டு ${view.code}`)}</h1>
        <div className="font-display gold-text text-[28px] font-extrabold leading-tight">{formatINR(view.totalPaise)}</div>
        {known && !other ? (
          <div className="mt-6 flex flex-col gap-3">
            <a href={`/m/${known.token}`} className="gold-fill font-display inline-flex h-14 items-center justify-center gap-2 rounded-2xl text-[16px] font-bold">
              {L(`Continue as ${known.label}`, `${known.label}-ஆக தொடர்`)} <ArrowRight size={18} />
            </a>
            <Button type="button" variant="plain" onClick={() => setOther(true)}>
              {L("Use another ID", "வேறு ID")}
            </Button>
          </div>
        ) : (
          <form
            className="mt-6 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) submit();
            }}
          >
            <label className="grid gap-1.5 text-[13px] font-semibold text-ink-2">
              {L("Your member ID", "உங்கள் உறுப்பினர் ID")}
              <select value={seat} onChange={(e) => setSeat(e.target.value)} className="h-13 min-h-12 w-full rounded-2xl border border-line-2 bg-elev px-4 text-[16px] font-semibold text-ink outline-none focus:border-gold-3">
                <option value="">{L("Choose", "தேர்வு செய்யவும்")}</option>
                {view.seats.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-[13px] font-semibold text-ink-2">
              {L("6-digit PIN", "6 இலக்க PIN")}
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setError(null);
                }}
                className={cx("font-display h-14 w-full rounded-2xl border bg-[color-mix(in_oklab,var(--ink)_3%,transparent)] text-center text-[26px] font-bold tracking-[.35em] outline-none", error ? "border-danger" : "border-line-2 focus:border-gold-3")}
              />
            </label>
            {error && (
              <div role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-center text-[13.5px] font-semibold text-danger">
                {error}
              </div>
            )}
            <Button type="submit" variant="gold" size="lg" icon={<KeyRound size={18} />} disabled={!ready}>
              {pending ? L("Opening…", "திறக்கிறது…") : L("Open my chit", "என் சீட்டைத் திற")}
            </Button>
            <p className="text-center text-[12px] text-ink-3">{L("Forgot your PIN? Ask your organiser.", "PIN மறந்துவிட்டதா? நடத்துநரிடம் கேளுங்கள்.")}</p>
          </form>
        )}
      </motion.div>
    </div>
  );
}
