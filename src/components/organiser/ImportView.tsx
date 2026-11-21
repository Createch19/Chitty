"use client";

import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CheckCircle2, Crown, Dices, FileSpreadsheet, Download, UploadCloud, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { importAction, previewImportAction, type Preview } from "@/app/actions/import";
import { Badge, Button, ConfirmDialog, cx, useToast } from "@/components/ui/kit";
import { formatINR } from "@/domain/money";
import { useL, useLang } from "@/lib/prefs";
import { useDateText, useErrorText } from "./common";

/** Paper-chit import (BUSINESS-CONCEPT §14): template → upload → preview with errors → Import. */
export function ImportView() {
  const L = useL();
  const [lang] = useLang();
  const dt = useDateText();
  const err = useErrorText();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<Preview | null>(null);
  const [drag, setDrag] = useState(false);
  const [ask, setAsk] = useState(false);
  const [pending, start] = useTransition();

  const fileText = (code: string) =>
    ({
      NO_FILE: L("Choose a file first.", "முதலில் file தேர்வு செய்யவும்."),
      TOO_BIG: L("The file is too big (over 900 KB).", "File மிகப் பெரியது (900 KB-க்கு மேல்)."),
      NOT_XLSX: L("This isn't an Excel (.xlsx) file. In Google Sheets use File → Download → .xlsx.", "இது Excel (.xlsx) file இல்லை. Google Sheets-ல் File → Download → .xlsx."),
    })[code] ?? (code.startsWith("MISSING_SHEET:") ? L(`The sheet "${code.slice(14)}" is missing. Start from the template.`, `"${code.slice(14)}" sheet இல்லை. Template-ல் இருந்து தொடங்கவும்.`) : err(code));

  const check = (f: File) => {
    setFile(f);
    setRes(null);
    const fd = new FormData();
    fd.set("file", f);
    start(async () => setRes(await previewImportAction(fd)));
  };

  const doImport = () => {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    start(async () => {
      const r = await importAction(fd); // redirects to the chit on success
      if (r) {
        setRes(r);
        toast(L("Import stopped. See the problems below.", "Import நிறுத்தப்பட்டது. கீழே உள்ள பிரச்சனைகளைப் பார்க்கவும்."), "warn");
      }
    });
  };

  const p = res?.plan;
  const sheets = ["Chit", "Members", "Months", "Payments"] as const;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-[26px] font-extrabold">{L("Import a paper chit", "Paper சீட்டை import செய்")}</h1>
        <p className="mt-1 max-w-2xl text-[14px] text-ink-2">
          {L("Move a chit that's already running on paper into Chitty. The months already held are recorded; from the next month the chit runs here as normal.", "Paper-ல் நடக்கும் சீட்டை Chitty-க்கு மாற்றவும். நடந்த மாதங்கள் பதிவாகும்; அடுத்த மாதம் முதல் இங்கே வழக்கம் போல நடக்கும்.")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <div className="card flex flex-col p-5">
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[.12em] text-gold-ink">
            <span className="gold-fill grid h-6 w-6 place-items-center rounded-full text-[12px]">1</span> {L("Template", "Template")}
          </div>
          <p className="mt-2 text-[13.5px] text-ink-2">{L("4 sheets: Chit, Members, Months, Payments, with a filled sample (5 lakh, 20 months, 7 months held). Replace the sample with your chit.", "4 sheet: Chit, Members, Months, Payments. மாதிரி (5 லட்சம், 20 மாதம், 7 மாதம் நடந்தது) உள்ளது. அதை உங்கள் சீட்டால் மாற்றவும்.")}</p>
          <a href="/api/org/import/template" className="btn-ghost mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 pt-0 text-[14px] font-semibold">
            <Download size={16} /> {L("Download template", "Template பதிவிறக்கு")}
          </a>
        </div>

        <div
          className={cx("card relative flex flex-col items-center justify-center p-6 text-center transition-shadow", drag && "shadow-[0_0_0_2px_var(--gold-2),var(--shadow-card)]")}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) check(f);
          }}
        >
          <div className="absolute left-5 top-5 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[.12em] text-gold-ink">
            <span className="gold-fill grid h-6 w-6 place-items-center rounded-full text-[12px]">2</span> {L("Upload", "Upload")}
          </div>
          <motion.div animate={pending ? { y: [0, -6, 0] } : { y: 0 }} transition={{ repeat: pending ? Infinity : 0, duration: 1 }} className="gold-fill mt-6 grid h-16 w-16 place-items-center rounded-3xl">
            {file ? <FileSpreadsheet size={30} /> : <UploadCloud size={30} />}
          </motion.div>
          <div className="mt-3 text-[14.5px] font-semibold">{file ? file.name : L("Drop the filled .xlsx here", "நிரப்பிய .xlsx-ஐ இங்கே போடவும்")}</div>
          <div className="text-[12.5px] text-ink-3">{pending ? L("Checking…", "சரிபார்க்கிறது…") : L("Nothing is saved until you press Import.", "Import அழுத்தும் வரை எதுவும் சேமிக்கப்படாது.")}</div>
          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) check(f);
              e.target.value = "";
            }}
          />
          <Button size="sm" className="mt-3" icon={<UploadCloud size={14} />} disabled={pending} onClick={() => input.current?.click()}>
            {file ? L("Choose another file", "வேறு file") : L("Choose file", "File தேர்வு")}
          </Button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {res && !res.ok && (
          <motion.div key="bad" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card border-[color-mix(in_oklab,var(--warn)_45%,transparent)] p-5">
            <div className="flex items-center gap-2 font-display text-[17px] font-bold">
              <AlertTriangle size={18} className="text-warn" />
              {res.fileError ? fileText(res.fileError) : L(`${res.issues.length} thing${res.issues.length > 1 ? "s" : ""} to fix in the file`, `File-ல் ${res.issues.length} திருத்தம் வேண்டும்`)}
            </div>
            {res.issues.length > 0 && (
              <div className="mt-3 flex flex-col gap-3">
                {sheets
                  .filter((s) => res.issues.some((i) => i.sheet === s))
                  .map((s) => (
                    <div key={s}>
                      <div className="text-[12px] font-semibold uppercase tracking-[.1em] text-ink-3">
                        {L("Sheet", "Sheet")} {s}
                      </div>
                      <ul className="mt-1 divide-y divide-line rounded-2xl border border-line">
                        {res.issues
                          .filter((i) => i.sheet === s)
                          .map((i, k) => (
                            <li key={k} className="flex gap-3 px-3 py-2 text-[13.5px]">
                              <span className="tabular w-14 shrink-0 text-ink-3">{i.row ? L(`Row ${i.row}`, `வரிசை ${i.row}`) : "—"}</span>
                              <span>{lang === "ta" ? i.ta : i.en}</span>
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))}
              </div>
            )}
          </motion.div>
        )}

        {p && (
          <motion.div key="ok" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
            <div className="card relative overflow-hidden p-5">
              <div className="flex flex-wrap items-center gap-4">
                <div className="gold-fill font-display grid h-16 w-16 place-items-center rounded-3xl text-[28px] font-extrabold">{p.code}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-ok">
                    <CheckCircle2 size={16} /> {L("Everything checks out", "எல்லாம் சரியாக உள்ளது")}
                  </div>
                  <div className="font-display gold-text-adaptive text-[26px] font-extrabold leading-tight">{formatINR(p.totalPaise)}</div>
                  <div className="text-[13px] text-ink-2">
                    {L(`${p.months} months · ${p.rateBps / 100}% a month · steps of ${formatINR(p.incrementPaise)} · starts ${dt(p.startDate)} · opens ${p.openTime}`, `${p.months} மாதம் · மாத வட்டி ${p.rateBps / 100}% · ${formatINR(p.incrementPaise)} படி · ${dt(p.startDate)} தொடக்கம் · ${p.openTime}-க்கு திறக்கும்`)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-ink-3">{L("Next in the app", "App-ல் அடுத்து")}</div>
                  <div className="font-display text-[18px] font-bold">{p.next ? `${L(`Month ${p.next.month}`, `${p.next.month}-வது மாதம்`)} · ${dt(p.next.auctionDate)}` : "—"}</div>
                </div>
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="border-b border-line px-5 py-3 text-[13px] font-bold text-ink-2">{L(`Months held (${p.held.length})`, `நடந்த மாதங்கள் (${p.held.length})`)}</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-[13.5px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-[.08em] text-ink-3">
                      <th className="px-4 py-2.5">{L("Month", "மாதம்")}</th>
                      <th className="px-3 py-2.5">{L("Auction", "ஏலம்")}</th>
                      <th className="px-3 py-2.5 text-right">{L("Discount", "தள்ளு")}</th>
                      <th className="px-3 py-2.5">{L("Winner", "வென்றவர்")}</th>
                      <th className="px-3 py-2.5 text-right">{L("Each pays", "ஒவ்வொருவரும்")}</th>
                      <th className="px-3 py-2.5">{L("Paid", "கட்டியது")}</th>
                      <th className="px-4 py-2.5">{L("Payout", "Payout")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.held.map((m) => (
                      <tr key={m.month} className="border-b border-line last:border-0">
                        <td className="px-4 py-2 font-semibold">{m.month}</td>
                        <td className="px-3 py-2 text-ink-2">{dt(m.auctionDate)}</td>
                        <td className="tabular px-3 py-2 text-right font-semibold">{formatINR(m.discountPaise)}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1.5">
                            {m.lottery ? <Dices size={13} className="text-gold-ink" /> : <Crown size={13} className="text-gold-ink" />} {m.winner}
                          </span>
                        </td>
                        <td className="tabular px-3 py-2 text-right">{formatINR(m.payPaise)}</td>
                        <td className="tabular px-3 py-2">
                          {m.paid}/{p.months - 1}
                        </td>
                        <td className="px-4 py-2">{m.payoutDone ? <Badge tone="ok">{L("Done", "முடிந்தது")}</Badge> : <Badge tone="gold">{L("Pending", "நிலுவை")}</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="border-b border-line px-5 py-3 text-[13px] font-bold text-ink-2">{L(`Member IDs (${p.members.length})`, `Member ID (${p.members.length})`)}</div>
              <ul className="grid grid-cols-1 gap-x-6 px-5 py-2 sm:grid-cols-2">
                {p.members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 border-b border-line py-1.5 text-[13.5px]">
                    <span className="min-w-0 truncate">
                      <b>{m.id}</b> · {m.name} {m.organiser && <Badge tone="violet" className="ml-1 px-2 py-0 text-[10.5px]">{L("You", "நீங்கள்")}</Badge>}
                    </span>
                    <span className="shrink-0 text-[12px] text-ink-3">
                      {m.phone}
                      {m.aadhaar4 && ` · XXXX ${m.aadhaar4}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button
                icon={<X size={16} />}
                onClick={() => {
                  setFile(null);
                  setRes(null);
                }}
              >
                {L("Cancel", "ரத்து")}
              </Button>
              <Button variant="gold" size="lg" icon={<CheckCircle2 size={18} />} disabled={pending} onClick={() => setAsk(true)}>
                {L(`Import chit ${p.code}`, `சீட்டு ${p.code}-ஐ import செய்`)}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={ask}
        icon={
          <span className="gold-fill grid h-14 w-14 place-items-center rounded-full">
            <FileSpreadsheet size={26} />
          </span>
        }
        title={L(`Import chit ${p?.code ?? ""}?`, `சீட்டு ${p?.code ?? ""}-ஐ import செய்யலாமா?`)}
        body={L("The held months are recorded as final. Members get no messages for past months. Send member links after this.", "நடந்த மாதங்கள் இறுதியாக பதிவாகும். பழைய மாதங்களுக்கு செய்தி போகாது. பிறகு member links அனுப்பவும்.")}
        yes={L("Yes, import", "ஆம், import")}
        no={L("No", "இல்லை")}
        onNo={() => setAsk(false)}
        onYes={() => {
          setAsk(false);
          doImport();
        }}
      />
    </div>
  );
}
