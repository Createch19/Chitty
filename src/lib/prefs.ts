"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Lang = "en" | "ta";
export type ThemePref = "auto" | "light" | "dark";

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function write(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode: keep it for this page only */
  }
}

/** Current language. Server render is always English; the boot script sets <html lang> before paint. */
export function useLang(): [Lang, (l: Lang) => void] {
  const lang = useSyncExternalStore(
    subscribe,
    () => (document.documentElement.lang === "ta" ? "ta" : "en") as Lang,
    () => "en" as Lang,
  );
  const set = useCallback((l: Lang) => {
    document.documentElement.lang = l;
    write("chitty.lang", l);
    emit();
  }, []);
  return [lang, set];
}

/** Pick the string for the current language: L("Join", "சேர்"). */
export function useL() {
  const [lang] = useLang();
  return useCallback((en: string, ta: string) => (lang === "ta" ? ta : en), [lang]);
}

export function useThemePref(): [ThemePref, (t: ThemePref) => void] {
  const pref = useSyncExternalStore(
    subscribe,
    () => (document.documentElement.getAttribute("data-theme") as ThemePref) || "auto",
    () => "auto" as ThemePref,
  );
  const set = useCallback((t: ThemePref) => {
    const d = document.documentElement;
    if (t === "auto") d.removeAttribute("data-theme");
    else d.setAttribute("data-theme", t);
    write("chitty.theme", t === "auto" ? null : t);
    emit();
  }, []);
  return [pref, set];
}

/** Short vibration on Android phones (ignored elsewhere). */
export function haptic(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    /* not supported */
  }
}
