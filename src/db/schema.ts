/**
 * Chitty data model (docs/BUSINESS-CONCEPT.md).
 * - Money is integer paise (bigint) everywhere.
 * - Every organiser-owned table carries organiser_id; PostgreSQL Row-Level Security
 *   (drizzle/0001_rls.sql) makes sure one organiser can never read or write another's rows.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  customType,
  foreignKey,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
const paise = (name: string) => bigint(name, { mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/* ---------------- platform (not tenant data) ---------------- */

export const superAdmin = pgTable("super_admin", {
  id: uuid("id").primaryKey().defaultRandom(),
  mobile: text("mobile").notNull().unique(),
  name: text("name").notNull().default("Super Admin"),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const organiser = pgTable(
  "organiser",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessName: text("business_name").notNull(),
    businessNameTa: text("business_name_ta"),
    ownerName: text("owner_name").notNull(),
    mobile: text("mobile").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    active: boolean("active").notNull().default(true),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    lang: text("lang").notNull().default("en"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("organiser_mobile_10", sql`${t.mobile} ~ '^[6-9][0-9]{9}$'`), check("organiser_lang", sql`${t.lang} in ('en','ta')`)],
);

/** Login sessions for both kinds of account. Only the SHA-256 of the cookie token is stored. */
export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    kind: text("kind").notNull(),
    subjectId: uuid("subject_id").notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [check("session_kind", sql`${t.kind} in ('admin','organiser')`), index("session_subject").on(t.kind, t.subjectId)],
);

/** Failed logins, for rate limiting (key = "organiser:<mobile>" or "ip:<addr>"). */
export const loginAttempt = pgTable(
  "login_attempt",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    key: text("key").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempt_key_at").on(t.key, t.at)],
);

/* ---------------- tenant data (RLS on organiser_id) ---------------- */

export const chit = pgTable(
  "chit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organiserId: uuid("organiser_id").notNull().references(() => organiser.id),
    code: text("code").notNull(),
    totalPaise: paise("total_paise").notNull(),
    months: integer("months").notNull(),
    rateBps: integer("rate_bps").notNull(), // monthly rate in basis points of the total (1.5% = 150)
    incrementPaise: paise("increment_paise").notNull(),
    openTime: time("open_time").notNull().default("09:00"),
    display: text("display").notNull().default("id"),
    status: text("status").notNull().default("draft"),
    startDate: date("start_date"),
    groupToken: text("group_token").unique(), // the one link shared in the chit's WhatsApp group; useless without a PIN
    createdAt: createdAt(),
  },
  (t) => [
    unique("chit_code_per_organiser").on(t.organiserId, t.code),
    unique("chit_id_org").on(t.id, t.organiserId),
    check("chit_months", sql`${t.months} between 2 and 120`),
    check("chit_total", sql`${t.totalPaise} > 0 and ${t.totalPaise} % ${t.months} = 0`),
    check("chit_rate", sql`${t.rateBps} between 1 and 10000`),
    check("chit_increment", sql`${t.incrementPaise} > 0 and ${t.incrementPaise} < ${t.totalPaise}`),
    check("chit_display", sql`${t.display} in ('id','name')`),
    check("chit_status", sql`${t.status} in ('draft','active','completed')`),
    check("chit_start_day", sql`${t.startDate} is null or extract(day from ${t.startDate}) between 1 and 28`),
  ],
);

