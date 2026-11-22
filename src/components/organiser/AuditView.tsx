"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRightLeft, BadgeCheck, CalendarClock, Crown, Dices, Eye, FileUp, Gavel, HandCoins, IdCard, KeyRound, Link2, Link2Off, Pencil, Play, Rocket, ShieldCheck, Trash2, Undo2, UserCog, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/components/ui/kit";
import { formatINR } from "@/domain/money";
import { useL } from "@/lib/prefs";
import type { listAudit, AuditGroup } from "@/server/audit-view";

type Data = Awaited<ReturnType<typeof listAudit>>;

/** Read-only history of everything that changed money, auctions or member details (BUSINESS-CONCEPT §9–§10). */
export function AuditView({ group, before, data }: { group: AuditGroup; before?: number; data: Data }) {
  const L = useL();
  const seat = (id: unknown) => (typeof id === "string" ? (data.names.seats[id] ?? "?") : "?");
  const mon = (id: unknown) => {
    const m = typeof id === "string" ? data.names.months[id] : undefined;
    return m ? L(`chit ${m.chit} · month ${m.month}`, `சீட்டு ${m.chit} · ${m.month}-வது மாதம்`) : "";
  };
  const money = (v: unknown) => (typeof v === "number" ? formatINR(v) : "");

  const describe = (r: Data["rows"][number]): { icon: ReactNode; tone?: string; text: string } => {
    const d = r.details;
    switch (r.action) {
      case "payment.paid":
        return { icon: <BadgeCheck size={16} />, tone: "ok", text: L(`Marked ${seat(d.seatId)} paid · ${mon(d.monthId)}`, `${seat(d.seatId)} கட்டியது · ${mon(d.monthId)}`) };
      case "payment.unpaid":
        return { icon: <Undo2 size={16} />, tone: "warn", text: L(`Unticked ${seat(d.seatId)} (correction) · ${mon(d.monthId)}`, `${seat(d.seatId)} திருத்தம் (கட்டவில்லை) · ${mon(d.monthId)}`) };
      case "payout.done":
        return { icon: <HandCoins size={16} />, tone: "ok", text: L(`Payout to ${seat(d.winnerSeatId)}: prize ${money(d.prizePaise)}, cash ${money(d.cashPaise)} · ${mon(d.monthId)}`, `${seat(d.winnerSeatId)}-க்கு payout: ${money(d.prizePaise)}, கையில் ${money(d.cashPaise)} · ${mon(d.monthId)}`) };
      case "payout.undo":
        return { icon: <Undo2 size={16} />, tone: "warn", text: L(`Payout undone · ${mon(d.monthId)}`, `Payout திருத்தப்பட்டது · ${mon(d.monthId)}`) };
      case "month.open":
        return { icon: <Play size={16} />, text: L(`Auction opened${r.actor === "system" ? " automatically" : ""} · ${mon(d.monthId)}`, `ஏலம் திறக்கப்பட்டது${r.actor === "system" ? " (தானாக)" : ""} · ${mon(d.monthId)}`) };
      case "month.close":
        return { icon: d.lottery ? <Dices size={16} /> : <Crown size={16} />, tone: "gold", text: L(`Closed: ${seat(d.winnerSeatId)} won at ${money(d.discountPaise)}${d.lottery ? " (lottery)" : ""} · ${mon(d.monthId)}`, `முடிந்தது: ${seat(d.winnerSeatId)} ${money(d.discountPaise)}-ல் வென்றார்${d.lottery ? " (குலுக்கல்)" : ""} · ${mon(d.monthId)}`) };
      case "month.lottery":
        return { icon: <Dices size={16} />, text: L(`Lottery drawn among ${Array.isArray(d.pool) ? d.pool.length : "?"} IDs · ${mon(d.monthId)}`, `${Array.isArray(d.pool) ? d.pool.length : "?"} ID-களில் குலுக்கல் · ${mon(d.monthId)}`) };
      case "month.date_change":
        return { icon: <CalendarClock size={16} />, text: L(`Auction date ${d.from} → ${d.to} · ${mon(d.monthId)}`, `ஏல தேதி ${d.from} → ${d.to} · ${mon(d.monthId)}`) };
      case "bid.place":
        return { icon: <Gavel size={16} />, text: L(`Bid ${money(d.amountPaise)} by ${seat(d.seatId)} · ${mon(d.monthId)}`, `${seat(d.seatId)} ஏலம் ${money(d.amountPaise)} · ${mon(d.monthId)}`) };
      case "bid.reject":
        return { icon: <XCircle size={16} />, text: L(`Bid refused (${String(d.code ?? "")}) for ${seat(d.seatId)} · ${mon(d.monthId)}`, `ஏலம் மறுக்கப்பட்டது (${String(d.code ?? "")}) ${seat(d.seatId)} · ${mon(d.monthId)}`) };
      case "seat.aadhaar_show":
        return { icon: <Eye size={16} />, tone: "violet", text: L(`Aadhaar shown for ${seat(d.seatId)} (XXXX ${d.last4})`, `${seat(d.seatId)} Aadhaar பார்க்கப்பட்டது (XXXX ${d.last4})`) };
      case "seat.aadhaar_set":
        return { icon: <IdCard size={16} />, text: L(`Aadhaar saved for ${seat(d.seatId)} (XXXX ${d.last4})`, `${seat(d.seatId)} Aadhaar சேமிக்கப்பட்டது (XXXX ${d.last4})`) };
      case "seat.aadhaar_clear":
        return { icon: <IdCard size={16} />, text: L(`Aadhaar removed for ${seat(d.seatId)}`, `${seat(d.seatId)} Aadhaar நீக்கப்பட்டது`) };
      case "seat.transfer": {
        const f = d.from as { name?: string } | undefined;
        const t = d.to as { name?: string } | undefined;
        return { icon: <ArrowRightLeft size={16} />, tone: "gold", text: L(`${seat(d.seatId).split(" · ")[0]} transferred: ${f?.name} → ${t?.name}`, `${seat(d.seatId).split(" · ")[0]} மாற்றம்: ${f?.name} → ${t?.name}`) };
      }
      case "link.create":
      case "link.regenerate":
        return { icon: <Link2 size={16} />, text: L(`${r.action === "link.create" ? "Link made" : "New link (old one stopped)"} for ${seat(d.seatId)}`, `${seat(d.seatId)}-க்கு ${r.action === "link.create" ? "link" : "புதிய link (பழையது நின்றது)"}`) };
      case "link.revoke":
        return { icon: <Link2Off size={16} />, tone: "warn", text: L(`Link stopped for ${seat(d.seatId)}`, `${seat(d.seatId)} link நிறுத்தப்பட்டது`) };
      case "chit.create":
        return { icon: <Rocket size={16} />, text: L(`Chit created`, `சீட்டு உருவாக்கப்பட்டது`) };
      case "chit.edit": {
        const to = d.to as { code?: string } | undefined;
        const from = d.from as { code?: string } | undefined;
        return { icon: <Pencil size={16} />, text: L(`Chit ${from?.code ?? ""} edited before start${to?.code && to.code !== from?.code ? ` (now ${to.code})` : ""}`, `சீட்டு ${from?.code ?? ""} தொடங்கும் முன் மாற்றப்பட்டது${to?.code && to.code !== from?.code ? ` (இப்போது ${to.code})` : ""}`) };
      }
      case "chit.delete":
        return { icon: <Trash2 size={16} />, tone: "warn", text: L(`Chit ${d.code} deleted before start (${d.seats} member IDs)`, `சீட்டு ${d.code} தொடங்கும் முன் நீக்கப்பட்டது (${d.seats} member IDs)`) };
      case "chit.start":
        return { icon: <Rocket size={16} />, tone: "gold", text: L(`Chit ${data.names.chits[String(d.chitId)] ?? ""} started on ${d.startDate}`, `சீட்டு ${data.names.chits[String(d.chitId)] ?? ""} ${d.startDate}-ல் தொடங்கியது`) };
      case "chit.import":
        return { icon: <FileUp size={16} />, tone: "gold", text: L(`Chit ${d.code} imported from paper (${d.monthsImported} months)`, `சீட்டு ${d.code} paper-ல் இருந்து import (${d.monthsImported} மாதம்)`) };
      case "organiser.password_change":
      case "organiser.password_reset":
        return { icon: <KeyRound size={16} />, text: L(r.action === "organiser.password_change" ? "You changed your password" : "Password reset by the admin", r.action === "organiser.password_change" ? "Password மாற்றினீர்கள்" : "Admin password reset செய்தார்") };
      default:
        return { icon: r.action.startsWith("organiser.") ? <UserCog size={16} /> : <ShieldCheck size={16} />, text: r.action };
    }
  };

  const tones: Record<string, string> = {
    ok: "bg-[color-mix(in_oklab,var(--ok)_16%,transparent)] text-ok",
    warn: "bg-[color-mix(in_oklab,var(--warn)_16%,transparent)] text-warn",
    gold: "bg-[color-mix(in_oklab,var(--gold-2)_18%,transparent)] text-gold-ink",
    violet: "bg-[color-mix(in_oklab,var(--violet,#8b5cf6)_16%,transparent)] text-[var(--violet,#8b5cf6)]",
  };
  const groups: { g: AuditGroup; en: string; ta: string }[] = [
    { g: "all", en: "All", ta: "அனைத்தும்" },
    { g: "money", en: "Payments", ta: "கட்டணம்" },
    { g: "auction", en: "Auctions", ta: "ஏலம்" },
    { g: "members", en: "Members & links", ta: "உறுப்பினர்கள்" },
    { g: "aadhaar", en: "Aadhaar", ta: "Aadhaar" },
  ];
  const day = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
  const time = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(iso));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-[26px] font-extrabold">{L("Audit log", "Audit log")}</h1>
        <p className="mt-1 text-[14px] text-ink-2">{L("Every change is recorded here and can't be edited or deleted.", "ஒவ்வொரு மாற்றமும் இங்கே பதிவாகிறது; திருத்தவோ நீக்கவோ முடியாது.")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {groups.map((x) => (
          <Link key={x.g} href={x.g === "all" ? "/app/audit" : `/app/audit?group=${x.g}`} className={cx("inline-flex h-9 items-center rounded-xl px-3 text-[13px] font-semibold", group === x.g ? "gold-fill" : "btn-ghost")}>
            {L(x.en, x.ta)}
          </Link>
        ))}
      </div>
      <div className="card p-2 sm:p-3">
        {data.rows.length === 0 && <div className="p-8 text-center text-[14px] text-ink-3">{L("Nothing here yet.", "இன்னும் எதுவும் இல்லை.")}</div>}
        <ul>
          {data.rows.map((r, i) => {
            const x = describe(r);
            const dd = day(r.at);
            const head = i === 0 || day(data.rows[i - 1].at) !== dd;
            return (
              <li key={r.id}>
                {head && <div className="px-3 pb-1 pt-3 text-[11.5px] font-semibold uppercase tracking-[.12em] text-ink-3">{dd}</div>}
                <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 20) * 0.015 }} className="flex items-start gap-3 rounded-2xl px-3 py-2 hover:bg-[color-mix(in_oklab,var(--ink)_4%,transparent)]">
                  <span className={cx("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl", x.tone ? tones[x.tone] : "bg-[color-mix(in_oklab,var(--ink)_6%,transparent)] text-ink-2")}>{x.icon}</span>
                  <div className="min-w-0 flex-1 text-[13.5px]">{x.text}</div>
                  <div className="shrink-0 text-right text-[11.5px] text-ink-3">
                    {time(r.at)}
                    <div>{r.actor === "system" ? L("auto", "தானாக") : r.actor === "member" ? L("member", "உறுப்பினர்") : r.actor === "admin" ? "admin" : ""}</div>
                  </div>
                </motion.div>
              </li>
            );
          })}
        </ul>
        {(data.more || before) && (
          <div className="flex justify-center gap-2 p-3">
            {before && (
              <Link href={group === "all" ? "/app/audit" : `/app/audit?group=${group}`} className="btn-ghost inline-flex h-9 items-center rounded-xl px-3 text-[13px] font-semibold">
                {L("Newest", "புதியவை")}
              </Link>
            )}
            {data.more && (
              <Link href={`/app/audit?${new URLSearchParams({ ...(group !== "all" ? { group } : {}), before: String(data.rows[data.rows.length - 1].id) })}`} className="btn-ghost inline-flex h-9 items-center rounded-xl px-3 text-[13px] font-semibold">
                {L("Older", "பழையவை")}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
