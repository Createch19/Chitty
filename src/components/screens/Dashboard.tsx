"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, CalendarDays, FileSpreadsheet, Gavel, Plus, TrendingUp, Upload, UserPlus, Users, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Button, CountUp, Ring, cx } from "@/components/ui/kit";
import { chitA, organiser } from "@/lib/mock";
import { inr, lakh } from "@/lib/money";
import { useL, useLang } from "@/lib/prefs";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 260, damping: 26 } } };

export function Dashboard() {
  const L = useL();
  const [lang] = useLang();
  return (
    <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col gap-5">
      <motion.div variants={item} className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-ink-3">{L("Thursday, 10 December", "வியாழன், 10 டிசம்பர்")}</div>
          <h1 className="font-display mt-0.5 text-[28px] font-extrabold leading-tight sm:text-[32px]">
            {L("Vanakkam,", "வணக்கம்,")} <span className="gold-text">{lang === "ta" ? organiser.ownerTa : organiser.owner}</span> 🙏
          </h1>
        </div>
        <div className="flex gap-2">
          <Button icon={<Plus size={16} />} variant="gold">
            {L("New chit", "புதிய சீட்டு")}
          </Button>
        </div>
      </motion.div>

      {/* live hero */}
      <motion.div variants={item}>
        <Link href="/preview/room" className="theme-stage group relative block overflow-hidden rounded-[28px] border border-[rgba(255,211,77,.25)] bg-[radial-gradient(120%_120%_at_85%_10%,#3a2a6b_0%,#171230_45%,#0b0914_100%)] p-5 text-ink shadow-pop sm:p-7">
          <div aria-hidden className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(255,211,77,.35),transparent_65%)] blur-2xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="relative mx-auto grid h-36 w-36 shrink-0 place-items-center sm:mx-0">
              <span className="absolute inset-0 rounded-full border border-dashed border-[rgba(255,211,77,.5)] [animation:spin_14s_linear_infinite]" />
              <span className="absolute inset-3 rounded-full border border-[rgba(111,240,255,.35)] [animation:spin_9s_linear_infinite_reverse]" />
              <span className="gold-fill float-slow grid h-24 w-24 place-items-center rounded-full text-center shadow-[0_0_60px_rgba(255,211,77,.55),inset_-6px_-8px_14px_rgba(0,0,0,.25),inset_5px_5px_10px_rgba(255,255,255,.6)]">
                <span>
                  <span className="block text-[9px] font-bold tracking-wider text-[#6b4300]">{L("CURRENT", "தற்போது")}</span>
                  <span className="font-display block text-[17px] font-extrabold leading-tight">1.52L</span>
                </span>
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <Badge tone="live">
                <span className="live-dot" /> LIVE · {L("since 9:00 AM", "காலை 9:00 முதல்")}
              </Badge>
              <h2 className="font-display mt-2 text-[22px] font-extrabold leading-tight sm:text-[26px]">
                {L("Chit A · Month 2 auction", "சீட்டு A · 2-வது மாத ஏலம்")}
              </h2>
              <div className="mt-1 text-[14px] text-ink-2">
                {L("Highest bid", "அதிக ஏலம்")} <b className="text-gold-2">₹1,52,000</b> · A12 · {L("13 of 19 joined", "19-ல் 13 பேர் இணைந்தனர்")}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="btn-gold inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-[14.5px] font-bold">
                  <Gavel size={17} /> {L("Open the room", "அறையைத் திற")}
                </span>
                <span className="inline-flex h-11 items-center gap-2 rounded-2xl border border-line-2 px-4 text-[14px] font-semibold text-ink-2 group-hover:text-ink">
                  {L("Close in the evening", "மாலையில் முடிக்கவும்")} <ArrowRight size={16} />
                </span>
              </div>
            </div>
          </div>
        </Link>
      </motion.div>

      {/* KPIs */}
      <motion.div variants={item} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<TrendingUp size={17} />} label={L("Active chits", "நடப்பு சீட்டுகள்")}>
          <CountUp value={2} money={false} className="font-display text-[28px] font-extrabold" />
          <div className="text-[12px] text-ink-3">+1 {L("draft", "வரைவு")}</div>
        </Kpi>
        <Kpi icon={<Users size={17} />} label={L("Member IDs", "Member IDs")}>
          <CountUp value={35} money={false} className="font-display text-[28px] font-extrabold" />
          <div className="text-[12px] text-ink-3">{L("across 2 chits", "2 சீட்டுகளில்")}</div>
        </Kpi>
        <Kpi
          icon={<Wallet size={17} />}
          label={L("Collected this month", "இந்த மாத வசூல்")}
          aside={
            <Ring value={213000 / 355000} size={44} stroke={5}>
              <span className="text-[10px] font-bold">60%</span>
            </Ring>
          }
        >
          <CountUp value={213000} className="font-display gold-text-adaptive block text-[22px] font-extrabold leading-tight sm:text-[24px]" />
          <div className="text-[12px] text-ink-3">/ {inr(355000)} · 12/20</div>
        </Kpi>
        <Kpi icon={<CalendarDays size={17} />} label={L("Arrears", "பாக்கி")} tone="warn">
          <CountUp value={35500} className="font-display text-[24px] font-extrabold text-warn" />
          <div className="text-[12px] text-ink-3">{L("2 IDs · Chit B", "2 ID · சீட்டு B")}</div>
        </Kpi>
      </motion.div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* chits */}
        <motion.div variants={item} className="flex flex-col gap-3">
          <SectionTitle>{L("Your chits", "உங்கள் சீட்டுகள்")}</SectionTitle>
          <ChitCard
            href="/preview/chit"
            code="A"
            title={`${lakh(chitA.total)} · ${chitA.months} ${L("months", "மாதம்")}`}
            sub={L("Auction every 10th · 9:00 AM", "ஒவ்வொரு 10-ஆம் தேதி · காலை 9:00")}
            month={2}
            months={20}
            badge={
              <Badge tone="live">
                <span className="live-dot" /> {L("Auction live", "ஏலம் நடக்கிறது")}
              </Badge>
            }
          />
          <ChitCard
            href="/preview/collection"
            code="B"
            title={`3L · 15 ${L("months", "மாதம்")}`}
            sub={L("Auction every 3rd · 9:00 AM", "ஒவ்வொரு 3-ஆம் தேதி · காலை 9:00")}
            month={3}
            months={15}
            badge={<Badge tone="gold">{L("Collecting · 12/15 paid", "வசூல் · 12/15 கட்டியவர்")}</Badge>}
          />
          <ChitCard
            href="/preview/chit"
            code="C"
            title={`10L · 20 ${L("months", "மாதம்")}`}
            sub={L("Draft · 14 of 20 seats filled", "வரைவு · 20-ல் 14 இடம் நிரம்பியது")}
            month={0}
            months={20}
            seats={14 / 20}
            badge={<Badge>{L("Add 6 members to start", "தொடங்க இன்னும் 6 பேர்")}</Badge>}
          />
        </motion.div>

        <motion.div variants={item} className="flex flex-col gap-3">
          <SectionTitle>{L("Coming up", "வரவிருப்பவை")}</SectionTitle>
          <div className="card p-2">
            {[
              { d: "12", m: L("Dec", "டிச"), t: L("Chit B · 2 days to the last pay date", "சீட்டு B · கட்ட கடைசி நாளுக்கு 2 நாள்"), s: L("Reminder goes to 3 unpaid IDs", "கட்டாத 3 ID-க்கு நினைவூட்டல்"), tone: "warn" },
              { d: "20", m: L("Dec", "டிச"), t: L("Chit A · last day to pay month 2", "சீட்டு A · 2-வது மாதம் கட்ட கடைசி நாள்"), s: L("Payout after everyone pays", "அனைவரும் கட்டியதும் payout"), tone: "gold" },
              { d: "03", m: L("Jan", "ஜன"), t: L("Chit B · month 4 auction", "சீட்டு B · 4-வது மாத ஏலம்"), s: L("Opens automatically at 9:00 AM", "காலை 9:00-க்கு தானாக திறக்கும்"), tone: "plain" },
              { d: "10", m: L("Jan", "ஜன"), t: L("Chit A · month 3 auction", "சீட்டு A · 3-வது மாத ஏலம்"), s: L("Minimum ₹1,35,000", "குறைந்தபட்சம் ₹1,35,000"), tone: "plain" },
            ].map((e, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl px-3 py-3">
                <div className={cx("grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-center leading-none", e.tone === "warn" ? "bg-warn-soft text-warn" : e.tone === "gold" ? "gold-fill" : "bg-bg-2 text-ink-2")}>
                  <span>
                    <span className="font-display block text-[17px] font-extrabold">{e.d}</span>
                    <span className="block text-[10px] font-bold uppercase">{e.m}</span>
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold">{e.t}</div>
                  <div className="truncate text-[12.5px] text-ink-3">{e.s}</div>
                </div>
              </div>
            ))}
          </div>

          <div id="import" className="card p-4">
            <div className="flex items-center gap-2 text-[14px] font-bold">
              <FileSpreadsheet size={17} className="text-ok" /> {L("Running chits on paper?", "Paper-ல் நடக்கும் சீட்டுகள்?")}
            </div>
            <p className="mt-1 text-[13px] text-ink-2">{L("Download the Excel template, fill it in, upload it. The app continues from the next month.", "Excel template-ஐ download செய்து, நிரப்பி, upload செய்யுங்கள். அடுத்த மாதத்திலிருந்து app தொடரும்.")}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button size="sm" icon={<FileSpreadsheet size={15} />}>
                {L("Template", "Template")}
              </Button>
              <Button size="sm" icon={<Upload size={15} />}>
                {L("Upload", "Upload")}
              </Button>
            </div>
          </div>
          <Button icon={<UserPlus size={16} />}>{L("Add a member", "உறுப்பினர் சேர்")}</Button>
        </motion.div>
      </div>
    </motion.div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="font-display px-1 text-[16px] font-bold text-ink-2">{children}</h3>;
}

