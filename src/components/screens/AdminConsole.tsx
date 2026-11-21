"use client";

import { AnimatePresence, motion } from "motion/react";
import { Building2, KeyRound, Lock, Plus, Power, ShieldCheck, Ticket, Users, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/brand";
import { Badge, Button, ConfirmDialog, CountUp, cx, useToast } from "@/components/ui/kit";
import { useL } from "@/lib/prefs";

type Org = { id: number; business: string; owner: string; mobile: string; chits: number; ids: number; active: boolean; since: string };

const INITIAL: Org[] = [
  { id: 1, business: "Sri Murugan Chits", owner: "Murugan", mobile: "98400 1•••0", chits: 3, ids: 49, active: true, since: "Nov 2026" },
  { id: 2, business: "Lakshmi Chit Funds", owner: "Lakshmi", mobile: "94430 2•••8", chits: 4, ids: 70, active: true, since: "Nov 2026" },
  { id: 3, business: "Kaveri Savings", owner: "Senthil", mobile: "90030 5•••1", chits: 1, ids: 15, active: false, since: "Oct 2026" },
  { id: 4, business: "Demo organiser", owner: "Test", mobile: "90000 0•••0", chits: 1, ids: 20, active: true, since: "Nov 2026" },
];

export function AdminConsole() {
  const L = useL();
  const toast = useToast();
  const [orgs, setOrgs] = useState(INITIAL);
  const [confirm, setConfirm] = useState<Org | null>(null);
  const [sheet, setSheet] = useState(false);
  const [form, setForm] = useState({ business: "", owner: "", mobile: "", password: "" });

  const active = orgs.filter((o) => o.active).length;
  const add = () => {
    if (!form.business || form.mobile.replace(/\D/g, "").length !== 10) return;
    const m = form.mobile.replace(/\D/g, "");
    setOrgs((o) => [{ id: Date.now(), business: form.business, owner: form.owner || "—", mobile: `${m.slice(0, 5)} ${m[5]}•••${m[9]}`, chits: 0, ids: 0, active: true, since: "Dec 2026" }, ...o]);
    setSheet(false);
    setForm({ business: "", owner: "", mobile: "", password: "" });
    toast(L("Organiser created", "Organiser உருவாக்கப்பட்டது"), "ok");
  };

  return (
    <div className="relative z-10 mx-auto max-w-5xl px-4 pb-20 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo word={false} size={40} />
          <div>
            <h1 className="font-display text-[24px] font-extrabold leading-tight">Chitty Admin</h1>
            <div className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
              <ShieldCheck size={14} className="text-violet" /> {L("Super Admin", "Super Admin")}
            </div>
          </div>
        </div>
        <Button variant="gold" icon={<Plus size={16} />} onClick={() => setSheet(true)}>
          {L("New organiser", "புதிய organiser")}
        </Button>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-[color-mix(in_oklab,var(--violet)_35%,transparent)] bg-[color-mix(in_oklab,var(--violet)_8%,transparent)] px-4 py-3 text-[13px] text-ink-2">
        <Lock size={15} className="mt-0.5 shrink-0 text-violet" />
        {L("You see organisers and usage counts only. Chits, members, Aadhaar and money stay private to each organiser.", "நீங்கள் organisers மற்றும் எண்ணிக்கை மட்டும் பார்க்கலாம். சீட்டுகள், உறுப்பினர்கள், Aadhaar, பணம் ஒவ்வொரு organiser-க்கும் தனிப்பட்டது.")}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={<Building2 size={16} />} label={L("Organisers", "Organisers")} value={orgs.length} />
        <Stat icon={<Power size={16} />} label={L("Active", "செயலில்")} value={active} />
        <Stat icon={<Ticket size={16} />} label={L("Chits", "சீட்டுகள்")} value={orgs.reduce((a, o) => a + o.chits, 0)} />
        <Stat icon={<Users size={16} />} label={L("Member IDs", "Member IDs")} value={orgs.reduce((a, o) => a + o.ids, 0)} />
      </div>

      <div className="card mt-5 overflow-hidden">
        <motion.ul layout>
          <AnimatePresence initial={false}>
            {orgs.map((o) => (
              <motion.li key={o.id} layout initial={{ opacity: 0, y: -12, backgroundColor: "rgba(255,211,77,.18)" }} animate={{ opacity: 1, y: 0, backgroundColor: "rgba(255,211,77,0)" }} transition={{ duration: 0.5 }} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3.5 last:border-0">
                <div className={cx("font-display grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-[18px] font-extrabold", o.active ? "gold-fill" : "bg-bg-2 text-ink-3")}>{o.business[0]}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-[15.5px] font-bold">{o.business}</span>
                    {o.active ? <Badge tone="ok">{L("Active", "செயலில்")}</Badge> : <Badge tone="danger">{L("Paused", "நிறுத்தம்")}</Badge>}
                  </div>
                  <div className="tabular text-[12.5px] text-ink-3">
                    {o.owner} · {o.mobile} · {L("since", "முதல்")} {o.since}
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
                  <button aria-label={L("Reset password", "Password reset")} onClick={() => toast(L(`Temporary password set for ${o.business}`, `${o.business}-க்கு தற்காலிக password`), "gold")} className="grid h-10 w-10 place-items-center rounded-xl border border-line text-ink-2 hover:text-ink">
                    <KeyRound size={17} />
                  </button>
                  <button
                    aria-label={o.active ? L("Disable", "நிறுத்து") : L("Enable", "இயக்கு")}
                    onClick={() => setConfirm(o)}
                    className={cx("relative h-10 w-[68px] rounded-full border transition-colors", o.active ? "border-transparent bg-ok" : "border-line bg-bg-2")}
                  >
                    <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 32 }} className={cx("absolute top-1 h-8 w-8 rounded-full bg-white shadow", o.active ? "right-1" : "left-1")} />
                  </button>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      </div>

      <ConfirmDialog
        open={confirm != null}
        tone={confirm?.active ? "danger" : "ok"}
        icon={<span className={cx("grid h-14 w-14 place-items-center rounded-full", confirm?.active ? "bg-danger-soft text-danger" : "bg-ok-soft text-ok")}><Power size={26} /></span>}
        title={confirm?.active ? L(`Pause ${confirm?.business}?`, `${confirm?.business}-ஐ நிறுத்தலாமா?`) : L(`Enable ${confirm?.business ?? ""}?`, `${confirm?.business ?? ""}-ஐ இயக்கலாமா?`)}
        body={confirm?.active ? L("Their login stops, member links show “paused”, auctions don't open. Nothing is deleted.", "அவர் login நிற்கும், member links “நிறுத்தம்” காட்டும், ஏலம் திறக்காது. எதுவும் அழியாது.") : L("Everything continues where it stopped.", "நின்ற இடத்திலிருந்து தொடரும்.")}
        yes={L("Yes", "ஆம்")}
        no={L("No", "இல்லை")}
        onNo={() => setConfirm(null)}
        onYes={() => {
          const c = confirm;
          setConfirm(null);
          if (c) setOrgs((list) => list.map((o) => (o.id === c.id ? { ...o, active: !o.active } : o)));
        }}
      />

      <AnimatePresence>
        {sheet && (
          <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-[rgba(8,6,14,.55)] backdrop-blur-sm" onClick={() => setSheet(false)} />
            <motion.form
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="card-solid relative w-full max-w-md p-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-[19px] font-bold">{L("New organiser", "புதிய organiser")}</h3>
                <button type="button" aria-label={L("Close", "மூடு")} onClick={() => setSheet(false)} className="text-ink-3">
                  <X size={20} />
                </button>
              </div>
              <div className="mt-4 flex flex-col gap-3">
                <Field label={L("Business name (members see this)", "நிறுவனப் பெயர் (உறுப்பினர்கள் பார்ப்பது)")} value={form.business} onChange={(v) => setForm({ ...form, business: v })} placeholder="Sri Murugan Chits" />
                <Field label={L("Owner name", "உரிமையாளர் பெயர்")} value={form.owner} onChange={(v) => setForm({ ...form, owner: v })} placeholder="Murugan" />
                <Field label={L("Mobile number (login)", "Mobile எண் (login)")} value={form.mobile} onChange={(v) => setForm({ ...form, mobile: v })} placeholder="98400 12345" inputMode="numeric" />
                <Field label={L("First password", "முதல் password")} value={form.password} onChange={(v) => setForm({ ...form, password: v })} placeholder="••••••••" type="password" />
              </div>
              <Button variant="gold" size="lg" className="mt-5 w-full" type="submit">
                {L("Create organiser", "Organiser உருவாக்கு")}
              </Button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
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

function Field({ label, value, onChange, placeholder, type = "text", inputMode }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; inputMode?: "numeric" }) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-semibold text-ink-2">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-12 w-full rounded-2xl border border-line-2 bg-[color-mix(in_oklab,var(--ink)_3%,transparent)] px-4 text-[15px] outline-none transition-colors placeholder:text-ink-3 focus:border-gold-3"
      />
    </label>
  );
}
