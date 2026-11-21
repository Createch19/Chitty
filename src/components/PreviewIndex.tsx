"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight, Gavel, HandCoins, LayoutDashboard, ShieldCheck, Smartphone, Ticket } from "lucide-react";
import type { ReactNode } from "react";
import { LangToggle, Logo, ThemeToggle } from "@/components/brand";
import { cx } from "@/components/ui/kit";
import { useL } from "@/lib/prefs";

const grid = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } } };
const card = { hidden: { opacity: 0, y: 24, scale: 0.98 }, show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 240, damping: 24 } } };

export function PreviewIndex() {
  const L = useL();
  const screens: { href: string; icon: ReactNode; title: string; text: string; hero?: boolean; art: ReactNode }[] = [
    {
      href: "/preview/room",
      icon: <Gavel size={18} />,
      title: L("Live auction room", "நேரடி ஏல அறை"),
      text: L(
        "Electric bolts, gold orb, crown for the leader, the smart bid box, organiser close with Yes/No, lottery and the winner celebration. Try “Start bots”.",
        "மின்னல் bolt, தங்க orb, leader-க்கு கிரீடம், தானாக நிரம்பும் ஏல box, Yes/No-உடன் முடித்தல், குலுக்கல், வெற்றி கொண்டாட்டம். “Bots தொடங்கு” அழுத்திப் பாருங்கள்.",
      ),
      hero: true,
      art: <RoomArt />,
    },
    {
      href: "/preview/collection",
      icon: <HandCoins size={18} />,
      title: L("Collection & payout", "வசூல் & payout"),
      text: L("A glass bowl fills with coins as you tick Paid; the payout pours it to the winner.", "Paid tick செய்யும்போது கண்ணாடிப் பாத்திரம் நிரம்பும்; payout-ல் காசு வெற்றியாளருக்குப் பாயும்."),
      art: <BowlArt />,
    },
    {
      href: "/preview/dashboard",
      icon: <LayoutDashboard size={18} />,
      title: L("Organiser dashboard", "Organiser முகப்பு"),
      text: L("Live auction, money this month, arrears, your chits and what's coming up.", "நேரடி ஏலம், இந்த மாத வசூல், பாக்கி, உங்கள் சீட்டுகள், வரவிருப்பவை."),
      art: <TileArt kind="dash" />,
    },
    {
      href: "/preview/chit",
      icon: <Ticket size={18} />,
      title: L("Chit page", "சீட்டு பக்கம்"),
      text: L("The 20-month table like your PDF, and every member ID.", "உங்கள் PDF போல 20 மாத அட்டவணை, எல்லா member ID-களும்."),
      art: <TileArt kind="table" />,
    },
    {
      href: "/preview/member",
      icon: <Smartphone size={18} />,
      title: L("Member app", "Member app"),
      text: L("What a member sees on their phone: two IDs on one phone, dues, history, install.", "Member phone-ல் பார்ப்பது: ஒரே phone-ல் 2 ID, கட்ட வேண்டியது, வரலாறு, install."),
      art: <TileArt kind="phone" />,
    },
    {
      href: "/preview/admin",
      icon: <ShieldCheck size={18} />,
      title: L("Super Admin", "Super Admin"),
      text: L("Create, pause and reset organisers. Sees counts only, never their data.", "Organiser உருவாக்கு, நிறுத்து, reset. எண்ணிக்கை மட்டும், அவர்கள் data இல்லை."),
      art: <TileArt kind="admin" />,
    },
  ];

  return (
    <div className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-6">
      <div className="flex items-center justify-between gap-3">
        <Logo size={34} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link href="/login" className="btn-gold inline-flex h-9 items-center rounded-xl px-3 text-[13px] font-bold">
            {L("Organiser login", "Organiser login")}
          </Link>
          <Link href="/admin" className="btn-ghost inline-flex h-9 items-center rounded-xl px-3 text-[13px] font-semibold">
            Admin
          </Link>
          <LangToggle />
          <ThemeToggle />
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 200, damping: 24 }} className="mt-10 max-w-3xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-glass px-3 py-1 text-[12px] font-semibold text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-gold-3" /> {L("Phase 0 · design preview", "Phase 0 · design முன்னோட்டம்")}
        </div>
        <h1 className="font-display mt-4 text-[38px] font-extrabold leading-[1.08] tracking-tight sm:text-[54px]">
          {L("Chit funds,", "சீட்டு,")} <span className="gold-text">{L("made premium.", "இனி premium.")}</span>
        </h1>
        <p className="mt-4 max-w-2xl text-[15.5px] leading-relaxed text-ink-2">
          {L(
            "This is how Chitty will look and move. Every screen uses fake data and nothing is saved. Open each one, play with it, and tell me what to change before we build the real thing.",
            "Chitty இப்படித்தான் தோன்றும், அசையும். எல்லா screen-லும் போலி data, எதுவும் சேமிக்கப்படாது. ஒவ்வொன்றையும் திறந்து விளையாடிப் பாருங்கள்; உண்மை app கட்டுவதற்கு முன் என்ன மாற்ற வேண்டும் என்று சொல்லுங்கள்.",
          )}
        </p>
      </motion.div>

      <motion.div variants={grid} initial="hidden" animate="show" className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {screens.map((s) => (
          <motion.div key={s.href} variants={card} className={cx(s.hero && "md:col-span-2 lg:row-span-2")}>
            <Link href={s.href} className="group block h-full">
              <motion.div whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 400, damping: 28 }} className="card flex h-full flex-col overflow-hidden">
                <div className={cx("relative overflow-hidden", s.hero ? "h-64 sm:h-[360px]" : "h-40")}>{s.art}</div>
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--gold-2)_18%,transparent)] text-gold-ink">{s.icon}</span>
                    <h2 className={cx("font-display font-bold", s.hero ? "text-[21px]" : "text-[17px]")}>{s.title}</h2>
                    <ArrowUpRight size={18} className="ml-auto text-ink-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
                  </div>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{s.text}</p>
                </div>
              </motion.div>
            </Link>
          </motion.div>
        ))}
      </motion.div>

      <p className="mt-10 text-center text-[12.5px] text-ink-3">
        {L("Tip: switch EN / தமிழ் and light / dark at the top. The auction room is always the dark stage.", "குறிப்பு: மேலே EN / தமிழ், light / dark மாற்றலாம். ஏல அறை எப்போதும் dark stage.")}
      </p>
    </div>
  );
}

