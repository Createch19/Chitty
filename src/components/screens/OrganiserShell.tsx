"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion } from "motion/react";
import { FileSpreadsheet, HandCoins, LayoutDashboard, Ticket, Users } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Logo } from "@/components/brand";
import { cx } from "@/components/ui/kit";
import { organiser } from "@/lib/mock";
import { useL, useLang } from "@/lib/prefs";

export function OrganiserShell({ children }: { children: ReactNode }) {
  const L = useL();
  const [lang] = useLang();
  const path = usePathname();
  const nav = [
    { href: "/preview/dashboard", icon: LayoutDashboard, label: L("Home", "முகப்பு") },
    { href: "/preview/chit", icon: Ticket, label: L("Chits", "சீட்டுகள்") },
    { href: "/preview/collection", icon: HandCoins, label: L("Collection", "வசூல்") },
    { href: "/preview/chit#members", icon: Users, label: L("Members", "உறுப்பினர்") },
    { href: "/preview/dashboard#import", icon: FileSpreadsheet, label: L("Import", "Import") },
  ];
  const active = (href: string) => path === href.split("#")[0] && !href.includes("#");
  const group = useId();

  return (
    <LayoutGroup id={group}>
    <div className="relative z-10 mx-auto flex max-w-7xl gap-6 px-3 pb-28 pt-4 sm:px-5 lg:pb-10">
      <aside className="sticky top-16 hidden h-[calc(100vh-5rem)] w-60 shrink-0 flex-col lg:flex">
        <div className="card flex h-full flex-col p-4">
          <Logo />
          <div className="mt-5 rounded-2xl bg-[color-mix(in_oklab,var(--gold-2)_12%,transparent)] p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-ink-3">{L("Organiser", "Organiser")}</div>
            <div className="font-display mt-0.5 text-[15px] font-bold leading-tight">{lang === "ta" ? organiser.businessTa : organiser.business}</div>
          </div>
          <nav className="mt-5 flex flex-col gap-1">
            {nav.map((n) => {
              const on = active(n.href);
              return (
                <Link key={n.href} href={n.href} className={cx("relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-colors", on ? "text-[#3a2300]" : "text-ink-2 hover:text-ink")}>
                  {on && <motion.span layoutId="side-active" className="gold-fill absolute inset-0 -z-10 rounded-xl" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
                  <n.icon size={18} /> {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto text-[11.5px] text-ink-3">Chitty · {L("design preview", "முன்னோட்டம்")}</div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>

      {/* mobile bottom bar */}
      <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-[22px] border border-line bg-glass p-1.5 shadow-pop backdrop-blur-xl lg:hidden">
        {nav.map((n) => {
          const on = active(n.href);
          return (
            <Link key={n.href} href={n.href} className={cx("relative flex flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10.5px] font-semibold", on ? "text-[#3a2300]" : "text-ink-3")}>
              {on && <motion.span layoutId="tab-active" className="gold-fill absolute inset-0 -z-10 rounded-2xl" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
              <n.icon size={19} />
              <span className="max-w-full truncate px-1">{n.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
    </LayoutGroup>
  );
}