/** One seat = one member ID (A01 …). Names and phones need not be unique. */
export const seat = pgTable(
  "seat",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organiserId: uuid("organiser_id").notNull().references(() => organiser.id),
    chitId: uuid("chit_id").notNull().references(() => chit.id),
    number: integer("number").notNull(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    aadhaarEnc: bytea("aadhaar_enc"),
    aadhaarLast4: text("aadhaar_last4"),
    pinEnc: bytea("pin_enc"), // sealed like Aadhaar; the organiser can show it again
    isOrganiser: boolean("is_organiser").notNull().default(false),
    lang: text("lang").notNull().default("en"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("seat_number_per_chit").on(t.chitId, t.number),
    unique("seat_id_org").on(t.id, t.organiserId),
    // composite FK: a seat can only point at a chit of the SAME organiser (RLS alone can't stop that)
    foreignKey({ name: "seat_chit_same_org", columns: [t.chitId, t.organiserId], foreignColumns: [chit.id, chit.organiserId] }),
    check("seat_number", sql`${t.number} >= 1`),
    check("seat_phone", sql`${t.phone} ~ '^[6-9][0-9]{9}$'`),
    check("seat_last4", sql`${t.aadhaarLast4} is null or ${t.aadhaarLast4} ~ '^[0-9]{4}$'`),
  ],
);

/** One row per chit month. */
export const month = pgTable(
  "month",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organiserId: uuid("organiser_id").notNull().references(() => organiser.id),
    chitId: uuid("chit_id").notNull().references(() => chit.id),
    month: integer("month").notNull(),
    auctionDate: date("auction_date").notNull(),
    bidding: boolean("bidding").notNull(),
    minDiscountPaise: paise("min_discount_paise").notNull(),
    status: text("status").notNull().default("pending"),
    discountPaise: paise("discount_paise"),
    winnerSeatId: uuid("winner_seat_id").references(() => seat.id),
    lottery: boolean("lottery").notNull().default(false),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    unique("month_per_chit").on(t.chitId, t.month),
    unique("month_id_org").on(t.id, t.organiserId),
    foreignKey({ name: "month_chit_same_org", columns: [t.chitId, t.organiserId], foreignColumns: [chit.id, chit.organiserId] }),
    foreignKey({ name: "month_winner_same_org", columns: [t.winnerSeatId, t.organiserId], foreignColumns: [seat.id, seat.organiserId] }),
    unique("month_one_win_per_seat").on(t.chitId, t.winnerSeatId),
    check("month_status", sql`${t.status} in ('pending','open','closed')`),
  ],
);

/** Bids are append-only (trigger in 0001_rls.sql). */
export const bid = pgTable(
  "bid",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    organiserId: uuid("organiser_id").notNull().references(() => organiser.id),
    monthId: uuid("month_id").notNull().references(() => month.id),
    seatId: uuid("seat_id").notNull().references(() => seat.id),
    amountPaise: paise("amount_paise").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("bid_amount_per_month").on(t.monthId, t.amountPaise),
    check("bid_amount", sql`${t.amountPaise} > 0`),
    foreignKey({ name: "bid_month_same_org", columns: [t.monthId, t.organiserId], foreignColumns: [month.id, month.organiserId] }),
    foreignKey({ name: "bid_seat_same_org", columns: [t.seatId, t.organiserId], foreignColumns: [seat.id, seat.organiserId] }),
  ],
);

export const payment = pgTable(
  "payment",
  {
    organiserId: uuid("organiser_id").notNull().references(() => organiser.id),
    monthId: uuid("month_id").notNull().references(() => month.id),
    seatId: uuid("seat_id").notNull().references(() => seat.id),
    paid: boolean("paid").notNull().default(false),
    adjusted: boolean("adjusted").notNull().default(false), // settled from the payout
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.monthId, t.seatId] }),
    foreignKey({ name: "payment_month_same_org", columns: [t.monthId, t.organiserId], foreignColumns: [month.id, month.organiserId] }),
    foreignKey({ name: "payment_seat_same_org", columns: [t.seatId, t.organiserId], foreignColumns: [seat.id, seat.organiserId] }),
  ],
);