function Kpi({ icon, label, children, tone, aside }: { icon: ReactNode; label: string; children: ReactNode; tone?: "warn"; aside?: ReactNode }) {
  return (
    <motion.div whileHover={{ y: -3 }} className="card min-w-0 p-4">
      <div className={cx("flex items-start gap-2 text-[12.5px] font-semibold", tone === "warn" ? "text-warn" : "text-ink-3")}>
        <span className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-lg", tone === "warn" ? "bg-warn-soft" : "bg-[color-mix(in_oklab,var(--gold-2)_16%,transparent)] text-gold-ink")}>{icon}</span>
        <span className="min-w-0 flex-1 pt-1 leading-tight">{label}</span>
        {aside && <span className="-mr-1 -mt-1 shrink-0">{aside}</span>}
      </div>
      <div className="mt-2 min-w-0">{children}</div>
    </motion.div>
  );
}

function ChitCard({ href, code, title, sub, month, months, badge, seats }: { href: string; code: string; title: string; sub: string; month: number; months: number; badge: ReactNode; seats?: number }) {
  const L = useL();
  const pct = seats ?? month / months;
  return (
    <Link href={href} className="group">
      <motion.div whileHover={{ y: -3 }} className="card flex items-center gap-4 p-4">
        <div className="gold-fill font-display grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-[24px] font-extrabold shadow-[0_10px_24px_-12px_rgba(240,169,10,.8)]">{code}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[17px] font-bold">{title}</span>
            {badge}
          </div>
          <div className="mt-0.5 text-[12.5px] text-ink-3">{sub}</div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--ink)_8%,transparent)]">
            <motion.div className="shimmer-gold h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.max(4, pct * 100)}%` }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.3 }} />
          </div>
        </div>
        <div className="hidden text-right sm:block">
          <div className="font-display tabular text-[20px] font-extrabold">{seats != null ? `${Math.round(seats * 20)}/20` : `${month}/${months}`}</div>
          <div className="text-[11.5px] text-ink-3">{seats != null ? L("seats", "இடங்கள்") : L("month", "மாதம்")}</div>
        </div>
        <ArrowRight size={18} className="text-ink-3 transition-transform group-hover:translate-x-1" />
      </motion.div>
    </Link>
  );
}
