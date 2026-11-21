"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, CalendarDays, Plus, TrendingUp, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, CountUp, Ring, cx } from "@/components/ui/kit";
import { formatINR } from "@/domain/money";
import { useL } from "@/lib/prefs";
import { useDateText } from "./common";

export type ChitCardData = {
  id: string;
  code: string;
  status: string;
  totalPaise: number;
  months: number;
  seats: number;
  current: { id: string; month: number; status: string; auctionDate: string } | null;
  next: { id: string; month: number; auctionDate: string } | null;
  collection: { paid: number; total: number; payPaise: number; payoutDone: boolean } | null;
};

const lakh = (p: number) => {
  const r = p / 100;
  return r >= 100000 ? `₹${(r / 100000).toFixed(r % 100000 ? 2 : 0).replace(/\.?0+$/, "")}L` : formatINR(p);
};

export function Home({ ownerName, stats, chits }: { ownerName: string; stats: { activeChits: number; draftChits: number; memberIds: number; arrearsPaise: number; arrearsIds: number }; chits: ChitCardData[] }) {
  const L = useL();
  const dt = useDateText();
  return (
    <div className="flex flex-col gap-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-[28px] font-extrabold leading-tight sm:text-[34px]">
          {L("Vanakkam,", "வணக்கம்,")} <span className="gold-text">{ownerName}</span> 🙏
        </h1>
        <Link href="/app/chits/new" className="btn-gold inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-[14.5px] font-bold">
          <Plus size={16} /> {L("New chit", "புதிய சீட்டு")}
        </Link>
      </motion.div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi icon={<TrendingUp size={17} />} label={L("Active chits", "நடப்பு சீட்டுகள்")}>
          <CountUp value={stats.activeChits} money={false} className="font-display block text-[28px] font-extrabold" />
          <div className="text-[12px] text-ink-3">{stats.draftChits ? L(`+${stats.draftChits} draft`, `+${stats.draftChits} வரைவு`) : " "}</div>
        </Kpi>
        <Kpi icon={<Users size={17} />} label={L("Member IDs", "Member IDs")}>
          <CountUp value={stats.memberIds} money={false} className="font-display block text-[28px] font-extrabold" />
          <div className="text-[12px] text-ink-3">{L("in active chits", "நடப்பு சீட்டுகளில்")}</div>
        </Kpi>
        <Kpi icon={<CalendarDays size={17} />} label={L("Arrears (past last day)", "பாக்கி (கடைசி நாள் கடந்தது)")} warn={stats.arrearsPaise > 0} className="col-span-2 lg:col-span-1">
          <CountUp value={stats.arrearsPaise / 100} className={cx("font-display block text-[24px] font-extrabold", stats.arrearsPaise > 0 ? "text-warn" : "")} />
          <div className="text-[12px] text-ink-3">{L(`${stats.arrearsIds} IDs`, `${stats.arrearsIds} ID`)}</div>
        </Kpi>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-display px-1 text-[16px] font-bold text-ink-2">{L("Your chits", "உங்கள் சீட்டுகள்")}</h2>
        {chits.length === 0 ? (
          <div className="theme-stage relative overflow-hidden rounded-[28px] border border-[rgba(255,211,77,.25)] bg-[radial-gradient(120%_120%_at_85%_10%,#3a2a6b_0%,#171230_45%,#0b0914_100%)] p-7 text-ink shadow-pop">
            <div aria-hidden className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(255,211,77,.35),transparent_65%)] blur-2xl" />
            <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <span className="gold-fill float-slow grid h-20 w-20 shrink-0 place-items-center rounded-full text-[32px] font-extrabold">₹</span>
              <div className="flex-1">
                <h3 className="font-display text-[22px] font-extrabold">{L("Create your first chit", "உங்கள் முதல் சீட்டை உருவாக்குங்கள்")}</h3>
                <p className="mt-1 text-[14px] text-ink-2">{L("Set the value and months; the discount table is worked out for you.", "தொகையும் மாதங்களும் போதும்; தள்ளு அட்டவணையை app கணக்கிடும்.")}</p>
              </div>
              <Link href="/app/chits/new" className="btn-gold inline-flex h-12 items-center gap-2 rounded-2xl px-5 font-bold">
                <Plus size={17} /> {L("New chit", "புதிய சீட்டு")}
              </Link>
            </div>
          </div>
        ) : (
          chits.map((c, i) => {
            const live = c.current?.status === "open";
            const progress = c.status === "draft" ? c.seats / c.months : c.current ? c.current.month / c.months : 0;
            let badge: ReactNode;
            let sub: string;
            if (c.status === "draft") {
              badge = <Badge>{L("Draft", "வரைவு")}</Badge>;
              sub = L(`${c.seats} of ${c.months} seats filled`, `${c.months}-ல் ${c.seats} இடம் நிரம்பியது`);
            } else if (c.status === "completed") {
              badge = <Badge tone="ok">{L("Completed", "முடிந்தது")}</Badge>;
              sub = L("All months done", "எல்லா மாதங்களும் முடிந்தன");
            } else if (live) {
              badge = (
                <Badge tone="live">
                  <span className="live-dot" /> {L("Auction live", "ஏலம் நடக்கிறது")}
                </Badge>
              );
              sub = L(`Month ${c.current!.month} auction is open`, `${c.current!.month}-வது மாத ஏலம் திறந்துள்ளது`);
            } else if (c.collection && !c.collection.payoutDone) {
              badge = <Badge tone="gold">{L(`Collecting · ${c.collection.paid}/${c.collection.total}`, `வசூல் · ${c.collection.paid}/${c.collection.total}`)}</Badge>;
              sub = L(`Month ${c.current!.month}: ${formatINR(c.collection.payPaise)} each`, `${c.current!.month}-வது மாதம்: ஒவ்வொருவரும் ${formatINR(c.collection.payPaise)}`);
            } else {
              badge = <Badge>{L("Waiting", "காத்திருப்பு")}</Badge>;
              sub = c.next ? L(`Next auction ${dt(c.next.auctionDate)}`, `அடுத்த ஏலம் ${dt(c.next.auctionDate)}`) : "";
            }
            const href = live || (c.collection && !c.collection.payoutDone) ? `/app/chits/${c.id}/months/${c.current!.id}` : `/app/chits/${c.id}`;
            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Link href={href} className="group">
                  <motion.div whileHover={{ y: -3 }} className="card flex items-center gap-4 p-4">
                    <div className="gold-fill font-display grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-[22px] font-extrabold shadow-[0_10px_24px_-12px_rgba(240,169,10,.8)]">{c.code}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-[17px] font-bold">
                          {lakh(c.totalPaise)} · {c.months} {L("months", "மாதம்")}
                        </span>
                        {badge}
                      </div>
                      <div className="mt-0.5 truncate text-[12.5px] text-ink-3">{sub}</div>
                      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--ink)_8%,transparent)]">
                        <motion.div className="shimmer-gold h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.max(4, progress * 100)}%` }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }} />
                      </div>
                    </div>
                    <div className="hidden sm:block">
                      <Ring value={progress} size={52} stroke={6}>
                        <span className="text-[11px] font-bold">{c.status === "draft" ? `${c.seats}/${c.months}` : `${c.current?.month ?? 0}/${c.months}`}</span>
                      </Ring>
                    </div>
                    <ArrowRight size={18} className="text-ink-3 transition-transform group-hover:translate-x-1" />
                  </motion.div>
                </Link>
              </motion.div>
            );
          })
        )}
      </section>
    </div>
  );
}

function Kpi({ icon, label, children, warn, className }: { icon: ReactNode; label: string; children: ReactNode; warn?: boolean; className?: string }) {
  return (
    <motion.div whileHover={{ y: -3 }} className={cx("card min-w-0 p-4", className)}>
      <div className={cx("flex items-start gap-2 text-[12.5px] font-semibold", warn ? "text-warn" : "text-ink-3")}>
        <span className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-lg", warn ? "bg-warn-soft" : "bg-[color-mix(in_oklab,var(--gold-2)_16%,transparent)] text-gold-ink")}>{icon}</span>
        <span className="min-w-0 pt-1 leading-tight">{label}</span>
      </div>
      <div className="mt-2 min-w-0">{children}</div>
    </motion.div>
  );
}