export const payout = pgTable(
  "payout",
  {
    organiserId: uuid("organiser_id").notNull().references(() => organiser.id),
    monthId: uuid("month_id").primaryKey().references(() => month.id),
    done: boolean("done").notNull().default(false),
    prizePaise: paise("prize_paise").notNull(),
    cashPaise: paise("cash_paise").notNull(),
    doneAt: timestamp("done_at", { withTimezone: true }),
  },
  (t) => [foreignKey({ name: "payout_month_same_org", columns: [t.monthId, t.organiserId], foreignColumns: [month.id, month.organiserId] })],
);

export const memberLink = pgTable(
  "member_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organiserId: uuid("organiser_id").notNull().references(() => organiser.id),
    seatId: uuid("seat_id").notNull().references(() => seat.id),
    tokenHash: text("token_hash").notNull().unique(),
    kind: text("kind").notNull().default("link"), // link = sent by the organiser; device = a phone that joined with the PIN
    createdAt: createdAt(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("member_link_seat").on(t.seatId),
    foreignKey({ name: "member_link_seat_same_org", columns: [t.seatId, t.organiserId], foreignColumns: [seat.id, seat.organiserId] }),
  ],
);

/** Append-only audit trail. organiser_id is null for platform (Super Admin) events. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    organiserId: uuid("organiser_id").references(() => organiser.id),
    actorKind: text("actor_kind").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    details: jsonb("details"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("audit_actor", sql`${t.actorKind} in ('admin','organiser','member','system')`), index("audit_by_org").on(t.organiserId, t.id)],
);

/** Who is present in a month's live room (a seat must join before it can bid). */
export const roomJoin = pgTable(
  "room_join",
  {
    organiserId: uuid("organiser_id").notNull().references(() => organiser.id),
    monthId: uuid("month_id").notNull().references(() => month.id),
    seatId: uuid("seat_id").notNull().references(() => seat.id),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.monthId, t.seatId] }),
    foreignKey({ name: "room_join_month_same_org", columns: [t.monthId, t.organiserId], foreignColumns: [month.id, month.organiserId] }),
    foreignKey({ name: "room_join_seat_same_org", columns: [t.seatId, t.organiserId], foreignColumns: [seat.id, seat.organiserId] }),
  ],
);

/** A phone that agreed to notifications, for one member ID (one phone can hold several IDs, so several rows). */
export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organiserId: uuid("organiser_id").notNull().references(() => organiser.id),
    seatId: uuid("seat_id").notNull().references(() => seat.id),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    lang: text("lang").notNull().default("en"),
    createdAt: createdAt(),
    lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
  },
  (t) => [
    unique("push_subscription_seat_endpoint").on(t.seatId, t.endpoint),
    check("push_subscription_lang", sql`${t.lang} in ('en','ta')`),
    foreignKey({ name: "push_subscription_seat_same_org", columns: [t.seatId, t.organiserId], foreignColumns: [seat.id, seat.organiserId] }),
  ],
);

/**
 * Every member message, kept so the member can read it in the app (a notification may never arrive).
 * The 2-day reminder is sent once per ID and month (unique index).
 */
export const notification = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organiserId: uuid("organiser_id").notNull().references(() => organiser.id),
    seatId: uuid("seat_id").notNull().references(() => seat.id),
    monthId: uuid("month_id").notNull().references(() => month.id),
    kind: text("kind").notNull(),
    fields: jsonb("fields").notNull(),
    createdAt: createdAt(),
    pushed: integer("pushed").notNull().default(0),
  },
  (t) => [
    index("notification_seat").on(t.seatId, t.createdAt),
    uniqueIndex("notification_reminder_once").on(t.seatId, t.monthId).where(sql`${t.kind} = 'reminder'`),
    check("notification_kind", sql`${t.kind} in ('open','date','closed','reminder','receipt','correction')`),
    foreignKey({ name: "notification_seat_same_org", columns: [t.seatId, t.organiserId], foreignColumns: [seat.id, seat.organiserId] }),
    foreignKey({ name: "notification_month_same_org", columns: [t.monthId, t.organiserId], foreignColumns: [month.id, month.organiserId] }),
  ],
);
