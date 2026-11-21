"use client";

import { AnimatePresence, motion } from "motion/react";
import { BadgeCheck, CalendarClock, ChevronDown, Gavel, Hourglass, ReceiptText, Trophy, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui/kit";
import { fullLines, headline, pushText, type MsgFields, type MsgKind } from "@/domain/messages";
import { useL, useLang } from "@/lib/prefs";

export type InboxItem = { id: string; kind: string; fields: unknown; createdAt: string };

const ICON: Record<MsgKind, typeof Gavel> = { open: Gavel, date: CalendarClock, closed: ReceiptText, reminder: Hourglass, receipt: BadgeCheck, correction: Undo2 };

/** The member's messages: every notification is also kept here (a push may never arrive). Tapping one shows every field. */
export function Inbox({ items, focus }: { items: InboxItem[]; focus?: string }) {
  const L = useL();
  const [lang] = useLang();
  const [open, setOpen] = useState<string | null>(focus && items.some((i) => i.id === focus) ? focus : null);
  const focusRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focus) focusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focus]);
  if (!items.length) return null;
  return (
    <div className="card p-2">
      <div className="px-3 pb-1 pt-3 text-[13px] font-bold text-ink-2">{L("Messages", "செய்திகள்")}</div>
      <ul>
        {items.map((it) => {
          const kind = it.kind as MsgKind;
          const f = it.fields as MsgFields;
          const Icon = kind === "closed" && f.winner ? Trophy : ICON[kind];
          const isOpen = open === it.id;
          return (
            <li key={it.id} ref={it.id === focus ? focusRef : undefined} className={cx("rounded-2xl transition-colors", isOpen && "bg-[color-mix(in_oklab,var(--ink)_4%,transparent)]")}>
              <button className="flex w-full items-start gap-3 px-3 py-2.5 text-left" onClick={() => setOpen(isOpen ? null : it.id)} aria-expanded={isOpen}>
                <span className={cx("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl", kind === "correction" ? "bg-[color-mix(in_oklab,var(--warn)_18%,transparent)] text-warn" : kind === "receipt" ? "bg-[color-mix(in_oklab,var(--ok)_18%,transparent)] text-ok" : "bg-[color-mix(in_oklab,var(--gold-2)_18%,transparent)] text-gold-ink")}>
                  <Icon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[14px] font-semibold">{headline(kind, lang, f.winner)}</span>
                    <span className="shrink-0 text-[11px] text-ink-3">{it.createdAt.slice(8, 10)}/{it.createdAt.slice(5, 7)}</span>
                  </span>
                  <span className="block text-[12.5px] text-ink-2">{pushText(kind, f, lang).body}</span>
                </span>
                <motion.span animate={{ rotate: isOpen ? 180 : 0 }} className="mt-1 text-ink-3">
                  <ChevronDown size={16} />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                    <dl className="mx-3 mb-3 divide-y divide-line rounded-2xl border border-line text-[13px]">
                      {fullLines(kind, f, lang).map((r) => (
                        <div key={r.k} className="flex justify-between gap-3 px-3 py-2">
                          <dt className="text-ink-3">{r.k}</dt>
                          <dd className="tabular text-right font-semibold">{r.v}</dd>
                        </div>
                      ))}
                    </dl>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
