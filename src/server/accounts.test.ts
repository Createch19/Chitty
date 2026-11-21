import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Handle } from "@/db/client";
import { chit, organiser, seat } from "@/db/schema";
import { withOrganiser } from "@/db/tenant";
import {
  attemptLogin,
  changeOrganiserPassword,
  createOrganiser,
  createSession,
  endSession,
  ensureSuperAdmin,
  hashPassword,
  listOrganisers,
  normalizeMobile,
  readSession,
  resetOrganiserPassword,
  setOrganiserActive,
  updateOrganiser,
  verifyPassword,
} from "./accounts";

let h: Handle;
let adminId: string;
const IP = "203.0.113.7";

beforeAll(async () => {
  h = await createDb();
});
afterAll(() => h.close());

describe("passwords and mobiles", () => {
  it("scrypt hashes are salted and verify only the right password", async () => {
    const a = await hashPassword("correct horse");
    const b = await hashPassword("correct horse");
    expect(a).not.toBe(b);
    expect(await verifyPassword("correct horse", a)).toBe(true);
    expect(await verifyPassword("wrong horse!", a)).toBe(false);
    expect(await verifyPassword("correct horse", "garbage")).toBe(false);
    await expect(hashPassword("short")).rejects.toThrow("PASSWORD_TOO_SHORT");
  });
  it("normalises Indian mobile numbers", () => {
    expect(normalizeMobile("+91 98400 12345")).toBe("9840012345");
    expect(normalizeMobile("098400-12345")).toBe("9840012345");
    expect(() => normalizeMobile("12345")).toThrow("INVALID_MOBILE");
  });
});

describe("Super Admin", () => {
  it("is created once by the seed, then left alone", async () => {
    expect(await ensureSuperAdmin(h.db, { mobile: "9000000009", password: "admin-pass-1" })).toBe("created");
    expect(await ensureSuperAdmin(h.db, { mobile: "9000000008", password: "other-pass-1" })).toBe("exists");
    const r = await attemptLogin(h.db, "admin", "9000000009", "admin-pass-1", IP);
    expect(r.ok).toBe(true);
    if (r.ok) adminId = r.subjectId;
    expect(await attemptLogin(h.db, "admin", "9000000008", "other-pass-1", IP)).toEqual({ ok: false, code: "INVALID" });
  });

  it("admin and organiser logins are separate even with the same mobile", async () => {
    await createOrganiser(h.db, adminId, { businessName: "Owner's chits", ownerName: "Owner", mobile: "9000000009", password: "organiser-pass-1" });
    expect((await attemptLogin(h.db, "organiser", "9000000009", "admin-pass-1", IP)).ok).toBe(false);
    expect((await attemptLogin(h.db, "organiser", "9000000009", "organiser-pass-1", IP)).ok).toBe(true);
  });
});

