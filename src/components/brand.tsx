"use client";

import Link from "next/link";
import { ArrowLeft, Languages, Moon, Sun, SunMoon } from "lucide-react";
import { type ReactNode } from "react";
import { useLang, useThemePref } from "@/lib/prefs";
import { Segmented, cx } from "@/components/ui/kit";

/** Gold coin mark + wordmark. */
export function Logo({ size = 30, word = true, className }: { size?: number; word?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
        <defs>
          <radialGradient id="lgG" cx="35%" cy="28%" r="80%">
            <stop offset="0" stopColor="#fff6c2" />
            <stop offset=".38" stopColor="#ffd34d" />
            <stop offset=".78" stopColor="#e39a05" />
            <stop offset="1" stopColor="#8f5200" />
          </radialGradient>
        </defs>
        <circle cx="20" cy="20" r="18" fill="url(#lgG)" />
        <circle cx="20" cy="20" r="14.5" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1.2" />
        <path d="M14 13h12M14 18h12M18.5 13c5.5 0 5.5 9.5 0 9.5H14l9 6.5" fill="none" stroke="#5b3a05" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <ellipse cx="14" cy="11" rx="6" ry="2.6" fill="rgba(255,255,255,.5)" transform="rotate(-28 14 11)" />
      </svg>
      {word && <span className="font-display text-[19px] font-extrabold tracking-tight">Chitty</span>}
    </span>
  );
}

export function LangToggle() {
  const [lang, setLang] = useLang();
  return (
    <Segmented
      value={lang}
      onChange={setLang}
      options={[
        { value: "en", label: "EN" },
        { value: "ta", label: "தமிழ்" },
      ]}
    />
  );
}

export function ThemeToggle() {
  const [pref, setPref] = useThemePref();
  return (
    <Segmented
      value={pref}
      onChange={setPref}
      options={[
        { value: "auto", label: <SunMoon size={14} aria-label="Auto" /> },
        { value: "light", label: <Sun size={14} aria-label="Light" /> },
        { value: "dark", label: <Moon size={14} aria-label="Dark" /> },
      ]}
    />
  );
}

/** Thin bar on every preview screen: back to the index + language/theme switches. */
export function PreviewBar({ title, stage }: { title: string; stage?: boolean }) {
  return (
    <div className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_oklab,var(--bg)_78%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-2 px-3">
        <Link href="/" className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[13px] font-semibold text-ink-2 hover:text-ink">
          <ArrowLeft size={15} /> Preview
        </Link>
        <span className="truncate text-[13px] font-semibold text-ink-3">· {title}</span>
        <div className="ml-auto flex items-center gap-2">
          <Languages size={15} className="hidden text-ink-3 sm:block" />
          <LangToggle />
          {!stage && <ThemeToggle />}
        </div>
      </div>
    </div>
  );
}

export function Aurora() {
  return <div className="aurora" aria-hidden />;
}

export function Shell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("relative z-10 mx-auto w-full max-w-6xl px-4", className)}>{children}</div>;
}
