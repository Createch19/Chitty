"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, IdCard, Link2, Link2Off, MessageCircle, RefreshCw, X } from "lucide-react";
import { useState, useTransition } from "react";
import { issueLinkAction, revokeLinkAction } from "@/app/actions/chits";
import { Badge, Button, Portal, ConfirmDialog, Sphere, cx, useToast } from "@/components/ui/kit";
import { useL } from "@/lib/prefs";
import type { ChitDetailData } from "./ChitPage";
import { useDateText, useErrorText } from "./common";
import { MemberSheet } from "./MemberSheet";

type Seat = ChitDetailData["seats"][number];

/**
 * Each member ID gets one secret link (BUSINESS-CONCEPT §10). Only its hash is stored, so the link can be
 * shown once; sending again makes a new link and the old one stops working.
 */
export function MemberLinks({ d, links }: { d: ChitDetailData; links: Record<string, string> }) {
  const L = useL();
  const dt = useDateText();
  const err = useErrorText();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [sheet, setSheet] = useState<{ seat: Seat; url: string } | null>(null);
  const [ask, setAsk] = useState<{ seat: Seat; kind: "new" | "revoke" } | null>(null);
  const [copied, setCopied] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const detailSeat = d.seats.find((s) => s.id === detail);
  const sent = d.seats.filter((s) => links[s.id]).length;

  const issue = (seat: Seat) =>
    start(async () => {
      const r = await issueLinkAction(seat.id);
      if (!r.ok) return toast(err((r as { error: string }).error), "warn");
      setCopied(false);
      setSheet({ seat, url: `${window.location.origin}/m/${r.data}` });
    });

  const message = (seat: Seat, url: string) =>
    L(
      `Vanakkam ${seat.name}! Your chit ID ${seat.code} (chit ${d.chit.code}) is ready on Chitty. Open this link to see auctions, bid live and check your payments. Keep it private:\n${url}`,
      `வணக்கம் ${seat.name}! உங்கள் சீட்டு ID ${seat.code} (சீட்டு ${d.chit.code}) Chitty-ல் தயார். ஏலம், கட்டணம் பார்க்க இந்த link-ஐ திறக்கவும். யாருடனும் பகிர வேண்டாம்:\n${url}`,
    );

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <div className="font-display text-[17px] font-bold">{L("Members & links", "உறுப்பினர்கள் & links")}</div>
          <div className="text-[12.5px] text-ink-3">{L("Tap an ID for Aadhaar and transfer. One private link per ID, sent on WhatsApp.", "Aadhaar, மாற்றம்: ID-ஐ தொடவும். ஒவ்வொரு ID-க்கும் ஒரு தனி link, WhatsApp-ல்.")}</div>
        </div>
        <Badge tone={sent === d.seats.length ? "ok" : "gold"}>{L(`${sent}/${d.seats.length} sent`, `${sent}/${d.seats.length} அனுப்பியது`)}</Badge>
      </div>
      <ul className="divide-y divide-line">
        {d.seats.map((s) => {
          const at = links[s.id];
          return (
            <li key={s.id} className="flex items-center gap-3 px-5 py-3">
              <button aria-label={L(`${s.code} details`, `${s.code} விவரம்`)} onClick={() => setDetail(s.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <Sphere index={s.number - 1} size={30} />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">
                  {s.code} <span className="font-normal text-ink-2">· {s.name}</span>
                </div>
                <div className={cx("flex items-center gap-1 text-[12px]", at ? "text-ok" : "text-ink-3")}>
                  {at ? <Link2 size={12} /> : <Link2Off size={12} />}
                  {at ? L(`Link active since ${dt(at.slice(0, 10))}`, `${dt(at.slice(0, 10))} முதல் link செயலில்`) : L("No link yet", "இன்னும் link இல்லை")}
                  {s.aadhaarLast4 && (
                    <span className="ml-1 inline-flex items-center gap-0.5 text-ink-3">
                      · <IdCard size={11} /> {s.aadhaarLast4}
                    </span>
                  )}
                </div>
              </div>
              </button>
              {at ? (
                <>
                  <Button size="sm" icon={<RefreshCw size={14} />} disabled={pending} onClick={() => setAsk({ seat: s, kind: "new" })}>
                    <span className="hidden sm:inline">{L("New link", "புதிய link")}</span>
                  </Button>
                  <Button size="sm" variant="plain" aria-label={L("Stop link", "Link நிறுத்து")} disabled={pending} onClick={() => setAsk({ seat: s, kind: "revoke" })}>
                    <Link2Off size={15} />
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="gold" icon={<MessageCircle size={14} />} disabled={pending} onClick={() => issue(s)}>
                  {L("Send", "அனுப்பு")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <Portal><AnimatePresence>{detailSeat && <MemberSheet key={detailSeat.id} seat={detailSeat} running={d.chit.status === "active"} onClose={() => setDetail(null)} />}</AnimatePresence></Portal>

      <ConfirmDialog
        open={ask != null}
        tone={ask?.kind === "revoke" ? "danger" : "gold"}
        icon={<span className={cx("grid h-14 w-14 place-items-center rounded-full", ask?.kind === "revoke" ? "bg-danger text-white" : "gold-fill")}>{ask?.kind === "revoke" ? <Link2Off size={26} /> : <RefreshCw size={26} />}</span>}
        title={ask?.kind === "revoke" ? L(`Stop ${ask.seat.code}'s link?`, `${ask?.seat.code} link-ஐ நிறுத்தலாமா?`) : L(`Make a new link for ${ask?.seat.code ?? ""}?`, `${ask?.seat.code ?? ""}-க்கு புதிய link?`)}
        body={
          ask?.kind === "revoke"
            ? L("The member can't open the chit until you send a new link.", "புதிய link அனுப்பும் வரை உறுப்பினர் சீட்டைத் திறக்க முடியாது.")
            : L("The old link stops working right away. Use this if the phone was lost or the link was shared.", "பழைய link உடனே வேலை செய்யாது. Phone தொலைந்தால் அல்லது link பகிரப்பட்டால் இதைப் பயன்படுத்தவும்.")
        }
        yes={ask?.kind === "revoke" ? L("Yes, stop", "ஆம், நிறுத்து") : L("Yes, new link", "ஆம், புதிய link")}
        no={L("No", "இல்லை")}
        onNo={() => setAsk(null)}
        onYes={() => {
          const a = ask!;
          setAsk(null);
          if (a.kind === "new") return issue(a.seat);
          start(async () => {
            const r = await revokeLinkAction(a.seat.id);
            toast(r.ok ? L("Link stopped", "Link நிறுத்தப்பட்டது") : err((r as { error: string }).error), r.ok ? "ok" : "warn");
          });
        }}
      />

      <Portal><AnimatePresence>
        {sheet && (
          <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-[rgba(8,6,14,.55)] backdrop-blur-sm" onClick={() => setSheet(null)} />
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} className="card-solid relative w-full max-w-sm p-6">
              <button aria-label={L("Close", "மூடு")} onClick={() => setSheet(null)} className="absolute right-4 top-4 text-ink-3">
                <X size={18} />
              </button>
              <div className="flex items-center gap-3">
                <Sphere index={sheet.seat.number - 1} size={40} />
                <div>
                  <h3 className="font-display text-[19px] font-bold">{L(`Link for ${sheet.seat.code}`, `${sheet.seat.code}-க்கான link`)}</h3>
                  <div className="text-[13px] text-ink-2">{sheet.seat.name}</div>
                </div>
              </div>
              <p className="mt-3 text-[12.5px] text-ink-3">{L("This link is shown only now. Send it to the member's own phone.", "இந்த link இப்போது மட்டுமே காட்டப்படும். உறுப்பினரின் phone-க்கு அனுப்பவும்.")}</p>
              <div className="mt-3 break-all rounded-2xl border border-line-2 bg-[color-mix(in_oklab,var(--ink)_3%,transparent)] px-3 py-2.5 font-mono text-[12px]">{sheet.url}</div>
              <div className="mt-4 grid grid-cols-1 gap-2.5">
                <a
                  href={`https://wa.me/91${sheet.seat.phone}?text=${encodeURIComponent(message(sheet.seat, sheet.url))}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#1fa855] text-[15px] font-bold text-white shadow-[0_12px_26px_-14px_#1fa855]"
                >
                  <MessageCircle size={18} /> {L("Send on WhatsApp", "WhatsApp-ல் அனுப்பு")}
                </a>
                <Button
                  size="md"
                  icon={copied ? <Check size={16} /> : <Copy size={16} />}
                  onClick={() =>
                    void navigator.clipboard.writeText(sheet.url).then(
                      () => setCopied(true),
                      () => toast(L("Couldn't copy; select the link and copy it.", "Copy ஆகவில்லை; link-ஐ தேர்வு செய்து copy செய்யவும்."), "warn"),
                    )
                  }
                >
                  {copied ? L("Copied", "Copy ஆனது") : L("Copy link", "Link copy")}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence></Portal>
    </div>
  );
}
