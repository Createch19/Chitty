"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { AccountError, attemptLogin, changeOrganiserPassword, createSession, endSession, type Kind } from "@/server/accounts";
import { clearSessionCookie, clientIp, requireOrganiser, sessionToken, setSessionCookie } from "@/server/session";

export type FormState = { error?: string; mobile?: string } | undefined;

async function login(kind: Kind, form: FormData): Promise<FormState> {
  const db = await getDb();
  const r = await attemptLogin(db, kind, String(form.get("mobile") ?? ""), String(form.get("password") ?? ""), await clientIp());
  if (!r.ok) return { error: r.code, mobile: String(form.get("mobile") ?? "").slice(0, 20) };
  const { token, expiresAt } = await createSession(db, kind, r.subjectId);
  await setSessionCookie(kind, token, expiresAt);
  if (kind === "admin") redirect("/admin");
  redirect(r.mustChangePassword ? "/app/password" : "/app");
}

export async function adminLogin(_: FormState, form: FormData) {
  return login("admin", form);
}

export async function organiserLogin(_: FormState, form: FormData) {
  return login("organiser", form);
}

export async function logout(kind: Kind) {
  const db = await getDb();
  await endSession(db, await sessionToken(kind));
  await clearSessionCookie(kind);
  redirect(kind === "admin" ? "/admin/login" : "/login");
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireOrganiser();
  const next = String(form.get("next") ?? "");
  if (next !== String(form.get("confirm") ?? "")) return { error: "MISMATCH" };
  try {
    await changeOrganiserPassword(await getDb(), me.id, String(form.get("current") ?? ""), next);
  } catch (e) {
    if (e instanceof AccountError) return { error: e.code };
    throw e;
  }
  redirect("/app");
}