describe("organisers managed by the Super Admin", () => {
  let id: string;

  it("create: must change the first password; duplicate mobiles refused", async () => {
    id = await createOrganiser(h.db, adminId, { businessName: "Sri Murugan Chits", businessNameTa: "ஸ்ரீ முருகன் சிட்ஸ்", ownerName: "Murugan", mobile: "98400 12345", password: "first-pass-1" });
    const r = await attemptLogin(h.db, "organiser", "9840012345", "first-pass-1", IP);
    expect(r).toMatchObject({ ok: true, mustChangePassword: true });
    await expect(createOrganiser(h.db, adminId, { businessName: "Copy", ownerName: "C", mobile: "9840012345", password: "whatever-1" })).rejects.toThrow("MOBILE_TAKEN");
  });

  it("edit details", async () => {
    await updateOrganiser(h.db, adminId, id, { businessName: "Sri Murugan Chit Funds", ownerName: "Murugan", mobile: "9840012345" });
    const [o] = await h.db.select().from(organiser).where(eq(organiser.id, id));
    expect(o.businessName).toBe("Sri Murugan Chit Funds");
  });

  it("usage counts show chits and member IDs, nothing else", async () => {
    await withOrganiser(h.db, id, async (tx) => {
      const [c] = await tx.insert(chit).values({ organiserId: id, code: "A", totalPaise: 50_000_000, months: 20, rateBps: 150, incrementPaise: 50_000 }).returning();
      await tx.insert(seat).values([1, 2, 3].map((n) => ({ organiserId: id, chitId: c.id, number: n, name: `M${n}`, phone: "9840011111" })));
    });
    const list = await listOrganisers(h.db);
    const row = list.find((o) => o.id === id)!;
    expect(row).toMatchObject({ chits: 1, ids: 3, active: true });
    expect(Object.keys(row)).not.toContain("passwordHash");
  });

  it("disable: login refused and existing sessions die; enable brings it back", async () => {
    const { token } = await createSession(h.db, "organiser", id);
    expect(await readSession(h.db, "organiser", token)).toEqual({ subjectId: id });
    await setOrganiserActive(h.db, adminId, id, false);
    expect(await readSession(h.db, "organiser", token)).toBeNull();
    expect(await attemptLogin(h.db, "organiser", "9840012345", "first-pass-1", IP)).toEqual({ ok: false, code: "DISABLED" });
    await setOrganiserActive(h.db, adminId, id, true);
    expect((await attemptLogin(h.db, "organiser", "9840012345", "first-pass-1", IP)).ok).toBe(true);
  });

  it("reset password: one-time password works, old one doesn't, then the organiser sets their own", async () => {
    const temp = await resetOrganiserPassword(h.db, adminId, id);
    expect(temp).toMatch(/^[A-Za-z2-9]{10}$/);
    expect((await attemptLogin(h.db, "organiser", "9840012345", "first-pass-1", IP)).ok).toBe(false);
    expect(await attemptLogin(h.db, "organiser", "9840012345", temp, IP)).toMatchObject({ ok: true, mustChangePassword: true });
    await expect(changeOrganiserPassword(h.db, id, "not-it-at-all", "my-new-pass-1")).rejects.toThrow("WRONG_PASSWORD");
    await changeOrganiserPassword(h.db, id, temp, "my-new-pass-1");
    expect(await attemptLogin(h.db, "organiser", "9840012345", "my-new-pass-1", IP)).toMatchObject({ ok: true, mustChangePassword: false });
  });
});

describe("login rate limit", () => {
  it("5 wrong passwords lock that mobile for 15 minutes, even for the right password", async () => {
    await createOrganiser(h.db, adminId, { businessName: "Lock test", ownerName: "L", mobile: "9000000077", password: "right-pass-1" });
    const t0 = new Date("2026-12-01T10:00:00Z");
    for (let i = 0; i < 5; i++) expect(await attemptLogin(h.db, "organiser", "9000000077", "wrong-pass", "198.51.100.1", t0)).toMatchObject({ code: "INVALID" });
    expect(await attemptLogin(h.db, "organiser", "9000000077", "right-pass-1", "198.51.100.1", t0)).toEqual({ ok: false, code: "LOCKED" });
    const later = new Date(t0.getTime() + 16 * 60_000);
    expect((await attemptLogin(h.db, "organiser", "9000000077", "right-pass-1", "198.51.100.1", later)).ok).toBe(true);
  });
});

describe("sessions", () => {
  it("expire after 30 days, slide when used, and end on logout", async () => {
    const t0 = new Date("2026-12-01T00:00:00Z");
    const { token } = await createSession(h.db, "admin", adminId, t0);
    const day = 86_400_000;
    expect(await readSession(h.db, "admin", token, new Date(t0.getTime() + 20 * day))).toEqual({ subjectId: adminId }); // slides to day 50
    expect(await readSession(h.db, "admin", token, new Date(t0.getTime() + 45 * day))).toEqual({ subjectId: adminId });
    expect(await readSession(h.db, "admin", "not-a-real-token")).toBeNull();
    expect(await readSession(h.db, "organiser", token, new Date(t0.getTime() + 21 * day))).toBeNull(); // wrong kind
    await endSession(h.db, token);
    expect(await readSession(h.db, "admin", token, new Date(t0.getTime() + 46 * day))).toBeNull();
  });
});