/* ---------- little illustrations for the cards ---------- */
function RoomArt() {
  const n = 14;
  return (
    <div className="theme-stage absolute inset-0 bg-[radial-gradient(80%_80%_at_50%_45%,#2a1f4a_0%,#140f26_55%,#07060d_100%)]">
      <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="raG" cx="35%" cy="28%" r="80%">
            <stop offset="0" stopColor="#fff6c2" />
            <stop offset=".35" stopColor="#ffd34d" />
            <stop offset=".75" stopColor="#e39a05" />
            <stop offset="1" stopColor="#8f5200" />
          </radialGradient>
        </defs>
        {Array.from({ length: n }, (_, i) => {
          const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
          const x = Math.round((200 + 120 * Math.cos(a)) * 10) / 10;
          const y = Math.round((150 + 105 * Math.sin(a)) * 10) / 10;
          const h = (i * 47 + 175) % 360;
          return (
            <g key={i}>
              <line x1={x} y1={y} x2={200} y2={150} stroke={i === 3 ? "#ffd34d" : "rgba(111,240,255,.35)"} strokeWidth={i === 3 ? 2.4 : 1.4} strokeDasharray={i === 3 ? "6 5" : "2 8"} className="[animation:flow_1.2s_linear_infinite]" />
              <circle cx={x} cy={y} r={12} fill={`hsl(${h} 70% 52%)`} />
              <circle cx={x - 3.5} cy={y - 4} r={4} fill="rgba(255,255,255,.55)" />
            </g>
          );
        })}
        <circle cx={200} cy={150} r={56} fill="rgba(255,200,60,.18)" className="[animation:glowp_2.4s_ease-in-out_infinite]" />
        <circle cx={200} cy={150} r={46} fill="url(#raG)" />
        <text x={200} y={146} textAnchor="middle" fontSize="8" fontWeight="700" fill="#6b4300">
          CURRENT BID
        </text>
        <text x={200} y={164} textAnchor="middle" fontSize="15" fontWeight="800" fill="#3a2300">
          ₹1,52,000
        </text>
        <path d="M 252 63 L 240 85 L 248 92 L 230 118" fill="none" stroke="#6ff0ff" strokeWidth={6} opacity={0.45} strokeLinecap="round" />
        <path d="M 252 63 L 240 85 L 248 92 L 230 118" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
      </svg>
    </div>
  );
}

