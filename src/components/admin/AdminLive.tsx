"use client";

import { AnimatePresence, motion } from "motion/react";
import { Building2, Copy, KeyRound, Lock, LogOut, Pencil, Plus, Power, ShieldCheck, Ticket, Users, Wand2, X } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { createOrganiserAction, resetPasswordAction, setOrganiserActiveAction, updateOrganiserAction, type ActionResult } from "@/app/actions/admin";
import { logout } from "@/app/actions/auth";
import { LangToggle, Logo, ThemeToggle } from "@/components/brand";
import { Badge, Button, ConfirmDialog, CountUp, cx, useToast } from "@/components/ui/kit";
import { useL, useLang } from "@/lib/prefs";

export type OrgRow = {
  id: string;
  businessName: string;
  businessNameTa: string | null;
  ownerName: string;
  mobile: string;
  active: boolean;
  createdAt: string;
  chits: number;
  ids: number;
};

const fmtMobile = (m: string) => `${m.slice(0, 5)} ${m.slice(5)}`;
const genPassword = () => {
  const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => abc[n % abc.length]).join("");
};

type Sheet = { mode: "new" } | { mode: "edit"; org: OrgRow } | null;

export function AdminLive({ admin, organisers }: { admin: { name: string; mobile: string }; organisers: OrgRow[] }) {
  const L = useL();
  const [lang] = useLang();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [confirm, setConfirm] = useState<{ kind: "toggle" | "reset"; org: OrgRow } | null>(null);
  const [temp, setTemp] = useState<{ org: OrgRow; pw: string } | null>(null);

  const errText = (code: string) =>
    ({
      MOBILE_TAKEN: L("Another organiser already uses this mobile number.", "இந்த mobile எண் வேறு organiser-க்கு உள்ளது."),
      INVALID_MOBILE: L("Enter a 10-digit Indian mobile number.", "10 இலக்க mobile எண் கொடுக்கவும்."),
      PASSWORD_TOO_SHORT: L("Password needs at least 8 characters.", "Password குறைந்தது 8 எழுத்துகள்."),
      NOT_FOUND: L("This organiser no longer exists.", "இந்த organiser இல்லை."),
    })[code] ?? L("Please check the details.", "விவரங்களை சரிபார்க்கவும்.");

  const totals = {
    orgs: organisers.length,
    active: organisers.filter((o) => o.active).length,
    chits: organisers.reduce((a, o) => a + o.chits, 0),
    ids: organisers.reduce((a, o) => a + o.ids, 0),
  };

  return (
    <div className="relative z-10 mx-auto max-w-5xl px-4 pb-20 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo word={false} size={40} />
          <div>
            <h1 className="font-display text-[24px] font-extrabold leading-tight">Chitty Admin</h1>
            <div className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
              <ShieldCheck size={14} className="text-violet" /> {admin.name} · {fmtMobile(admin.mobile)}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LangToggle />
          <ThemeToggle />
          <form action={logout.bind(null, "admin")}>
            <Button size="sm" icon={<LogOut size={14} />} type="submit">
              {L("Log out", "வெளியேறு")}
            </Button>
          </form>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-2xl items-start gap-2 rounded-2xl border border-[color-mix(in_oklab,var(--violet)_35%,transparent)] bg-[color-mix(in_oklab,var(--violet)_8%,transparent)] px-4 py-3 text-[13px] text-ink-2">
          <Lock size={15} className="mt-0.5 shrink-0 text-violet" />
          {L("You see organisers and usage counts only. Chits, members, Aadhaar and money stay private to each organiser.", "நீங்கள் organisers மற்றும் எண்ணிக்கை மட்டும் பார்க்கலாம். சீட்டுகள், உறுப்பினர்கள், Aadhaar, பணம் ஒவ்வொரு organiser-க்கும் தனிப்பட்டது.")}
        </div>
        <Button variant="gold" icon={<Plus size={16} />} onClick={() => setSheet({ mode: "new" })}>
          {L("New organiser", "புதிய organiser")}
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={<Building2 size={16} />} label={L("Organisers", "Organisers")} value={totals.orgs} />
        <Stat icon={<Power size={16} />} label={L("Active", "செயலில்")} value={totals.active} />
        <Stat icon={<Ticket size={16} />} label={L("Chits", "சீட்டுகள்")} value={totals.chits} />
        <Stat icon={<Users size={16} />} label={L("Member IDs", "Member IDs")} value={totals.ids} />
      </div>

      <div className="card mt-5 overflow-hidden">
        {organisers.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="gold-fill float-slow grid h-16 w-16 place-items-center rounded-3xl">
              <Building2 size={28} />
            </span>
            <div className="font-display text-[19px] font-bold">{L("No organisers yet", "இன்னும் organiser இல்லை")}</div>
            <p className="max-w-sm text-[13.5px] text-ink-2">{L("Create the first organiser. They log in with their mobile number and the password you set, then choose their own.", "முதல் organiser-ஐ உருவாக்குங்கள். அவர்கள் mobile எண் + நீங்கள் கொடுக்கும் password கொண்டு உள்நுழைந்து, பின் சொந்த password அமைப்பார்கள்.")}</p>
            <Button variant="gold" icon={<Plus size={16} />} onClick={() => setSheet({ mode: "new" })}>
              {L("New organiser", "புதிய organiser")}
            </Button>
          </div>
        ) : (
          <motion.ul layout>
            <AnimatePresence initial={false}>
              {organisers.map((o) => (
                <motion.li key={o.id} layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3.5 last:border-0">
                  <div className={cx("font-display grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-[18px] font-extrabold", o.active ? "gold-fill" : "bg-bg-2 text-ink-3")}>{o.businessName[0]?.toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-[15.5px] font-bold">{lang === "ta" && o.businessNameTa ? o.businessNameTa : o.businessName}</span>
                      {o.active ? <Badge tone="ok">{L("Active", "செயலில்")}</Badge> : <Badge tone="danger">{L("Paused", "நிறுத்தம்")}</Badge>}
                    </div>
                    <div className="tabular text-[12.5px] text-ink-3">
                      {o.ownerName} · {fmtMobile(o.mobile)} · {L("since", "முதல்")} {new Date(o.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                    </div>
                  </div>
                  <div className="flex gap-4 text-center">
                    <div>
                      <div className="font-display tabular text-[17px] font-extrabold">{o.chits}</div>
                      <div className="text-[11px] text-ink-3">{L("chits", "சீட்டு")}</div>
                    </div>
                    <div>
                      <div className="font-display tabular text-[17px] font-extrabold">{o.ids}</div>
                      <div className="text-[11px] text-ink-3">IDs</div>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <IconBtn label={L("Edit", "திருத்து")} onClick={() => setSheet({ mode: "edit", org: o })}>
                      <Pencil size={16} />
                    </IconBtn>
                    <IconBtn label={L("Reset password", "Password reset")} onClick={() => setConfirm({ kind: "reset", org: o })}>
                      <KeyRound size={16} />
                    </IconBtn>
                    <button
                      aria-label={o.active ? L("Pause", "நிறுத்து") : L("Enable", "இயக்கு")}
                      onClick={() => setConfirm({ kind: "toggle", org: o })}
                      className={cx("relative h-10 w-[68px] rounded-full border transition-colors", o.active ? "border-transparent bg-ok" : "border-line bg-bg-2")}
                    >
                      <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 32 }} className={cx("absolute top-1 h-8 w-8 rounded-full bg-white shadow", o.active ? "right-1" : "left-1")} />
                    </button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        )}
      </div>

      {/* toggle / reset confirmations */}
      <ConfirmDialog
        open={confirm?.kind === "toggle"}
        tone={confirm?.org.active ? "danger" : "ok"}
        icon={<span className={cx("grid h-14 w-14 place-items-center rounded-full", confirm?.org.active ? "bg-danger-soft text-danger" : "bg-ok-soft text-ok")}><Power size={26} /></span>}
        title={confirm?.org.active ? L(`Pause ${confirm?.org.businessName}?`, `${confirm?.org.businessName}-ஐ நிறுத்தலாமா?`) : L(`Enable ${confirm?.org.businessName ?? ""}?`, `${confirm?.org.businessName ?? ""}-ஐ இயக்கலாமா?`)}
        body={confirm?.org.active ? L("They are signed out now. Member links show “paused”, auctions don't open. Nothing is deleted.", "அவர் உடனே வெளியேற்றப்படுவார். Member links “நிறுத்தம்” காட்டும், ஏலம் திறக்காது. எதுவும் அழியாது.") : L("Everything continues where it stopped.", "நின்ற இடத்திலிருந்து தொடரும்.")}
        yes={L("Yes", "ஆம்")}
        no={L("No", "இல்லை")}
        onNo={() => setConfirm(null)}
        onYes={() => {
          const o = confirm!.org;
          setConfirm(null);
          start(async () => {
            const r = await setOrganiserActiveAction(o.id, !o.active);
            toast(r.ok ? (o.active ? L(`${o.businessName} paused`, `${o.businessName} நிறுத்தப்பட்டது`) : L(`${o.businessName} enabled`, `${o.businessName} இயக்கப்பட்டது`)) : errText(r.error), r.ok ? "ok" : "warn");
          });
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === "reset"}
        icon={<span className="gold-fill grid h-14 w-14 place-items-center rounded-full"><KeyRound size={26} /></span>}
        title={L(`Reset the password for ${confirm?.org.businessName ?? ""}?`, `${confirm?.org.businessName ?? ""}-ன் password-ஐ reset செய்யலாமா?`)}
        body={L("You get a one-time password to give them. They are signed out, and must set their own password at next login.", "அவர்களுக்குக் கொடுக்க ஒரு முறை password கிடைக்கும். அவர் வெளியேற்றப்படுவார்; அடுத்த login-ல் சொந்த password அமைக்க வேண்டும்.")}
        yes={L("Yes, reset", "ஆம், reset")}
        no={L("No", "இல்லை")}
        onNo={() => setConfirm(null)}
        onYes={() => {
          const o = confirm!.org;
          setConfirm(null);
          start(async () => {
            const r = await resetPasswordAction(o.id);
            if (r.ok && r.tempPassword) setTemp({ org: o, pw: r.tempPassword });
            else if (!r.ok) toast(errText(r.error), "warn");
          });
        }}
      />

      {/* one-time password */}
      <Modal open={temp != null} onClose={() => setTemp(null)}>
        {temp && (
          <div className="text-center">
            <span className="gold-fill mx-auto grid h-14 w-14 place-items-center rounded-full">
              <KeyRound size={26} />
            </span>
            <h3 className="font-display mt-3 text-[19px] font-bold">{L("One-time password", "ஒரு முறை password")}</h3>
            <p className="mt-1 text-[13px] text-ink-2">{L(`Give this to ${temp.org.ownerName}. It is shown only now.`, `${temp.org.ownerName}-க்கு கொடுங்கள். இப்போது மட்டும் தெரியும்.`)}</p>
            <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl border border-line-2 bg-[color-mix(in_oklab,var(--ink)_4%,transparent)] px-4 py-3">
              <code className="font-display tabular text-[22px] font-bold tracking-wider">{temp.pw}</code>
              <button
                aria-label={L("Copy", "நகல்")}
                onClick={() => {
                  void navigator.clipboard?.writeText(temp.pw);
                  toast(L("Copied", "நகலெடுக்கப்பட்டது"), "ok");
                }}
                className="grid h-10 w-10 place-items-center rounded-xl text-ink-2 hover:bg-bg-2 hover:text-ink"
              >
                <Copy size={18} />
              </button>
            </div>
            <Button variant="gold" size="lg" className="mt-5 w-full" onClick={() => setTemp(null)}>
              {L("Done", "முடிந்தது")}
            </Button>
          </div>
        )}
      </Modal>

      {/* create / edit */}
      <Modal open={sheet != null} onClose={() => setSheet(null)}>
        {sheet && (
          <OrgForm
            key={sheet.mode === "edit" ? sheet.org.id : "new"}
            sheet={sheet}
            pending={pending}
            onCancel={() => setSheet(null)}
            onSubmit={(data) =>
              new Promise<string | null>((resolve) =>
                start(async () => {
                  const r: ActionResult = sheet.mode === "new" ? await createOrganiserAction(data as never) : await updateOrganiserAction(sheet.org.id, data);
                  if (r.ok) {
                    setSheet(null);
                    toast(sheet.mode === "new" ? L("Organiser created", "Organiser உருவாக்கப்பட்டது") : L("Saved", "சேமிக்கப்பட்டது"), "ok");
                    resolve(null);
                  } else resolve(errText(r.error));
                }),
              )
            }
          />
        )}
      </Modal>
    </div>
  );
}

function OrgForm({
  sheet,
  pending,
  onCancel,
  onSubmit,
}: {
  sheet: NonNullable<Sheet>;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (d: { businessName: string; businessNameTa: string; ownerName: string; mobile: string; password?: string }) => Promise<string | null>;
}) {
  const L = useL();
  const o = sheet.mode === "edit" ? sheet.org : null;
  const [f, setF] = useState({ businessName: o?.businessName ?? "", businessNameTa: o?.businessNameTa ?? "", ownerName: o?.ownerName ?? "", mobile: o?.mobile ?? "", password: "" });
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError(await onSubmit(sheet.mode === "new" ? f : { businessName: f.businessName, businessNameTa: f.businessNameTa, ownerName: f.ownerName, mobile: f.mobile }));
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[19px] font-bold">{sheet.mode === "new" ? L("New organiser", "புதிய organiser") : L("Edit organiser", "Organiser திருத்து")}</h3>
        <button type="button" aria-label={L("Close", "மூடு")} onClick={onCancel} className="text-ink-3">
          <X size={20} />
        </button>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <Input label={L("Business name (members see this)", "நிறுவனப் பெயர் (உறுப்பினர்கள் பார்ப்பது)")} value={f.businessName} onChange={(v) => setF({ ...f, businessName: v })} placeholder="Sri Murugan Chits" required />
        <Input label={L("Business name in Tamil (optional)", "தமிழில் நிறுவனப் பெயர் (விருப்பம்)")} value={f.businessNameTa} onChange={(v) => setF({ ...f, businessNameTa: v })} placeholder="ஸ்ரீ முருகன் சிட்ஸ்" />
        <Input label={L("Owner name", "உரிமையாளர் பெயர்")} value={f.ownerName} onChange={(v) => setF({ ...f, ownerName: v })} placeholder="Murugan" required />
        <Input label={L("Mobile number (login)", "Mobile எண் (login)")} value={f.mobile} onChange={(v) => setF({ ...f, mobile: v })} placeholder="98400 12345" inputMode="tel" required />
        {sheet.mode === "new" && (
          <div>
            <Input label={L("First password (they change it at first login)", "முதல் password (முதல் login-ல் மாற்றுவார்)")} value={f.password} onChange={(v) => setF({ ...f, password: v })} placeholder="8+ characters" required />
            <button type="button" onClick={() => setF({ ...f, password: genPassword() })} className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-gold-ink">
              <Wand2 size={13} /> {L("Generate one", "உருவாக்கு")}
            </button>
          </div>
        )}
      </div>
      <AnimatePresence>
        {error && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div role="alert" className="mt-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13.5px] font-semibold text-danger">
              {error}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <Button variant="gold" size="lg" className="mt-5 w-full" type="submit" disabled={pending}>
        {pending ? L("Saving…", "சேமிக்கிறது…") : sheet.mode === "new" ? L("Create organiser", "Organiser உருவாக்கு") : L("Save", "சேமி")}
      </Button>
    </form>
  );
}

function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-[rgba(8,6,14,.55)] backdrop-blur-sm" onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 32 }} className="card-solid relative max-h-[92vh] w-full max-w-md overflow-y-auto p-6">
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className="grid h-10 w-10 place-items-center rounded-xl border border-line text-ink-2 transition-colors hover:text-ink">
      {children}
    </button>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink-3">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--violet)_14%,transparent)] text-violet">{icon}</span>
        {label}
      </div>
      <CountUp value={value} money={false} className="font-display mt-2 block text-[28px] font-extrabold" />
    </div>
  );
}

function Input({ label, value, onChange, placeholder, inputMode, required }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; inputMode?: "tel"; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-semibold text-ink-2">{label}</span>
      <input
        value={value}
        required={required}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-12 w-full rounded-2xl border border-line-2 bg-[color-mix(in_oklab,var(--ink)_3%,transparent)] px-4 text-[15px] outline-none transition-colors placeholder:text-ink-3 focus:border-gold-3"
      />
    </label>
  );
}
