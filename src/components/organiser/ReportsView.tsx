"use client";

import { motion } from "motion/react";
import { AlertTriangle, BookUser, Download, LayoutList, Printer, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Button, cx } from "@/components/ui/kit";
import { formatINR } from "@/domain/money";
import { useL, useLang } from "@/lib/prefs";
import type { ReportQuery } from "@/server/report-load";
import type { Cell, Report, ReportKind } from "@/server/reports";
import { useDateText } from "./common";

type Choices = { id: string; code: string; status: string; months: { id: string; month: number }[]; seats: { id: string; code: string; name: string }[] }[];

const KINDS: { kind: ReportKind; en: string; ta: string; icon: ReactNode }[] = [
  { kind: "arrears", en: "Arrears", ta: "பாக்கி", icon: <AlertTriangle size={15} /> },
  { kind: "collection", en: "Month collection", ta: "மாத வசூல்", icon: <Wallet size={15} /> },
  { kind: "summary", en: "Chit summary", ta: "சீட்டு சுருக்கம்", icon: <LayoutList size={15} /> },
  { kind: "ledger", en: "Member ledger", ta: "உறுப்பினர் கணக்கு", icon: <BookUser size={15} /> },
];

const STATUS: Record<string, [string, string, string]> = {
  paid: ["Paid", "கட்டியது", "text-ok"],
  unpaid: ["Not paid", "கட்டவில்லை", "text-warn"],
  adjusted: ["Adjusted at payout", "Payout-ல் கழிவு", "text-ok"],
  "at-payout": ["At payout", "Payout-ல் கழிக்கப்படும்", "text-ink-3"],
  "paid out": ["Paid out", "Payout முடிந்தது", "text-ok"],
  collecting: ["Collecting", "வசூல்", "text-gold-ink"],
  open: ["Live", "நடக்கிறது", "text-danger"],
  pending: ["Upcoming", "வரவிருக்கிறது", "text-ink-3"],
  late: ["Late", "தாமதம்", "text-danger"],
  "not-due": ["Not due yet", "கெடு உள்ளது", "text-ink-3"],
};