function BowlArt() {
  return (
    <div className="absolute inset-0 bg-[radial-gradient(70%_80%_at_50%_70%,var(--aurora-1),transparent_70%)]">
      <svg viewBox="0 0 300 160" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="baM" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe17a" />
            <stop offset="1" stopColor="#b06c00" />
          </linearGradient>
          <linearGradient id="baR" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8f5200" />
            <stop offset=".35" stopColor="#ffe58a" />
            <stop offset=".7" stopColor="#f0a90a" />
            <stop offset="1" stopColor="#8f5200" />
          </linearGradient>
          <clipPath id="baC">
            <path d="M80 62 A70 80 0 0 0 220 62 Z" />
          </clipPath>
        </defs>
        <g clipPath="url(#baC)">
          <rect x={80} y={84} width={140} height={80} fill="url(#baM)" />
          <ellipse cx={150} cy={84} rx={66} ry={12} fill="#ffd34d" />
        </g>
        <path d="M80 62 A70 80 0 0 0 220 62" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.35)" />
        <ellipse cx={150} cy={62} rx={70} ry={14} fill="none" stroke="url(#baR)" strokeWidth={4} />
        <g className="float-slow">
          <circle cx={150} cy={26} r={11} fill="#ffd34d" stroke="#9a5d00" />
          <text x={150} y={30.5} textAnchor="middle" fontSize="11" fontWeight="800" fill="#7a4a00">
            ₹
          </text>
        </g>
      </svg>
    </div>
  );
}

function TileArt({ kind }: { kind: "dash" | "table" | "phone" | "admin" }) {
  return (
    <div className="absolute inset-0 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--gold-2)_14%,transparent),transparent_60%)] p-5">
      {kind === "dash" && (
        <div className="grid h-full grid-cols-3 gap-2">
          <div className="col-span-3 rounded-xl bg-[linear-gradient(120deg,#2a1f4a,#0f0b1d)]" />
          {[0.6, 0.35, 0.8].map((v, i) => (
            <div key={i} className="flex flex-col justify-end rounded-xl border border-line bg-glass p-2">
              <div className="h-1.5 rounded-full bg-[color-mix(in_oklab,var(--ink)_10%,transparent)]">
                <div className="shimmer-gold h-full rounded-full" style={{ width: `${v * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {kind === "table" && (
        <div className="flex h-full flex-col gap-1.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={cx("flex items-center gap-2 rounded-lg px-2 py-1", i === 1 && "bg-[color-mix(in_oklab,var(--gold-2)_22%,transparent)]")}>
              <span className="text-[10px] font-bold text-ink-3">{i + 1}</span>
              <span className="h-1.5 flex-1 rounded-full bg-[color-mix(in_oklab,var(--ink)_10%,transparent)]" />
              <span className="tabular text-[10px] font-bold text-ink-2">{i === 0 ? "—" : `₹${(142500 - (i - 1) * 7500).toLocaleString("en-IN")}`}</span>
            </div>
          ))}
        </div>
      )}
      {kind === "phone" && (
        <div className="mx-auto h-full w-24 rounded-[18px] border-2 border-line-2 bg-glass p-1.5">
          <div className="h-10 rounded-xl bg-[linear-gradient(120deg,#3d2c70,#0a0813)]" />
          <div className="mt-1.5 h-6 rounded-lg bg-[color-mix(in_oklab,var(--ink)_8%,transparent)]" />
          <div className="gold-fill mt-1.5 h-5 rounded-lg" />
        </div>
      )}
      {kind === "admin" && (
        <div className="flex h-full flex-col justify-center gap-2">
          {[1, 0, 1].map((on, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl border border-line bg-glass px-2.5 py-1.5">
              <span className={cx("h-5 w-5 rounded-md", on ? "gold-fill" : "bg-bg-2")} />
              <span className="h-1.5 flex-1 rounded-full bg-[color-mix(in_oklab,var(--ink)_10%,transparent)]" />
              <span className={cx("h-4 w-7 rounded-full", on ? "bg-ok" : "bg-bg-2")} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
