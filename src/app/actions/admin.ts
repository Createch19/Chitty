"use server";

/**
 * Super Admin actions. Every action re-checks the admin session itself: server actions are
 * public HTTP endpoints, so the page being "admin only" is not protection on its own.
 */
import { refresh } from "next/cache";
import { getDb } from "@/db/client";
import {
  AccountError,
  createOrganiser,
  deleteOrganiser,
  resetOrganiserPassword,
  setOrganiserActive,
  updateOrganiser,
  type OrganiserInput,
} from "@/server/accounts";
import { requireAdmin } from "@/server/session";

export type ActionResult = { ok: true; tempPassword?: string } | { ok: false; error: string };

async function run(fn: (adminId: string) => Promise<string | void>): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    const out = await fn(admin.id);
    refresh();
    return { ok: true, ...(typeof out === "string" ? { tempPassword: out } : {}) };
  } catch (e) {
    if (e instanceof AccountError) return { ok: false, error: e.code };
    throw e;
  }
}

export async function createOrganiserAction(input: OrganiserInput & { password: string }) {
  return run(async (adminId) => {
    await createOrganiser(await getDb(), adminId, input);
  });
}

export async function updateOrganiserAction(id: string, input: OrganiserInput) {
  return run(async (adminId) => updateOrganiser(await getDb(), adminId, id, input));
}

export async function setOrganiserActiveAction(id: string, active: boolean) {
  return run(async (adminId) => setOrganiserActive(await getDb(), adminId, id, active));
}

export async function resetPasswordAction(id: string) {
  return run(async (adminId) => resetOrganiserPassword(await getDb(), adminId, id));
}

export async function deleteOrganiserAction(id: string, input: { name: string; password: string }) {
  return run(async (adminId) => {
    await deleteOrganiser(await getDb(), adminId, id, input);
  });
}
