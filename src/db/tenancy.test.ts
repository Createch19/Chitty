/**
 * SaaS isolation: organiser B must never read, change or point at organiser A's data,
 * whatever query the app (or a bug in it) sends. Enforced by PostgreSQL itself.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createDb, type Handle } from "./client";
import { auditLog, bid, chit, month, organiser, seat } from "./schema";
import { withOrganiser } from "./tenant";
import { createOrganiser } from "@/server/accounts";

let h: Handle;
let A: string;
let B: string;
let chitA: string;
let seatA: string;
let monthA: string;
const ADMIN = "00000000-0000-0000-0000-000000000000";

/** Drizzle wraps PostgreSQL errors ("Failed query: …"); the database's reason is in .cause. */
async function denied(p: Promise<unknown>, reason: RegExp) {
  const err = await p.then(
    () => null,
    (e: unknown) => e as Error & { cause?: Error },
  );
  expect(err, "expected the database to refuse").not.toBeNull();
  expect(`${err!.message} ${err!.cause?.message ?? ""}`).toMatch(reason);
}

const chitRow = (organiserId: string, code: string) => ({
  organiserId,
  code,
  totalPaise: 50_000_000,
  months: 20,
  rateBps: 150,
  incrementPaise: 50_000,
});

beforeAll(async () => {
  h = await createDb();
  A = await createOrganiser(h.db, ADMIN, { businessName: "Org A", ownerName: "A", mobile: "9000000001", password: "password-a-1" });
  B = await createOrganiser(h.db, ADMIN, { businessName: "Org B", ownerName: "B", mobile: "9000000002", password: "password-b-1" });
  await withOrganiser(h.db, A, async (tx) => {
    [{ id: chitA }] = await tx.insert(chit).values(chitRow(A, "A")).returning({ id: chit.id });
    [{ id: seatA }] = await tx.insert(seat).values({ organiserId: A, chitId: chitA, number: 1, name: "Murugan", phone: "9840011111", isOrganiser: true }).returning({ id: seat.id });
    [{ id: monthA }] = await tx
      .insert(month)
      .values({ organiserId: A, chitId: chitA, month: 2, auctionDate: "2026-12-10", bidding: true, minDiscountPaise: 14_250_000, status: "open" })
      .returning({ id: month.id });
    await tx.insert(bid).values({ organiserId: A, monthId: monthA, seatId: seatA, amountPaise: 14_300_000 });
  });
});
afterAll(() => h.close());

describe("organiser B against organiser A", () => {
  it("cannot see A's chits, seats, months or bids", async () => {
    const seen = await withOrganiser(h.db, B, async (tx) => ({
      chits: await tx.select().from(chit),
      seats: await tx.select().from(seat),
      months: await tx.select().from(month),
      bids: await tx.select().from(bid),
      byId: await tx.select().from(chit).where(eq(chit.id, chitA)),
    }));
    expect(seen).toEqual({ chits: [], seats: [], months: [], bids: [], byId: [] });
    // …while A sees its own
    const mine = await withOrganiser(h.db, A, (tx) => tx.select().from(chit));
    expect(mine.map((c) => c.id)).toEqual([chitA]);
  });

  it("cannot update or delete A's rows (0 rows affected)", async () => {
    const res = await withOrganiser(h.db, B, async (tx) => ({
      upd: await tx.update(chit).set({ code: "HACK" }).where(eq(chit.id, chitA)).returning(),
      del: await tx.delete(seat).where(eq(seat.id, seatA)).returning(),
    }));
    expect(res).toEqual({ upd: [], del: [] });
    const [c] = await withOrganiser(h.db, A, (tx) => tx.select().from(chit).where(eq(chit.id, chitA)));
    expect(c.code).toBe("A");
  });

  it("cannot insert rows under A's organiser_id", async () => {
    await denied(withOrganiser(h.db, B, (tx) => tx.insert(chit).values(chitRow(A, "Z"))), /row-level security/i);
  });

  it("cannot attach its own rows to A's chit (same-organiser foreign keys)", async () => {
    await denied(withOrganiser(h.db, B, (tx) => tx.insert(seat).values({ organiserId: B, chitId: chitA, number: 2, name: "X", phone: "9840022222" })), /foreign key/i);
    await denied(withOrganiser(h.db, B, (tx) => tx.insert(bid).values({ organiserId: B, monthId: monthA, seatId: seatA, amountPaise: 99_00_000 })), /foreign key/i);
  });

  it("sees only its own organiser profile and never a password hash", async () => {
    const rows = await withOrganiser(h.db, B, (tx) => tx.select({ id: organiser.id, name: organiser.businessName }).from(organiser));
    expect(rows).toEqual([{ id: B, name: "Org B" }]);
    await denied(withOrganiser(h.db, B, (tx) => tx.select({ h: organiser.passwordHash }).from(organiser)), /permission denied/i);
  });

  it("cannot read the Super Admin, sessions or login tables at all", async () => {
    for (const t of ["super_admin", "session", "login_attempt"]) {
      await denied(withOrganiser(h.db, B, (tx) => tx.execute(sql.raw(`select * from ${t}`))), /permission denied/i);
    }
  });

  it("without an organiser id, the app role sees nothing", async () => {
    const rows = await h.db.transaction(async (tx) => {
      await tx.execute(sql`set local role chitty_app`);
      return tx.select().from(chit);
    });
    expect(rows).toEqual([]);
  });

  it("rejects a malformed organiser id before touching the database", async () => {
    await expect(withOrganiser(h.db, "' or 1=1 --", async () => 1)).rejects.toThrow(/invalid organiser id/);
  });
});

describe("append-only data", () => {
  it("bids can never be edited or withdrawn, even by their own organiser", async () => {
    await denied(withOrganiser(h.db, A, (tx) => tx.update(bid).set({ amountPaise: 1 })), /permission denied|append-only/);
    await denied(withOrganiser(h.db, A, (tx) => tx.delete(bid)), /permission denied|append-only/);
    // not even the owner connection can
    await denied(h.db.delete(bid), /append-only/);
  });
  it("audit rows cannot be changed or deleted", async () => {
    await denied(h.db.delete(auditLog), /append-only/);
    await denied(h.db.update(auditLog).set({ action: "x" }), /append-only/);
  });
});
