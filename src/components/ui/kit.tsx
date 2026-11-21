"use client";

import { AnimatePresence, LayoutGroup, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { inr } from "@/lib/money";
import { hue as seatHue } from "@/lib/mock";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

/**
 * Dialogs render into <body>. A `.card` uses backdrop-filter, which turns `position: fixed` children into
 * card-sized boxes (and overflow-hidden clips them), so a dialog opened from inside a card broke on phones.
 */
const noSub = () => () => {};
export function Portal({ children }: { children: ReactNode }) {
  const onClient = useSyncExternalStore(noSub, () => true, () => false);
  return onClient ? createPortal(children, document.body) : null;
}

/* ---------------- Button ---------------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: Ref<HTMLButtonElement>;
  variant?: "gold" | "ghost" | "plain" | "danger" | "ok";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
};
export function Button({ variant = "ghost", size = "md", icon, className, children, disabled, ...rest }: BtnProps) {
  const sizes = { sm: "h-9 px-3 text-[13px] rounded-xl gap-1.5", md: "h-11 px-4 text-[14.5px] rounded-2xl gap-2", lg: "h-14 px-6 text-[16px] rounded-2xl gap-2.5" };
  const variants = {
    gold: "btn-gold font-bold",
    ghost: "btn-ghost font-semibold",
    plain: "font-semibold text-ink-2 hover:text-ink",
    danger: "bg-danger text-white font-bold shadow-[0_10px_24px_-12px_var(--danger)]",
    ok: "bg-ok text-white font-bold shadow-[0_10px_24px_-12px_var(--ok)]",
  };
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.96 }}
      whileHover={disabled ? undefined : { y: -1 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      disabled={disabled}
      className={cx(
        "relative inline-flex select-none items-center justify-center whitespace-nowrap transition-[opacity,background] disabled:cursor-not-allowed disabled:opacity-40",
        sizes[size],
        variants[variant],
        className,
      )}
      {...(rest as object)}
    >
      {icon}
      {children}
    </motion.button>
  );
}

/* ---------------- Count-up number ---------------- */
export function CountUp({
  value,
  money = true,
  duration = 0.9,
  className,
}: {
  value: number;
  money?: boolean;
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (n) => (money ? inr(Math.round(n)) : Math.round(n).toLocaleString("en-IN")));
  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const c = animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [value, duration, reduce, mv]);
  return <motion.span className={cx("tabular", className)}>{text}</motion.span>;
}

/* ---------------- Seat sphere (3D-looking avatar) ---------------- */
export function Sphere({ index, size = 36, grey, className }: { index: number; size?: number; grey?: boolean; className?: string }) {
  const h = seatHue(index);
  const bg = grey
    ? "radial-gradient(circle at 35% 28%, #e3e7ea, #8b959b 55%, #4f585d)"
    : `radial-gradient(circle at 35% 28%, hsl(${h} 85% 82%), hsl(${h} 70% 52%) 48%, hsl(${h} 70% 24%))`;
  return (
    <span
      className={cx("relative inline-block shrink-0 rounded-full", className)}
      style={{
        width: size,
        height: size,
        background: bg,
        boxShadow: "inset -4px -5px 8px rgba(0,0,0,.32), inset 3px 3px 6px rgba(255,255,255,.45), 0 4px 10px rgba(0,0,0,.25)",
      }}
    >
      <svg viewBox="-10 -10 20 20" className="absolute inset-0 h-full w-full">
        <circle cx="0" cy="-2" r="2.6" fill="rgba(255,255,255,.93)" />
        <ellipse cx="0" cy="5.8" rx="5.4" ry="3.8" fill="rgba(255,255,255,.93)" />
        <ellipse cx="-3.2" cy="-5.2" rx="3.4" ry="1.7" fill="rgba(255,255,255,.5)" transform="rotate(-30 -3.2 -5.2)" />
      </svg>
    </span>
  );
}

