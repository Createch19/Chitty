/** Next.js glue for sessions: cookies, current user, guards. Server-only. */
import "server-only";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { organiser } from "@/db/schema";
import { getAdmin, readSession, type Kind } from "./accounts";

export const COOKIE: Record<Kind, string> = { admin: "chitty_admin", organiser: "chitty_org" };

export async function setSessionCookie(kind: Kind, token: string, expires: Date) {
  (await cookies()).set(COOKIE[kind], token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function clearSessionCookie(kind: Kind) {
  (await cookies()).delete(COOKIE[kind]);
}

export async function sessionToken(kind: Kind) {
  return (await cookies()).get(COOKIE[kind])?.value;
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function currentAdmin() {
  await connection(); // session checks compare against the current time: request-time only
  const db = await getDb();
  const s = await readSession(db, "admin", await sessionToken("admin"));
  return s ? getAdmin(db, s.subjectId) : null;
}

export async function requireAdmin() {
  const a = await currentAdmin();
  if (!a) redirect("/admin/login");
  return a;
}

export async function currentOrganiser() {
  await connection();
  const db = await getDb();
  const s = await readSession(db, "organiser", await sessionToken("organiser"));
  if (!s) return null;
  const [o] = await db
    .select({
      id: organiser.id,
      businessName: organiser.businessName,
      businessNameTa: organiser.businessNameTa,
      ownerName: organiser.ownerName,
      mustChangePassword: organiser.mustChangePassword,
    })
    .from(organiser)
    .where(eq(organiser.id, s.subjectId));
  return o ?? null;
}

export async function requireOrganiser() {
  const o = await currentOrganiser();
  if (!o) redirect("/login");
  return o;
}
