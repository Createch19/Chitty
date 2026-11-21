"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FileUp, Home, LogOut, Plus, ScrollText } from "lucide-react";
import type { ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import { LangToggle, Logo, ThemeToggle } from "@/components/brand";
import { Button, cx } from "@/components/ui/kit";
import { useL, useLang } from "@/lib/prefs";

export type Me = { businessName: string; businessNameTa: string | null; ownerName: string };

const EN_M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TA_M = ["ஜன", "பிப்", "மார்", "ஏப்", "மே", "ஜூன்", "ஜூலை", "ஆக", "செப்", "அக்", "நவ", "டிச"];

/** "2026-12-10" → "10 Dec 2026" / "10 டிச 2026" (deterministic, no locale data needed). */
export function useDateText() {
  const [lang] = useLang();
  return (iso: string | null | undefined, withYear = true) => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-").map(Number);
    return `${d} ${(lang === "ta" ? TA_M : EN_M)[m - 1]}${withYear ? ` ${y}` : ""}`;
  };
}

/** Human text for server error codes. */
export function useErrorText() {
  const L = useL();
  return (code: string) =>
    ({
      CHIT_FULL: L("Every seat is already filled.", "எல்லா இடங்களும் நிரம்பிவிட்டன."),
      CHIT_NOT_DRAFT: L("This chit has started; seats are fixed now.", "சீட்டு தொடங்கிவிட்டது; இடங்கள் இனி மாறாது."),
      CHIT_NOT_FULL: L("Fill every seat before starting.", "தொடங்கும் முன் எல்லா இடங்களையும் நிரப்பவும்."),
      START_DAY_1_TO_28: L("Pick a start day from 1 to 28.", "1 முதல் 28 வரை ஒரு தேதி தேர்வு செய்யவும்."),
      NO_ORGANISER_SEAT: L("Mark one seat as yours first.", "முதலில் ஒரு இடத்தை உங்களுடையதாக குறிக்கவும்."),
      INVALID_PHONE: L("Enter a 10-digit mobile number.", "10 இலக்க mobile எண் கொடுக்கவும்."),
      INVALID_NAME: L("Enter a name.", "பெயர் கொடுக்கவும்."),
      ORGANISER_SEAT: L("This is your own seat; pick another seat as yours first.", "இது உங்கள் இடம்; முதலில் வேறு இடத்தை உங்களுடையதாக்கவும்."),
      CODE_TAKEN: L("That chit code is already used.", "அந்த சீட்டு code ஏற்கனவே உள்ளது."),
      INVALID_CODE: L("Use 1–3 letters for the code.", "Code-க்கு 1–3 எழுத்துகள்."),
      INSTALLMENT_NOT_EXACT: L("Chit value ÷ months must be exact.", "சீட்டுத் தொகை ÷ மாதங்கள் சரியாக வர வேண்டும்."),
      INTEREST_NOT_EXACT: L("Chit value × rate must be exact; try another rate.", "தொகை × வட்டி சரியாக வரவில்லை; வேறு % முயற்சிக்கவும்."),
      INVALID_RATE: L("Rate: above 0%, up to 2 decimals.", "வட்டி: 0%-க்கு மேல், 2 தசம இடம் வரை."),
      INVALID_INCREMENT: L("Bid step must be at least ₹1.", "ஏலப் படி குறைந்தது ₹1."),
      INVALID_MONTHS: L("Months must be 2 to 120.", "மாதங்கள் 2 முதல் 120."),
      INVALID_TOTAL: L("Enter the chit value.", "சீட்டுத் தொகை கொடுக்கவும்."),
      INVALID_AMOUNT: L("Enter whole rupees.", "முழு ரூபாய் கொடுக்கவும்."),
      PREVIOUS_NOT_CLOSED: L("Close the previous month first.", "முதலில் முந்தைய மாதத்தை முடிக்கவும்."),
      MONTH_NOT_PENDING: L("This month has already started.", "இந்த மாதம் ஏற்கனவே தொடங்கிவிட்டது."),
      DATE_OUT_OF_ORDER: L("The date must stay between the months before and after.", "தேதி முந்தைய, அடுத்த மாதங்களுக்கு இடையில் இருக்க வேண்டும்."),
      NO_BIDS: L("Nobody bid. Run the lottery instead.", "யாரும் ஏலம் கேட்கவில்லை. குலுக்கல் போடவும்."),
      HAS_BIDS: L("There are bids; the highest bid wins.", "ஏலங்கள் உள்ளன; அதிக ஏலமே வெற்றி."),
      AUCTION_NOT_OPEN: L("The auction is not open.", "ஏலம் திறக்கப்படவில்லை."),
      WINNER_AT_PAYOUT: L("The winner's share is settled at payout.", "வெற்றியாளரின் பங்கு payout-ல் கழிக்கப்படும்."),
      PAYOUT_ALREADY_DONE: L("Payout is already done for this month.", "இந்த மாத payout முடிந்துவிட்டது."),
      NOT_EVERYONE_PAID: L("Not everyone has paid yet.", "இன்னும் அனைவரும் கட்டவில்லை."),
      MUST_CHANGE_PASSWORD: L("Set your own password first.", "முதலில் சொந்த password அமைக்கவும்."),
      INVALID_AADHAAR: L("That isn't a valid Aadhaar number (12 digits; the last digit is a check).", "சரியான Aadhaar எண் இல்லை (12 இலக்கம்; கடைசி இலக்கம் சரிபார்ப்பு)."),
      AADHAAR_KEY_MISSING: L("Aadhaar storage isn't set up on the server yet.", "Server-ல் Aadhaar சேமிப்பு இன்னும் அமைக்கப்படவில்லை."),
      AADHAAR_UNREADABLE: L("This Aadhaar can't be read (the server key changed).", "இந்த Aadhaar-ஐ படிக்க முடியவில்லை (server key மாறியுள்ளது)."),
      NO_AADHAAR: L("No Aadhaar saved for this ID.", "இந்த ID-க்கு Aadhaar இல்லை."),
      CHIT_NOT_ACTIVE: L("Only a running chit allows this.", "நடக்கும் சீட்டில் மட்டுமே இது முடியும்."),
      SEAT_NOT_FOUND: L("Member ID not found.", "Member ID கிடைக்கவில்லை."),
    })[code] ?? L("Something went wrong. Try again.", "ஏதோ தவறு. மீண்டும் முயற்சிக்கவும்.");
}

