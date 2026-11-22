"use server";

/** Organiser actions. Each one re-checks the organiser session; all data access is RLS-scoped. */
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import {
  addSeat,
  changeAuctionDate,
  ChitError,
  closeAuction,
  createChit,
  deleteChit,
  updateChit,
  markPayout,
  openMonth,
  removeSeat,
  runLottery,
  setOrganiserSeat,
  setPaid,
  startChit,
  undoPayout,
  updateSeat,
  type NewChit,
} from "@/server/chits";
import { issueLink, revokeLink } from "@/server/members";
import { setAadhaar, showAadhaar, transferSeat } from "@/server/people";
import { requireOrganiser } from "@/server/session";

export type Result<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

async function run<T>(fn: (orgId: string) => Promise<T>): Promise<Result<T>> {
  const me = await requireOrganiser();
  if (me.mustChangePassword) return { ok: false, error: "MUST_CHANGE_PASSWORD" };
  try {
    const data = await fn(me.id);
    refresh();
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ChitError) return { ok: false, error: e.code };
    throw e;
  }
}

export async function createChitAction(input: NewChit) {
  const r = await run(async (org) => createChit(await getDb(), org, input));
  if (r.ok) redirect(`/app/chits/${r.data}`);
  return r;
}

export async function updateChitAction(chitId: string, input: NewChit & { code: string }) {
  const r = await run(async (org) => updateChit(await getDb(), org, chitId, input));
  if (r.ok) redirect(`/app/chits/${chitId}`);
  return r;
}

export async function deleteChitAction(chitId: string) {
  const r = await run(async (org) => deleteChit(await getDb(), org, chitId));
  if (r.ok) redirect("/app");
  return r;
}

export const addSeatAction = async (chitId: string, input: { name: string; phone: string }) => run(async (org) => addSeat(await getDb(), org, chitId, input));
export const updateSeatAction = async (seatId: string, input: { name: string; phone: string }) => run(async (org) => updateSeat(await getDb(), org, seatId, input));
export const removeSeatAction = async (seatId: string) => run(async (org) => removeSeat(await getDb(), org, seatId));
export const setOrganiserSeatAction = async (chitId: string, seatId: string) => run(async (org) => setOrganiserSeat(await getDb(), org, chitId, seatId));
export const startChitAction = async (chitId: string, startDate: string) => run(async (org) => startChit(await getDb(), org, chitId, startDate));
export const openMonthAction = async (monthId: string) => run(async (org) => openMonth(await getDb(), org, monthId));
export const changeDateAction = async (monthId: string, date: string) => run(async (org) => changeAuctionDate(await getDb(), org, monthId, date));
export const closeAuctionAction = async (monthId: string) => run(async (org) => closeAuction(await getDb(), org, monthId));
export const lotteryAction = async (monthId: string) => run(async (org) => runLottery(await getDb(), org, monthId));
export const setPaidAction = async (monthId: string, seatId: string, paid: boolean) => run(async (org) => setPaid(await getDb(), org, monthId, seatId, paid));
export const payoutAction = async (monthId: string) => run(async (org) => markPayout(await getDb(), org, monthId));
export const undoPayoutAction = async (monthId: string) => run(async (org) => undoPayout(await getDb(), org, monthId));

/* member links (BUSINESS-CONCEPT §10): the token comes back once, to build the WhatsApp message */
export const issueLinkAction = async (seatId: string) => run(async (org) => issueLink(await getDb(), org, seatId));
export const revokeLinkAction = async (seatId: string) => run(async (org) => revokeLink(await getDb(), org, seatId));

/* member details (BUSINESS-CONCEPT §10) */
export const setAadhaarAction = async (seatId: string, value: string) => run(async (org) => setAadhaar(await getDb(), org, seatId, value));
export const showAadhaarAction = async (seatId: string) => run(async (org) => showAadhaar(await getDb(), org, seatId));
export const transferSeatAction = async (seatId: string, input: { name: string; phone: string; aadhaar?: string }) => run(async (org) => transferSeat(await getDb(), org, seatId, input));
