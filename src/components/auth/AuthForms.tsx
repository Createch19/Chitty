"use client";

import { AnimatePresence, motion } from "motion/react";
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, Smartphone } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";
import { LangToggle, Logo, ThemeToggle } from "@/components/brand";
import { Button, cx } from "@/components/ui/kit";
import type { FormState } from "@/app/actions/auth";
import { useL } from "@/lib/prefs";

type Action = (s: FormState, f: FormData) => Promise<FormState>;

function useErrorText() {
  const L = useL();
  return (code?: string) =>
    ({
      INVALID: L("Wrong mobile number or password.", "Mobile எண் அல்லது password தவறு."),
      LOCKED: L("Too many wrong tries. Please wait 15 minutes.", "பல முறை தவறு. 15 நிமிடம் கழித்து முயற்சிக்கவும்."),
      DISABLED: L("This account is paused. Please contact Chitty.", "இந்தக் கணக்கு நிறுத்தப்பட்டுள்ளது. Chitty-ஐ தொடர்பு கொள்ளவும்."),
      WRONG_PASSWORD: L("Your current password is wrong.", "தற்போதைய password தவறு."),
      PASSWORD_TOO_SHORT: L("Use at least 8 characters.", "குறைந்தது 8 எழுத்துகள் வேண்டும்."),
      SAME_PASSWORD: L("Choose a new password, not the old one.", "பழையது இல்லாமல் புதிய password தேர்வு செய்யவும்."),
      MISMATCH: L("The two new passwords don't match.", "இரண்டு புதிய password-களும் ஒன்றாக இல்லை."),
    })[code ?? ""] ?? (code ? L("Something went wrong. Try again.", "ஏதோ தவறு. மீண்டும் முயற்சிக்கவும்.") : "");
}

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6">
      <div className="flex items-center justify-between">
        <Logo size={30} />
        <div className="flex gap-2">
          <LangToggle />
          <ThemeToggle />
        </div>
      </div>
      <div className="flex flex-1 items-center py-10">{children}</div>
    </div>
  );
}

export function Field({ icon, label, name, type = "text", inputMode, autoComplete, toggle, defaultValue }: { icon: ReactNode; label: string; name: string; type?: string; inputMode?: "numeric" | "tel"; autoComplete?: string; toggle?: boolean; defaultValue?: string }) {
  const [show, setShow] = useState(false);
  const L = useL();
  return (
    <label className="block">
      <span className="text-[12.5px] font-semibold text-ink-2">{label}</span>
      <span className="mt-1 flex h-13 items-center gap-2 rounded-2xl border border-line-2 bg-[color-mix(in_oklab,var(--ink)_3%,transparent)] px-4 transition-colors focus-within:border-gold-3 focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--gold-2)_25%,transparent)]">
        <span className="text-ink-3">{icon}</span>
        <input key={defaultValue} name={name} defaultValue={defaultValue} type={toggle && show ? "text" : type} inputMode={inputMode} autoComplete={autoComplete} required className="h-12 min-w-0 flex-1 bg-transparent text-[16px] outline-none" />
        {toggle && (
          <button type="button" aria-label={show ? L("Hide password", "Password மறை") : L("Show password", "Password காட்டு")} onClick={() => setShow((s) => !s)} className="text-ink-3 hover:text-ink">
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </span>
    </label>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <AnimatePresence>
      {text && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
          <div role="alert" className="mt-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13.5px] font-semibold text-danger">
            {text}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function LoginCard({ kind, action }: { kind: "admin" | "organiser"; action: Action }) {
  const L = useL();
  const err = useErrorText();
  const [state, formAction, pending] = useActionState(action, undefined);
  const admin = kind === "admin";
  return (
    <motion.form
      action={formAction}
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 240, damping: 24 }}
      className="card w-full p-6 sm:p-8"
    >
      <span className={cx("grid h-14 w-14 place-items-center rounded-2xl", admin ? "bg-[color-mix(in_oklab,var(--violet)_16%,transparent)] text-violet" : "gold-fill")}>
        {admin ? <ShieldCheck size={26} /> : <Lock size={24} />}
      </span>
      <h1 className="font-display mt-5 text-[26px] font-extrabold leading-tight">{admin ? "Chitty Admin" : L("Organiser login", "Organiser உள்நுழைவு")}</h1>
      <p className="mt-1 text-[14px] text-ink-2">{admin ? L("Super Admin only.", "Super Admin மட்டும்.") : L("Log in with your mobile number and password.", "உங்கள் mobile எண், password கொண்டு உள்நுழையவும்.")}</p>
      <div className="mt-6 flex flex-col gap-4">
        <Field icon={<Smartphone size={18} />} label={L("Mobile number", "Mobile எண்")} name="mobile" type="tel" inputMode="tel" autoComplete="username" defaultValue={state?.mobile} />
        <Field icon={<KeyRound size={18} />} label="Password" name="password" type="password" autoComplete="current-password" toggle />
      </div>
      <ErrorBox text={err(state?.error)} />
      <Button type="submit" variant="gold" size="lg" className="mt-6 w-full" disabled={pending}>
        {pending ? L("Checking…", "சரிபார்க்கிறது…") : L("Log in", "உள்நுழை")}
      </Button>
      {!admin && <p className="mt-4 text-center text-[12.5px] text-ink-3">{L("Forgot your password? Ask Chitty support to reset it.", "Password மறந்துவிட்டதா? Chitty-யிடம் reset கேளுங்கள்.")}</p>}
    </motion.form>
  );
}

export function PasswordCard({ action, forced }: { action: Action; forced: boolean }) {
  const L = useL();
  const err = useErrorText();
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <motion.form action={formAction} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card w-full p-6 sm:p-8">
      <span className="gold-fill grid h-14 w-14 place-items-center rounded-2xl">
        <KeyRound size={24} />
      </span>
      <h1 className="font-display mt-5 text-[24px] font-extrabold leading-tight">{L("Set your own password", "உங்கள் சொந்த password அமைக்கவும்")}</h1>
      {forced && <p className="mt-1 text-[14px] text-ink-2">{L("You logged in with a password from Chitty. Please choose your own before continuing.", "Chitty கொடுத்த password-ல் உள்நுழைந்தீர்கள். தொடர உங்கள் சொந்த password அமைக்கவும்.")}</p>}
      <div className="mt-6 flex flex-col gap-4">
        <Field icon={<Lock size={18} />} label={L("Current password", "தற்போதைய password")} name="current" type="password" autoComplete="current-password" toggle />
        <Field icon={<KeyRound size={18} />} label={L("New password (8+ characters)", "புதிய password (8+ எழுத்துகள்)")} name="next" type="password" autoComplete="new-password" toggle />
        <Field icon={<KeyRound size={18} />} label={L("New password again", "புதிய password மீண்டும்")} name="confirm" type="password" autoComplete="new-password" toggle />
      </div>
      <ErrorBox text={err(state?.error)} />
      <Button type="submit" variant="gold" size="lg" className="mt-6 w-full" disabled={pending}>
        {pending ? L("Saving…", "சேமிக்கிறது…") : L("Save password", "Password சேமி")}
      </Button>
    </motion.form>
  );
}