export function OrgShell({ me, children }: { me: Me; children: ReactNode }) {
  const L = useL();
  const [lang] = useLang();
  const path = usePathname();
  const business = lang === "ta" && me.businessNameTa ? me.businessNameTa : me.businessName;
  return (
    <div className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-4">
      <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/app" className="flex items-center gap-3">
          <Logo word={false} size={36} />
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-ink-3">{L("Organiser", "Organiser")}</div>
            <div className="font-display text-[17px] font-extrabold leading-tight">{business}</div>
          </div>
        </Link>
        <nav className="flex flex-wrap items-center gap-2">
          <Link href="/app" className={cx("inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold", path === "/app" ? "gold-fill" : "btn-ghost")}>
            <Home size={14} /> {L("Home", "முகப்பு")}
          </Link>
          <Link href="/app/chits/new" className={cx("inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold", path === "/app/chits/new" ? "gold-fill" : "btn-ghost")}>
            <Plus size={14} /> {L("New chit", "புதிய சீட்டு")}
          </Link>
          <Link href="/app/import" aria-label={L("Import", "Import")} className={cx("inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold", path.startsWith("/app/import") ? "gold-fill" : "btn-ghost")}>
            <FileUp size={14} /> <span className="hidden sm:inline">{L("Import", "Import")}</span>
          </Link>
          <Link href="/app/reports" className={cx("inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold", path.startsWith("/app/reports") ? "gold-fill" : "btn-ghost")}>
            <BarChart3 size={14} /> {L("Reports", "அறிக்கைகள்")}
          </Link>
          <Link href="/app/audit" aria-label={L("Audit log", "Audit log")} className={cx("inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold", path.startsWith("/app/audit") ? "gold-fill" : "btn-ghost")}>
            <ScrollText size={14} /> <span className="hidden sm:inline">{L("Audit", "Audit")}</span>
          </Link>
          <LangToggle />
          <ThemeToggle />
          <form action={logout.bind(null, "organiser")}>
            <Button size="sm" icon={<LogOut size={14} />} type="submit" aria-label={L("Log out", "வெளியேறு")}>
              <span className="hidden sm:inline">{L("Log out", "வெளியேறு")}</span>
            </Button>
          </form>
        </nav>
      </header>
      <main className="mt-6 print:mt-0">{children}</main>
    </div>
  );
}