/* ---------------- Badge ---------------- */
export function Badge({ tone = "plain", children, className }: { tone?: "plain" | "gold" | "ok" | "warn" | "danger" | "live" | "violet"; children: ReactNode; className?: string }) {
  const tones = {
    plain: "bg-bg-2 text-ink-2 border-line",
    gold: "bg-[color-mix(in_oklab,var(--gold-2)_18%,transparent)] text-gold-ink border-[color-mix(in_oklab,var(--gold-2)_45%,transparent)]",
    ok: "bg-ok-soft text-ok border-transparent",
    warn: "bg-warn-soft text-warn border-transparent",
    danger: "bg-danger-soft text-danger border-transparent",
    live: "bg-[rgba(255,77,90,.12)] text-[#ff4d5a] border-transparent",
    violet: "bg-[color-mix(in_oklab,var(--violet)_14%,transparent)] text-violet border-transparent",
  };
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}

/* ---------------- Segmented control ---------------- */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  // Own layout namespace: Next keeps hidden routes mounted, so shared layoutIds would collide.
  const group = useId();
  const [tapped, setTapped] = useState(false);
  return (
    <LayoutGroup id={group}>
    <div className={cx("relative inline-flex rounded-full border border-line bg-glass p-1 backdrop-blur", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => {
            setTapped(true);
            onChange(o.value);
          }}
          className={cx("relative z-10 rounded-full px-3 py-1 text-[12.5px] font-semibold transition-colors", value === o.value ? "text-[#3a2300]" : "text-ink-2")}
        >
          {value === o.value &&
            (tapped ? (
              <motion.span layoutId="seg-pill" className="gold-fill absolute inset-0 -z-10 rounded-full" transition={{ type: "spring", stiffness: 500, damping: 34 }} />
            ) : (
              <span className="gold-fill absolute inset-0 -z-10 rounded-full" />
            ))}
          {o.label}
        </button>
      ))}
    </div>
    </LayoutGroup>
  );
}

/* ---------------- Confirm dialog (Yes / No) ---------------- */
export function ConfirmDialog({
  open,
  title,
  body,
  yes,
  no,
  tone = "gold",
  onYes,
  onNo,
  icon,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  yes: string;
  no: string;
  tone?: "gold" | "danger" | "ok";
  onYes: () => void;
  onNo: () => void;
  icon?: ReactNode;
}) {
  const yesRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => yesRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onNo();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onNo]);
  return (
    <Portal><AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="absolute inset-0 bg-[rgba(8,6,14,.55)] backdrop-blur-sm" onClick={onNo} />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            className="card-solid relative w-full max-w-sm p-6 text-ink"
            initial={{ y: 40, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 30, scale: 0.97, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
          >
            {icon && <div className="mb-3 flex justify-center">{icon}</div>}
            <h3 className="font-display text-center text-[19px] font-bold leading-snug">{title}</h3>
            {body && <div className="mt-2 text-center text-[14px] text-ink-2">{body}</div>}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button variant="ghost" size="lg" onClick={onNo}>
                {no}
              </Button>
              <Button ref={yesRef} variant={tone} size="lg" onClick={onYes}>
                {yes}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence></Portal>
  );
}

/* ---------------- Toasts ---------------- */
type Toast = { id: number; text: ReactNode; tone: "ok" | "gold" | "warn" | "plain" };
const ToastCtx = createContext<(text: ReactNode, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: ReactNode, tone: Toast["tone"] = "plain") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 2600);
  }, []);
  const tones = { ok: "border-[color-mix(in_oklab,var(--ok)_40%,transparent)]", gold: "border-[color-mix(in_oklab,var(--gold-2)_55%,transparent)]", warn: "border-[color-mix(in_oklab,var(--warn)_45%,transparent)]", plain: "border-line-2" };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ y: 24, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 12, opacity: 0, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 460, damping: 32 }}
              className={cx("card-solid pointer-events-auto max-w-sm rounded-2xl border px-4 py-2.5 text-center text-[13.5px] font-semibold text-ink", tones[t.tone])}
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------- Progress ring ---------------- */
export function Ring({ value, size = 64, stroke = 7, children, track = "var(--line-2)" }: { value: number; size?: number; stroke?: number; children?: ReactNode; track?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const id = `rg${useId().replace(/:/g, "")}`;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffe58a" />
            <stop offset="0.55" stopColor="#f6c64f" />
            <stop offset="1" stopColor="#dc8f0a" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, value))) }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
