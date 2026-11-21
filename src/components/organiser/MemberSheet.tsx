"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRightLeft, Eye, EyeOff, IdCard, Pencil, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { setAadhaarAction, showAadhaarAction, transferSeatAction } from "@/app/actions/chits";
import { Button, ConfirmDialog, Sphere, useToast } from "@/components/ui/kit";
import { cleanAadhaar, maskAadhaar, spacedAadhaar } from "@/domain/aadhaar";
import { useL } from "@/lib/prefs";
import type { ChitDetailData } from "./ChitPage";
import { useErrorText } from "./common";

type Seat = ChitDetailData["seats"][number];

/** One member ID: contact, Aadhaar (masked; Show is audited) and transfer to a new person (running chits). */
export function MemberSheet({ seat, running, onClose }: { seat: Seat; running: boolean; onClose: () => void }) {
  const L = useL();
  const err = useErrorText();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [shown, setShown] = useState<string | null>(null);
  const [editA, setEditA] = useState<string | null>(null);
  const [tf, setTf] = useState<{ name: string; phone: string; aadhaar: string } | null>(null);
  const [ask, setAsk] = useState(false);

  // a shown Aadhaar hides itself again after 30 seconds
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 30_000);
    return () => clearTimeout(t);
  }, [shown]);

  const fail = (r: { ok: boolean; error?: string }) => toast(err(r.error ?? ""), "warn");
  const aOk = (v: string) => v.trim() === "" || cleanAadhaar(v) != null;

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-[rgba(8,6,14,.55)] backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} className="card-solid relative max-h-[92vh] w-full max-w-md overflow-y-auto p-6">
        <button aria-label={L("Close", "மூடு")} onClick={onClose} className="absolute right-4 top-4 text-ink-3">
          <X size={18} />
        </button>
        <div className="flex items-center gap-3">
          <Sphere index={seat.number - 1} size={44} />
          <div>
            <h3 className="font-display text-[20px] font-bold leading-tight">{seat.code}</h3>
            <div className="text-[13.5px] text-ink-2">
              {seat.name} · {seat.phone.slice(0, 5)} {seat.phone.slice(5)}
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-line p-4">
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[.1em] text-ink-3">
            <IdCard size={14} /> Aadhaar
          </div>
          {editA == null ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[16px] tracking-wider">{shown ? spacedAadhaar(shown) : (maskAadhaar(seat.aadhaarLast4) ?? <span className="font-sans text-[13.5px] text-ink-3">{L("Not added", "சேர்க்கவில்லை")}</span>)}</span>
              <div className="flex gap-2">
                {seat.aadhaarLast4 && (
                  <Button
                    size="sm"
                    icon={shown ? <EyeOff size={14} /> : <Eye size={14} />}
                    disabled={pending}
                    onClick={() =>
                      shown
                        ? setShown(null)
                        : start(async () => {
                            const r = await showAadhaarAction(seat.id);
                            if (r.ok) setShown(r.data as string);
                            else fail(r);
                          })
                    }
                  >
                    {shown ? L("Hide", "மறை") : L("Show", "காட்டு")}
                  </Button>
                )}
                <Button size="sm" variant="plain" icon={<Pencil size={14} />} onClick={() => setEditA("")}>
                  {seat.aadhaarLast4 ? L("Change", "மாற்று") : L("Add", "சேர்")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-2">
              <input
                value={editA}
                onChange={(e) => setEditA(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder="1234 5678 9012"
                className="h-11 w-full rounded-xl border border-line-2 bg-[color-mix(in_oklab,var(--ink)_3%,transparent)] px-3 font-mono text-[15px] outline-none focus:border-gold-3"
              />
              {!aOk(editA) && editA.replace(/\D/g, "").length >= 12 && <p className="mt-1 text-[12px] text-danger">{err("INVALID_AADHAAR")}</p>}
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => setEditA(null)}>
                  {L("Cancel", "ரத்து")}
                </Button>
                <Button
                  size="sm"
                  variant="gold"
                  disabled={pending || !aOk(editA)}
                  onClick={() =>
                    start(async () => {
                      const r = await setAadhaarAction(seat.id, editA);
                      if (!r.ok) return fail(r);
                      setEditA(null);
                      setShown(null);
                      toast(editA.trim() ? L("Aadhaar saved", "Aadhaar சேமிக்கப்பட்டது") : L("Aadhaar removed", "Aadhaar நீக்கப்பட்டது"), "ok");
                    })
                  }
                >
                  {editA.trim() ? L("Save", "சேமி") : L("Remove", "நீக்கு")}
                </Button>
              </div>
            </div>
          )}
          <p className="mt-2 text-[11.5px] text-ink-3">{L("Stored encrypted. Each Show is recorded in the audit log.", "Encrypt செய்து சேமிக்கப்படுகிறது. ஒவ்வொரு Show-வும் audit log-ல் பதிவாகும்.")}</p>
        </div>

        {running && !seat.isOrganiser && (
          <div className="mt-4 rounded-2xl border border-line p-4">
            <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[.1em] text-ink-3">
              <ArrowRightLeft size={14} /> {L("Transfer this ID", "இந்த ID-ஐ மாற்று")}
            </div>
            <AnimatePresence initial={false} mode="wait">
              {tf == null ? (
                <motion.div key="a" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <p className="mt-2 text-[13px] text-ink-2">{L(`${seat.code} passes to a new person. The ID and all history stay; the old link stops and the new person gets a new link.`, `${seat.code} புதிய நபருக்கு மாறும். ID, பழைய விவரங்கள் அப்படியே; பழைய link நின்று புதியவருக்கு புதிய link.`)}</p>
                  <Button size="sm" className="mt-3" icon={<ArrowRightLeft size={14} />} onClick={() => setTf({ name: "", phone: "", aadhaar: "" })}>
                    {L("Start transfer", "மாற்றம் தொடங்கு")}
                  </Button>
                </motion.div>
              ) : (
                <motion.div key="b" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 grid gap-2.5">
                  {(
                    [
                      ["name", L("New member's name", "புதியவர் பெயர்"), "text"],
                      ["phone", L("Mobile number", "Mobile எண்"), "tel"],
                      ["aadhaar", L("Aadhaar (optional)", "Aadhaar (விருப்பம்)"), "numeric"],
                    ] as const
                  ).map(([k, label, mode]) => (
                    <label key={k} className="grid gap-1 text-[12.5px] font-semibold text-ink-2">
                      {label}
                      <input
                        value={tf[k]}
                        onChange={(e) => setTf({ ...tf, [k]: e.target.value })}
                        inputMode={mode === "text" ? undefined : mode}
                        autoComplete="off"
                        className="h-11 rounded-xl border border-line-2 bg-[color-mix(in_oklab,var(--ink)_3%,transparent)] px-3 text-[15px] font-normal text-ink outline-none focus:border-gold-3"
                      />
                    </label>
                  ))}
                  <div className="mt-1 flex gap-2">
                    <Button size="sm" onClick={() => setTf(null)}>
                      {L("Cancel", "ரத்து")}
                    </Button>
                    <Button size="sm" variant="gold" disabled={pending || !tf.name.trim() || tf.phone.replace(/\D/g, "").length < 10 || !aOk(tf.aadhaar)} onClick={() => setAsk(true)}>
                      {L("Transfer", "மாற்று")}
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <ConfirmDialog
          open={ask && tf != null}
          icon={
            <span className="gold-fill grid h-14 w-14 place-items-center rounded-full">
              <ArrowRightLeft size={26} />
            </span>
          }
          title={L(`Transfer ${seat.code} to ${tf?.name.trim() ?? ""}?`, `${seat.code}-ஐ ${tf?.name.trim() ?? ""}-க்கு மாற்றலாமா?`)}
          body={L(`${seat.name}'s link stops working now. Send the new person their link after this.`, `${seat.name}-ன் link இப்போதே நின்றுவிடும். பிறகு புதியவருக்கு link அனுப்பவும்.`)}
          yes={L("Yes, transfer", "ஆம், மாற்று")}
          no={L("No", "இல்லை")}
          onNo={() => setAsk(false)}
          onYes={() => {
            setAsk(false);
            const x = tf!;
            start(async () => {
              const r = await transferSeatAction(seat.id, x);
              if (!r.ok) return fail(r);
              toast(L(`${seat.code} transferred. Send the new link.`, `${seat.code} மாற்றப்பட்டது. புதிய link அனுப்பவும்.`), "ok");
              onClose();
            });
          }}
        />
      </motion.div>
    </motion.div>
  );
}