export function ReportsView({ q, choices, report, business }: { q: ReportQuery; choices: Choices; report: Report | null; business: string }) {
  const L = useL();
  const [lang] = useLang();
  const dt = useDateText();
  const router = useRouter();
  const chit = choices.find((c) => c.id === q.chit) ?? choices.find((c) => c.months.some((m) => m.id === q.month) || c.seats.some((s) => s.id === q.seat));
  const go = (next: Partial<ReportQuery>) => {
    const p = new URLSearchParams();
    const m = { ...q, ...next };
    p.set("kind", m.kind);
    for (const k of ["chit", "month", "seat"] as const) if (m[k]) p.set(k, m[k]!);
    router.push(`/app/reports?${p}`, { scroll: false });
  };
  const csv = () => {
    const p = new URLSearchParams({ kind: q.kind, lang });
    for (const k of ["chit", "month", "seat"] as const) if (q[k]) p.set(k, q[k]!);
    return `/api/org/reports?${p}`;
  };
  const cell = (key: string, money: boolean | undefined, v: Cell) => {
    if (v == null || v === "") return <span className="text-ink-3">—</span>;
    if (money && typeof v === "number") return formatINR(v);
    if (key === "status" && typeof v === "string" && STATUS[v]) return <span className={cx("font-semibold", STATUS[v][2])}>{lang === "ta" ? STATUS[v][1] : STATUS[v][0]}</span>;
    if ((key === "date" || key === "lastDay") && typeof v === "string") return dt(v);
    return v;
  };

  const select = "h-10 min-w-0 rounded-xl border border-line-2 bg-[color-mix(in_oklab,var(--ink)_3%,transparent)] px-3 text-[13.5px] outline-none focus:border-gold-3";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <h1 className="font-display text-[26px] font-extrabold">{L("Reports", "அறிக்கைகள்")}</h1>
        {report && (
          <div className="flex gap-2">
            <a href={csv()} className="btn-ghost inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold">
              <Download size={14} /> CSV
            </a>
            <Button size="sm" variant="gold" icon={<Printer size={14} />} onClick={() => window.print()}>
              {L("Print / PDF", "Print / PDF")}
            </Button>
          </div>
        )}
      </div>

      <div className="card flex flex-col gap-3 p-4 print:hidden">
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button key={k.kind} onClick={() => go({ kind: k.kind })} className={cx("inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold", q.kind === k.kind ? "gold-fill" : "btn-ghost")}>
              {k.icon} {lang === "ta" ? k.ta : k.en}
            </button>
          ))}
        </div>
        {q.kind !== "arrears" && (
          <div className="flex flex-wrap gap-2">
            <select aria-label={L("Chit", "சீட்டு")} className={select} value={chit?.id ?? ""} onChange={(e) => go({ chit: e.target.value || undefined, month: undefined, seat: undefined })}>
              <option value="">{L("Pick a chit", "சீட்டைத் தேர்வு செய்")}</option>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {L(`Chit ${c.code}`, `சீட்டு ${c.code}`)}
                </option>
              ))}
            </select>
            {q.kind === "collection" && chit && (
              <select aria-label={L("Month", "மாதம்")} className={select} value={q.month ?? ""} onChange={(e) => go({ chit: chit.id, month: e.target.value || undefined })}>
                <option value="">{chit.months.length ? L("Pick a month", "மாதம் தேர்வு செய்") : L("No closed month yet", "முடிந்த மாதம் இல்லை")}</option>
                {chit.months.map((m) => (
                  <option key={m.id} value={m.id}>
                    {L(`Month ${m.month}`, `${m.month}-வது மாதம்`)}
                  </option>
                ))}
              </select>
            )}
            {q.kind === "ledger" && chit && (
              <select aria-label="ID" className={select} value={q.seat ?? ""} onChange={(e) => go({ chit: chit.id, seat: e.target.value || undefined })}>
                <option value="">{L("Pick a member ID", "Member ID தேர்வு செய்")}</option>
                {chit.seats.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {!report ? (
        <div className="card p-8 text-center text-[14px] text-ink-3 print:hidden">{L("Pick what to show above.", "மேலே எதைக் காட்ட வேண்டும் என்று தேர்வு செய்யவும்.")}</div>
      ) : (
        <motion.div key={JSON.stringify(q)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden print:border-0 print:shadow-none">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <div className="hidden text-[12px] font-semibold uppercase tracking-[.12em] text-ink-3 print:block">{business}</div>
              <h2 className="font-display text-[19px] font-bold">{report.title[lang]}</h2>
              {report.subtitle && <div className="text-[12.5px] text-ink-3">{report.subtitle[lang]}</div>}
            </div>
            {report.kpis && (
              <div className="flex flex-wrap gap-2">
                {report.kpis.map((k) => (
                  <div key={k.en} className="rounded-2xl border border-line px-3 py-1.5 text-right">
                    <div className="text-[10.5px] font-semibold uppercase tracking-[.1em] text-ink-3">{k[lang]}</div>
                    <div className={cx("font-display tabular text-[17px] font-extrabold", k.tone === "ok" && "text-ok", k.tone === "warn" && k.paise > 0 && "text-warn")}>{formatINR(k.paise)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13.5px] print:min-w-0 print:text-[11px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-[.08em] text-ink-3">
                  {report.columns.map((c) => (
                    <th key={c.key} className={cx("px-4 py-3 font-semibold", c.align === "right" && "text-right")}>
                      {c[lang]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.length === 0 && (
                  <tr>
                    <td colSpan={report.columns.length} className="px-4 py-8 text-center text-ink-3">
                      {q.kind === "arrears" ? L("No arrears. Everyone has paid. 🎉", "பாக்கி இல்லை. எல்லோரும் கட்டிவிட்டார்கள். 🎉") : L("Nothing yet.", "இன்னும் எதுவும் இல்லை.")}
                    </td>
                  </tr>
                )}
                {report.rows.map((r, i) => (
                  <tr key={i} className="border-b border-line last:border-0 print:break-inside-avoid">
                    {report.columns.map((c) => (
                      <td key={c.key} className={cx("px-4 py-2.5", c.align === "right" && "tabular text-right")}>
                        {cell(c.key, c.money, r[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {report.totals && report.rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-line-2 font-bold">
                    {report.columns.map((c) => (
                      <td key={c.key} className={cx("px-4 py-3", c.align === "right" && "tabular text-right")}>
                        {report.totals![c.key] == null ? "" : c.key === "month" ? L("Total", "மொத்தம்") : cell(c.key, c.money, report.totals![c.key])}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}
