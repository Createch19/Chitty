"use client";

import { Copy, EyeOff, KeyRound, MessageCircle, RefreshCw, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { chitPinsAction, groupTokenAction, resetPinAction } from "@/app/actions/chits";
import { Button, ConfirmDialog, useToast } from "@/components/ui/kit";
import { useL } from "@/lib/prefs";
import { useErrorText } from "./common";

type Person = { seatId: string; name: string; phone: string; codes: string[]; pin: string };

/** One link for the chit's WhatsApp group, and each person's fixed PIN (sent privately, once). */
export function GroupLinkCard({ chitId, chitCode }: { chitId: string; chitCode: string }) {
  const L = useL();
  const err = useErrorText();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [ask, setAsk] = useState<{ kind: "link" } | { kind: "pin"; p: Person } | null>(null);

  const link = (renew = false) =>
    start(async () => {
      const r = await groupTokenAction(chitId, renew);
      if (!r.ok) return toast(err(r.error), "warn");
      setUrl(`${window.location.origin}/c/${r.data}`);
      if (renew) toast(L("New group link made. The old one stopped.", "புதிய group link தயார். பழையது நின்றுவிட்டது."), "ok");
    });
  const show = () =>
    start(async () => {
      const r = await chitPinsAction(chitId);
      if (!r.ok) return toast(err(r.error), "warn");
      setPeople(r.data!);
    });
  const groupText = L(`Chit ${chitCode}: open this link, choose your ID and enter your PIN.\n${url}`, `சீட்டு ${chitCode}: இந்த link-ஐ திறந்து உங்கள் ID தேர்ந்தெடுத்து PIN போடுங்கள்.\n${url}`);
  const pinText = (p: Person) =>
    L(`Vanakkam ${p.name}! Chit ${chitCode}, ID ${p.codes.join(", ")}. Your PIN: ${p.pin}. Use it with the group link and to bid. Keep it private.`, `வணக்கம் ${p.name}! சீட்டு ${chitCode}, ID ${p.codes.join(", ")}. உங்கள் PIN: ${p.pin}. Group link திறக்கவும் ஏலம் கேட்கவும் இது வேண்டும். யாருக்கும் சொல்ல வேண்டாம்.`);
  const wa = "inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1fa855] font-bold text-white";

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <div className="font-display flex items-center gap-2 text-[17px] font-bold">
          <Users size={18} className="text-gold-ink" /> {L("Group link & PINs", "Group link & PIN")}
        </div>
        <div className="text-[12.5px] text-ink-3">{L("Share one link in the WhatsApp group. Send each person their PIN privately, once.", "WhatsApp group-ல் ஒரே link. ஒவ்வொருவருக்கும் PIN தனியாக, ஒரு முறை.")}</div>
      </div>
      <div className="flex flex-col gap-3 p-5">
        {url ? (
          <>
            <div className="break-all rounded-2xl border border-line-2 px-3 py-2.5 font-mono text-[12px]">{url}</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <a href={`https://wa.me/?text=${encodeURIComponent(groupText)}`} target="_blank" rel="noreferrer" className={`${wa} h-11 text-[14px]`}>
                <MessageCircle size={16} /> {L("Send to group", "Group-க்கு அனுப்பு")}
              </a>
              <Button
                icon={<Copy size={15} />}
                onClick={() =>
                  void navigator.clipboard.writeText(url).then(
                    () => toast(L("Copied", "Copy ஆனது"), "ok"),
                    () => toast(L("Couldn't copy", "Copy ஆகவில்லை"), "warn"),
                  )
                }
              >
                {L("Copy link", "Link copy")}
              </Button>
              <Button variant="plain" icon={<RefreshCw size={15} />} disabled={pending} onClick={() => setAsk({ kind: "link" })}>
                {L("New link", "புதிய link")}
              </Button>
            </div>
          </>
        ) : (
          <Button variant="gold" icon={<MessageCircle size={16} />} disabled={pending} onClick={() => link()}>
            {L("Show group link", "Group link காட்டு")}
          </Button>
        )}
        {people ? (
          <>
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {people.map((p) => (
                <li key={p.seatId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-40">
                    <div className="text-[14px] font-semibold">{p.name}</div>
                    <div className="break-words text-[12px] text-ink-3">{p.codes.join(", ")}</div>
                  </div>
                  <b className="font-mono text-[17px] tracking-[.12em]">{p.pin}</b>
                  <div className="flex gap-2">
                    <a aria-label={L(`Send PIN to ${p.name}`, `${p.name}-க்கு PIN அனுப்பு`)} href={`https://wa.me/91${p.phone}?text=${encodeURIComponent(pinText(p))}`} target="_blank" rel="noreferrer" className={`${wa} h-9 w-11`}>
                      <MessageCircle size={16} />
                    </a>
                    <Button size="sm" variant="plain" aria-label={L(`New PIN for ${p.name}`, `${p.name}-க்கு புதிய PIN`)} disabled={pending} onClick={() => setAsk({ kind: "pin", p })}>
                      <RefreshCw size={15} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <Button variant="plain" icon={<EyeOff size={15} />} onClick={() => setPeople(null)}>
              {L("Hide PINs", "PIN மறை")}
            </Button>
          </>
        ) : (
          <Button icon={<KeyRound size={16} />} disabled={pending} onClick={show}>
            {L("Show member PINs", "உறுப்பினர் PIN காட்டு")}
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={ask != null}
        icon={
          <span className="gold-fill grid h-14 w-14 place-items-center rounded-full">
            <RefreshCw size={26} />
          </span>
        }
        title={ask?.kind === "pin" ? L(`New PIN for ${ask.p.name}?`, `${ask.p.name}-க்கு புதிய PIN?`) : L("Make a new group link?", "புதிய group link?")}
        body={ask?.kind === "pin" ? L("The old PIN stops, and phones that joined with it are signed out.", "பழைய PIN நிற்கும்; அதில் சேர்ந்த phone-கள் வெளியேறும்.") : L("The old link stops. Phones already in stay in.", "பழைய link நிற்கும். ஏற்கனவே சேர்ந்தவர்கள் தொடரலாம்.")}
        yes={L("Yes", "ஆம்")}
        no={L("No", "இல்லை")}
        onNo={() => setAsk(null)}
        onYes={() => {
          const a = ask!;
          setAsk(null);
          if (a.kind === "link") return link(true);
          start(async () => {
            const r = await resetPinAction(a.p.seatId);
            if (!r.ok) return toast(err(r.error), "warn");
            setPeople((x) => x && x.map((p) => (p.seatId === a.p.seatId ? { ...p, pin: r.data! } : p)));
            toast(L("New PIN made. Send it to the member.", "புதிய PIN தயார். உறுப்பினருக்கு அனுப்பவும்."), "ok");
          });
        }}
      />
    </div>
  );
}
