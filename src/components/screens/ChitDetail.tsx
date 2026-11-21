"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, Crown, Gavel, Link2, Percent, Timer, Trophy } from "lucide-react";
import { useState } from "react";
import { Badge, Ring, Segmented, Sphere, cx } from "@/components/ui/kit";
import { chitA, seatsA } from "@/lib/mock";
import { eachPays, inr, schedule } from "@/lib/money";
import { useL, useLang } from "@/lib/prefs";

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dateOf = (k: number) => {
  const m = (10 + k) % 12; // month 1 = Nov 2026
  const y = 2026 + Math.floor((10 + k) / 12);
  return `10 ${MONTHS_EN[m]} ${String(y).slice(2)}`;
};

export function ChitDetail() {
  const L = useL();
  const [lang] = useLang();
  const [tab, setTab] = useState<"schedule" | "members">("schedule");
  const rows = schedule(chitA);

  return (
    <div className="flex flex-col gap-5">
      {/* header */}
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="card relative overflow-hidden p-5 sm:p-6">
        <div aria-hidden className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,var(--aurora-1),transparent_65%)]" />
        <div className="relative flex flex-wrap items-center gap-5">
          <div className="gold-fill font-display grid h-20 w-20 place-items-center rounded-3xl text-[36px] font-extrabold shadow-[0_18px_40px_-16px_rgba(240,169,10,.9)]">A</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-[26px] font-extrabold leading-tight">{L("Chit A", "சீட்டு A")}</h1>
              <Badge tone="live">
                <span className="live-dot" /> {L("Month 2 auction live", "2-வது மாத ஏலம்")}
              </Badge>
            </div>
            <div className="font-display gold-text mt-1 text-[30px] font-extrabold leading-none">{inr(chitA.total)}</div>
            <div className="mt-3 flex flex-wrap gap-2 text-[12.5px]">
              <Fact icon={<CalendarDays size={14} />}>{L("20 months · from 10 Nov 2026", "20 மாதம் · 10 நவ 2026 முதல்")}</Fact>
              <Fact icon={<Percent size={14} />}>{L("1.5% a month = ₹7,500", "மாத வட்டி 1.5% = ₹7,500")}</Fact>
              <Fact icon={<Gavel size={14} />}>{L("Steps of ₹500", "₹500 படிகள்")}</Fact>
              <Fact icon={<Timer size={14} />}>{L("Opens 10th · 9:00 AM", "10-ஆம் தேதி · காலை 9:00")}</Fact>
            </div>
          </div>
          <Ring value={2 / 20} size={92} stroke={9}>
            <div className="text-center leading-none">
              <div className="font-display text-[22px] font-extrabold">2</div>
              <div className="text-[10.5px] text-ink-3">/ 20</div>
            </div>
          </Ring>
        </div>
      </motion.div>

      <div className="flex items-center justify-between">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "schedule", label: L("Schedule", "அட்டவணை") },
            { value: "members", label: L("Member IDs", "Member IDs") },
          ]}
        />
        <Link href="/preview/room" className="text-[13px] font-semibold text-gold-ink underline-offset-4 hover:underline">
          {L("Open live room →", "நேரடி அறை →")}
        </Link>
      </div>

      <AnimatePresence mode="wait">
        {tab === "schedule" ? (
          <motion.div key="s" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[.08em] text-ink-3">
                    <th className="px-4 py-3 font-semibold">{L("Month", "மாதம்")}</th>
                    <th className="px-3 py-3 font-semibold">{L("Date", "தேதி")}</th>
                    <th className="px-3 py-3 text-right font-semibold">{L("Minimum", "குறைந்தபட்சம்")}</th>
                    <th className="px-3 py-3 text-right font-semibold">{L("Final discount", "முடிந்த தள்ளு")}</th>
                    <th className="px-3 py-3 font-semibold">{L("Winner", "வென்றவர்")}</th>
                    <th className="px-3 py-3 text-right font-semibold">{L("Each pays", "ஒவ்வொருவரும்")}</th>
                    <th className="px-4 py-3 font-semibold">{L("Status", "நிலை")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const done = r.month === 1;
                    const live = r.month === 2;
                    return (
                      <motion.tr
                        key={r.month}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(i, 12) * 0.025 }}
                        className={cx("border-b border-line last:border-0", live && "bg-[color-mix(in_oklab,var(--gold-2)_10%,transparent)]")}
                      >
                        <td className="px-4 py-2.5 font-semibold">
                          {r.month}
                          <span className="text-ink-3">{lang === "ta" ? "-வது" : ""}</span>
                        </td>
                        <td className="px-3 py-2.5 text-ink-2">{dateOf(r.month - 1)}</td>
                        <td className="tabular px-3 py-2.5 text-right">{r.bidding ? inr(r.min) : <span className="text-ink-3">—</span>}</td>
                        <td className="tabular px-3 py-2.5 text-right font-semibold">{done ? <span className="text-ink-3">0</span> : live ? <span className="text-gold-ink">₹1,52,000…</span> : ""}</td>
                        <td className="px-3 py-2.5">
                          {done ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Crown size={13} className="text-gold-ink" /> A01 <span className="text-ink-3">({L("you", "நீங்கள்")})</span>
                            </span>
                          ) : r.month === 20 ? (
                            <span className="text-ink-3">{L("Last seat", "கடைசி இடம்")}</span>
                          ) : (
                            ""
                          )}
                        </td>
                        <td className="tabular px-3 py-2.5 text-right">{done ? inr(25000) : live ? <span className="text-ink-3">{inr(eachPays(chitA, 152000))}*</span> : <span className="text-ink-3">≤ {inr(r.pay)}</span>}</td>
                        <td className="px-4 py-2.5">
                          {done ? (
                            <Badge tone="ok">{L("Done", "முடிந்தது")}</Badge>
                          ) : live ? (
                            <Badge tone="live">
                              <span className="live-dot" /> LIVE
                            </Badge>
                          ) : (
                            <Badge>{L("Upcoming", "வரவிருக்கிறது")}</Badge>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line px-4 py-3 text-[12px] text-ink-3">
              {L("Minimum = ₹7,500 × (21 − month). Month 1 goes to the organiser, month 20 to the last seat. * at the current bid.", "குறைந்தபட்சம் = ₹7,500 × (21 − மாதம்). 1-வது மாதம் organiser-க்கு, 20-வது மாதம் கடைசி இடத்துக்கு. * தற்போதைய ஏலத்தில்.")}
            </div>
          </motion.div>
        ) : (
          <motion.div key="m" id="members" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {seatsA.map((s, i) => (
              <motion.div key={s.id} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.02 }} whileHover={{ y: -3 }} className="card flex items-center gap-3 p-3.5">
                <Sphere index={i} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[15px] font-bold">
                    {s.id} <span className="text-ink-3">·</span> {lang === "ta" ? s.nameTa : s.name}
                  </div>
                  <div className="tabular text-[12px] text-ink-3">{s.phone.replace(/(\d{2})\d{3}\s?(\d{3})(\d{2})/, "$1••• ••$3")}</div>
                </div>
                {s.organiser ? (
                  <Badge tone="gold">
                    <Trophy size={12} /> M1
                  </Badge>
                ) : i === 5 || i === 4 ? (
                  <Badge tone="violet">{L("2 seats", "2 இடம்")}</Badge>
                ) : null}
                <button aria-label={L("Share link", "Link பகிர்")} className="grid h-9 w-9 place-items-center rounded-xl text-ink-3 hover:bg-bg-2 hover:text-ink">
                  <Link2 size={17} />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Fact({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-[color-mix(in_oklab,var(--ink)_3%,transparent)] px-2.5 py-1 font-semibold text-ink-2">
      {icon}
      {children}
    </span>
  );
}
