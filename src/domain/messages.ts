/**
 * Member messages (BUSINESS-CONCEPT §12). One builder for the push notification, the in-app message page and the
 * WhatsApp backup button, so all three always say the same thing. Pure: no server or browser code.
 */
import { formatINR } from "./money";

export type Lang = "en" | "ta";
export type MsgKind = "open" | "date" | "closed" | "reminder" | "receipt" | "correction";

export type MsgFields = {
  business: string;
  code: string; // member ID, e.g. A07
  chitCode: string;
  totalPaise: number;
  chitDay: number | null; // 10 → "10th of every month"
  month: number;
  auctionDate: string; // YYYY-MM-DD
  lastPayDate: string;
  discountPaise?: number | null;
  sharePaise?: number | null; // discount ÷ number of IDs
  payPaise?: number | null;
  winner?: boolean; // this ID won this month (closed message only)
  prizePaise?: number | null;
};

const EN_M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TA_M = ["ஜன", "பிப்", "மார்", "ஏப்", "மே", "ஜூன்", "ஜூலை", "ஆக", "செப்", "அக்", "நவ", "டிச"];

export function dateText(iso: string, lang: Lang) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${(lang === "ta" ? TA_M : EN_M)[m - 1]} ${y}`;
}

const ord = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
};

/** Short text for the phone's notification. */
export function pushText(kind: MsgKind, f: MsgFields, lang: Lang): { title: string; body: string } {
  const ta = lang === "ta";
  const pay = formatINR(f.payPaise ?? 0);
  const last = dateText(f.lastPayDate, lang);
  const title = `${f.business} · ${f.code}`;
  const body = {
    open: ta ? `${f.month}-வது மாத ஏலம் இப்போது திறந்துள்ளது. ஏலம் கேட்க தொடவும்.` : `Month ${f.month} auction is open now. Tap to bid.`,
    date: ta
      ? `${f.month}-வது மாத ஏலம் ${dateText(f.auctionDate, lang)}-க்கு மாற்றப்பட்டது. கட்ட கடைசி நாள் ${last}.`
      : `Month ${f.month} auction moved to ${dateText(f.auctionDate, lang)}. Last day to pay: ${last}.`,
    closed: f.winner
      ? ta
        ? `${f.month}-வது மாதம் நீங்கள் வென்றீர்கள்! தொகை ${formatINR(f.prizePaise ?? 0)}. உங்கள் பங்கு payout-ல் கழிக்கப்படும்.`
        : `You won month ${f.month}! Prize ${formatINR(f.prizePaise ?? 0)}. Your share is adjusted at payout.`
      : ta
        ? `${f.month}-வது மாத ஏலம் முடிந்தது. ${last}-க்குள் ${pay} கட்டவும்.`
        : `Month ${f.month} auction closed. Pay ${pay} by ${last}.`,
    reminder: ta ? `நினைவூட்டல்: இன்னும் 2 நாள். ${last}-க்குள் ${pay} கட்டவும்.` : `Reminder: 2 days left. Pay ${pay} by ${last}.`,
    receipt: ta ? `${f.month}-வது மாதம் ${pay} பெறப்பட்டது. நன்றி!` : `Received ${pay} for month ${f.month}. Thank you!`,
    correction: ta
      ? `திருத்தம்: ${f.month}-வது மாத கட்டணம் "கட்டவில்லை" என மாற்றப்பட்டது. சந்தேகம் இருந்தால் நடத்துநரை அழைக்கவும்.`
      : `Correction: your month ${f.month} payment is now marked not paid. Please contact your organiser if this is wrong.`,
  }[kind];
  return { title, body };
}

/** Every field, one per line (the message page and the WhatsApp backup). */
export function fullLines(kind: MsgKind, f: MsgFields, lang: Lang): { k: string; v: string }[] {
  const ta = lang === "ta";
  const L = (en: string, t: string) => (ta ? t : en);
  const rows: { k: string; v: string }[] = [
    { k: L("Member ID", "உறுப்பினர் ID"), v: f.code },
    { k: L("Chit", "சீட்டு"), v: `${f.chitCode} · ${formatINR(f.totalPaise)}` },
  ];
  if (f.chitDay) rows.push({ k: L("Chit day", "சீட்டு நாள்"), v: L(`${ord(f.chitDay)} of every month`, `ஒவ்வொரு மாதமும் ${f.chitDay}-ம் தேதி`) });
  rows.push({ k: L("Month", "மாதம்"), v: L(`${ord(f.month)} month`, `${f.month}-வது மாதம்`) });
  if (kind === "open" || kind === "date") rows.push({ k: L("Auction date", "ஏல தேதி"), v: dateText(f.auctionDate, lang) });
  if (f.discountPaise != null && (kind === "closed" || kind === "reminder")) {
    rows.push({ k: L("Final discount", "ஏலம் முடிந்த தள்ளு"), v: formatINR(f.discountPaise) });
    if (f.sharePaise != null) rows.push({ k: L("Your share of the discount", "உங்கள் பங்கு தள்ளு"), v: formatINR(f.sharePaise) });
  }
  if (kind === "closed" && f.winner && f.prizePaise != null) rows.push({ k: L("Your prize", "உங்கள் தொகை"), v: formatINR(f.prizePaise) });
  if (f.payPaise != null && kind !== "open") rows.push({ k: kind === "receipt" ? L("Received", "பெறப்பட்டது") : L("Amount to pay", "கட்ட வேண்டிய தொகை"), v: formatINR(f.payPaise) });
  if (kind !== "receipt" && kind !== "open") rows.push({ k: L("Last date to pay", "கட்ட கடைசி தேதி"), v: dateText(f.lastPayDate, lang) });
  return rows;
}

const HEAD: Record<MsgKind, [string, string]> = {
  open: ["Auction is open", "ஏலம் திறந்துள்ளது"],
  date: ["Auction date changed", "ஏல தேதி மாற்றம்"],
  closed: ["Auction closed", "ஏலம் முடிந்தது"],
  reminder: ["Reminder: 2 days left", "நினைவூட்டல்: இன்னும் 2 நாள்"],
  receipt: ["Payment received", "கட்டணம் பெறப்பட்டது"],
  correction: ["Payment correction", "கட்டண திருத்தம்"],
};

export const headline = (kind: MsgKind, lang: Lang, winner = false) => (kind === "closed" && winner ? (lang === "ta" ? "நீங்கள் வென்றீர்கள்!" : "You won!") : HEAD[kind][lang === "ta" ? 1 : 0]);

/** The WhatsApp text: business name, headline, then every field. */
export function whatsappText(kind: MsgKind, f: MsgFields, lang: Lang) {
  return [f.business, headline(kind, lang, f.winner), ...fullLines(kind, f, lang).map((r) => `${r.k}: ${r.v}`)].join("\n");
}

/** One message for the chit's WhatsApp group (the organiser posts it by hand, BUSINESS-CONCEPT §5). No member data. */
export function groupText(kind: "open" | "date", g: { business: string; chitCode: string; totalPaise: number; month: number; auctionDate: string; openTime: string; minDiscountPaise: number }, lang: Lang) {
  const ta = lang === "ta";
  const head = `${g.business}\n${ta ? `சீட்டு ${g.chitCode}` : `Chit ${g.chitCode}`} · ${formatINR(g.totalPaise)}`;
  const body =
    kind === "open"
      ? ta
        ? `${g.month}-வது மாத ஏலம் இப்போது திறந்துள்ளது.\nகுறைந்தபட்ச தள்ளு ${formatINR(g.minDiscountPaise)}.\nஉங்கள் Chitty link-ஐ திறந்து ஏலம் கேளுங்கள்.`
        : `Month ${g.month} auction is open now.\nMinimum discount ${formatINR(g.minDiscountPaise)}.\nOpen your Chitty link to bid.`
      : ta
        ? `${g.month}-வது மாத ஏலம்: ${dateText(g.auctionDate, lang)}, ${g.openTime}-க்கு திறக்கும்.`
        : `Month ${g.month} auction: ${dateText(g.auctionDate, lang)}, opens at ${g.openTime}.`;
  return `${head}\n${body}`;
}
