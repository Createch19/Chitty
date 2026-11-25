# Chitty: Tech Stack and Build Plan

Agreed with the owner on 2026-11-20 (tech and design questions T1–T12).
The business rules are in [BUSINESS-CONCEPT.md](BUSINESS-CONCEPT.md); where the two disagree on behaviour, that document wins.

## Status (2026-11-20)

- **Phase 0 (design preview): approved by the owner.** It stays at `/preview/*` as the design reference.
- **Phase 1 (foundation): built.**
  - 12 tables, migrations in `drizzle/`, and Row-Level Security on every organiser table.
  - Same-organiser composite foreign keys, plus append-only bids and audit log.
  - Super Admin seed and login; organiser create, edit, pause, reset and usage counts.
  - Organiser login with a forced own-password, and the organiser home shell.
  - The money and rules modules carry the agreed rules.
  - 51 Vitest tests, including the 5L/20 sheet and cross-organiser attack tests.
- **Phase 2 (chits and months): built.**
  - Chit create with a live discount table; member IDs, with the organiser's seat at A01; Start (days 1–28).
  - Month 1 goes to the organiser automatically.
  - The scheduler opens auctions at the chit's time (Asia/Kolkata), or the organiser presses Open now; per-month date change.
  - Bids follow every rule under a row lock. Close (final) and the lottery.
  - Paid tick and untick, payout with own-share and arrears adjustment, undo payout, and the last month closing itself.
  - 68 Vitest tests, including a full 20-month 5L chit.
- **Phase 3 (members and live room): built.**
  - One secret link per member ID (`/m/<token>`, only the SHA-256 is stored). The organiser sends it from the chit page:
    a sheet with **Send on WhatsApp** (wa.me, prefilled message) and Copy. New link (the old one dies) and Stop link, both with Yes/No.
  - Member home: the IDs saved on this phone (switcher), live-auction card, amount due with days left, own payment history,
    the minimum-discount table and an install card. Paused organiser and dead links get their own screens.
  - Live room on real data over **SSE** (`/api/m/<token>/rooms/<month>/events`). Every change sends a full snapshot, bursts are
    coalesced (80 ms), and a heartbeat is sent every 15 s. Join, bid box with every rule, arrears lock, leader state, outbid toast, and a winner overlay with confetti.
    Payment ticks and payouts also refresh the open room, so a member who pays is unlocked at once. Revoking a link sends `gone` at once.
  - The organiser's month page listens to its own SSE stream instead of polling.
  - Members never receive phone numbers. A rate limit of 8 bid attempts per 10 s per ID applies.
  - PWA: `manifest.webmanifest` (start `/open`, which goes to the last ID used on this phone), PNG icons (`/pwa-icon/*`), and
    `public/sw.js` (offline page only; it never caches money or auction data).
  - 86 Vitest tests. The new ones cover links, privacy, 20 phones joining and bidding at once, the same amount at once,
    the real SSE route (first snapshot, coalescing, reconnect, live arrears unlock, revoke → gone) and cross-organiser checks.
    These run against the route handlers directly; Playwright browser tests are still to add (Phase 7 hardening).
  - The event bus is in-process (one container). Running several containers would need PostgreSQL LISTEN/NOTIFY.
- **Phase 4 (notifications): built.**
  - Web Push with VAPID (`web-push`). Keys come from `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`;
    `.env.local` holds local-only keys, and production needs its own (`npx web-push generate-vapid-keys`).
  - Every message is stored in `notification` **inside the same transaction** as the action, then pushed after commit
    to each phone subscribed for that ID (`push_subscription`, RLS). Dead phones (404/410) are removed. A paused organiser sends nothing.
  - Messages: auction opens, date changed, auction closed (the winner gets "You won"), 2-day reminder (unpaid IDs only,
    once, from 9:00 AM IST two days before the last day), receipt and correction. Each goes out in the language saved for that phone.
  - One builder (`src/domain/messages.ts`) makes the push text, the in-app message page and the WhatsApp text, so they always match the §12 fields.
  - Member home: an opt-in card (one tap turns it on for every ID saved on the phone; iPhone is told to add to home screen first)
    and a **Messages** list, so a member who never got the push can still read it. Tapping a push opens
    `/open?s=<seat>&n=<message>`, which finds that ID's link on the phone; the secret link is never in a push.
  - Organiser: the collection page's WhatsApp button sends the same text (the reminder within 2 days of the last day), and
    open or upcoming months have **Post in WhatsApp group**.
  - Also fixed: a winner's own share no longer shows as "due" on the member home; it reads "taken from your prize at payout".
  - 100 Vitest tests (14 new). **Not yet verified on a real phone** (the Phase 4 "done when"); the in-app browser blocks notifications.
  - Not built: a push to the organiser when an auction can't open because last month isn't closed (the organiser has no push yet).
- **Phase 5 (reports, import, transfer, Aadhaar, audit): built.**
  - **Aadhaar:** Verhoeff-checked, sealed with AES-256-GCM (seat id bound in), key in `CHITTY_AADHAAR_KEY` (32 bytes, base64; never
    in the database). Only the last 4 digits are shown; **Show** is audited and hides again after 30 s. Without the key nothing is stored.
    **The production key needs its own safe backup: losing it loses every stored Aadhaar.**
  - **Seat transfer** (running chits, not the organiser's seat): same ID and history, new name/phone/Aadhaar, the old link and the
    old person's notification phones stop at once, audited with from/to. Opened from the chit page: tap an ID under "Members & links".
  - **Reports** (`/app/reports`): arrears across all chits (late vs not yet due), month collection, chit summary, member ledger.
    Each has a CSV download (UTF-8 with BOM so Tamil opens in Excel; rupees, not paise; formula injection neutralised) and Print / PDF.
  - **Import** (`/app/import`): Excel template with a filled 5L/20 sample (7 months held). Upload → every mistake listed with its sheet and
    row (ID winning twice, discount below the minimum or not below the chit value, payout marked done with unpaid IDs, missing or unclear
    payments, wrong phones/Aadhaar, months in the future, taken chit code) → preview → Import. One transaction; past months send no messages;
    payouts reuse the app's payout rule (own share and arrears adjusted). The file is re-read and re-checked on Import.
  - **Audit log** (`/app/audit`): newest first, filters (payments, auctions, members and links, Aadhaar), paging, plain-language lines.
  - 118 Vitest tests (18 new).
- **Local database:** without `DATABASE_URL` the app uses **PGlite**, an embedded PostgreSQL 17 kept in `./.data/pglite`.
  It needs no install and no password. Production uses real PostgreSQL through `DATABASE_URL`, with the same migrations.
  **Run against a real PostgreSQL 17 server on 2026-11-21** (the 120 tests of that day; `CHITTY_TEST_PG=<server url> npx vitest run`,
  with role `chitty_app` created first). Production runs on PostgreSQL 16; the test suite has not been run on 16.
- `drizzle-kit` (a dev-only tool) pulls an old esbuild with a moderate advisory about esbuild's dev server.
  It is not used and not shipped.

## 1. Server (measured 2026-11-20)

| | Total | Free |
|---|---|---|
| RAM | 23 GB | ~21 GB (no swap) |
| CPU | 4 cores | almost idle |
| Disk | 45 GB | 28 GB |

- Managed with **Coolify**, which provides the proxy, HTTPS, Docker builds and database backups.
- Coolify itself uses about 470 MB. The existing apps use about 420 MB in total, and some of them have no memory limit.
- Chitty needs roughly 100–200 MB for the app plus about 100 MB for PostgreSQL.
- Domain: **https://chitty.creaitechnology.com**. The owner adds the DNS A record.

## 2. Stack

| Area | Choice | Notes |
|---|---|---|
| Runtime | Node.js 24 LTS | Supported until April 2028. Exact version pinned in `.nvmrc` and the Dockerfile. |
| App | Next.js (App Router), TypeScript strict | `output: "standalone"` for a small image. One container serves the UI, the API and SSE. |
| Database | PostgreSQL 16, a Coolify database resource | Internal network only. |
| ORM / migrations | Drizzle ORM + drizzle-kit | Migrations run automatically on container start. |
| Validation | Zod | The same schemas on the server and in forms. Every input is checked on the server. |
| UI | Tailwind CSS + shadcn/ui (Radix) | One design system (Phase 0). |
| Animation | Motion (motion.dev), GSAP, SVG/Canvas, canvas-confetti | 2D drawn to look 3D. Respects reduced motion. |
| Fonts | A Tamil font + a premium Latin font, self-hosted via `next/font` | Picked in Phase 0. |
| i18n | next-intl | English (default) and Tamil, chosen per user. |
| PWA + push | Service worker + Web Push (VAPID) with `web-push` | Free notifications. |
| Excel import | exceljs | Generates the template and reads uploads. |
| Tests | Vitest (unit and DB) + Playwright (end-to-end) | Runs on the Mac before every deploy. |

## 3. Key technical designs

- **Money:** stored as integer paise (`bigint`). One pure `money` module does all of the math: schedule, prize,
  rounding to the nearest rupee, and the rounding difference. It is tested with the 5L/20 sheet values, 3L/15 and 5L/10.
  Floats are never used.
- **Tenancy (SaaS):** every organiser-owned table has `organiser_id`.
  - All access goes through an organiser-scoped data layer.
  - As a second wall, PostgreSQL **Row-Level Security** policies use `SET LOCAL app.organiser_id` inside each transaction.
  - Tests try cross-organiser reads and writes and must fail.
  - The Super Admin has its own table and its own routes, and cannot read organiser-owned tables.
- **Auth:**
  - Mobile number + password, hashed with scrypt from Node's built-in crypto.
  - Sessions are a random token in an httpOnly, Secure, SameSite=Lax cookie, stored hashed in the DB, with a 30-day sliding expiry.
  - Login is rate-limited per mobile number and per IP.
  - Disabling an organiser kills their sessions and pauses their tenant.
- **Super Admin seed:** `npm run seed` creates the Super Admin from `SUPERADMIN_MOBILE` / `SUPERADMIN_PASSWORD`,
  only if none exists yet.
- **Member links:** a 128-bit random token per member ID. Only its SHA-256 is stored.
  Regenerating or transferring a seat revokes the old token.
- **Bids (concurrency):** each bid runs in one transaction:
  1. `SELECT … FOR UPDATE` on the auction row;
  2. check every rule (BUSINESS-CONCEPT §6);
  3. insert the bid.

  A unique `(auction_id, amount)` constraint is a backstop. Bids are append-only: a trigger blocks UPDATE and DELETE.
- **Live room (SSE):**
  - One stream per auction from a Node-runtime route handler.
  - Events go through PostgreSQL `LISTEN/NOTIFY`, so every open stream sees each bid, close and lottery.
  - The server sends a heartbeat every 15 s and the headers `Cache-Control: no-transform`, `X-Accel-Buffering: no`.
  - When a client reconnects, it gets a fresh snapshot.
  - The client keeps the stage DOM persistent and plays a bolt only when the bid count grows.
- **Scheduler:**
  - A job loop starts with the server (`instrumentation.ts`) and ticks every minute, under a PostgreSQL advisory lock.
  - Each tick opens due auctions at the chit's time (Asia/Kolkata) and sends 2-day reminders.
  - Jobs are idempotent with "done" markers, so a restart or missed minute catches up safely.
- **Time:** timestamps are `timestamptz` (UTC). All calendar logic (auction day, last day to pay) uses **Asia/Kolkata**.
  The server's clock is the only clock.
- **Aadhaar:** AES-256-GCM with `CHITTY_AADHAAR_KEY` from the environment. The DB stores iv, ciphertext, tag and key version.
  Input is checked with the Verhoeff checksum, and every Show is audited.
- **Audit log:** append-only (a trigger blocks UPDATE and DELETE). It records who, what, when and details for:
  - bids (accepted and rejected), close, lottery (the full draw list and the pick);
  - pay/untick, payout, date change, transfer, Aadhaar Show;
  - Super Admin actions.
- **Reports:** server-rendered. CSV download, plus a print stylesheet for PDF.

## 4. Deploy (Coolify)

- Code lives in the **private GitHub repo `Createch19/Chitty`**, branch `main`.
  Auto-deploy on push is not confirmed: on 2026-11-22 the pushed commits went live only after a manual **Redeploy**.
- **App:**
  - Dockerfile build, port 3000, health check `GET /api/health`.
  - **Memory limit 512 MB**, reservation 256 MB.
  - Domain https://chitty.creaitechnology.com.
- **PostgreSQL 16:** the owner's existing Coolify resource, database `chitty` (the app creates it on first start).
  Backup of `chitty` set up in Coolify on 2026-11-25 (14-day retention intended, local only). One manual run restored cleanly into a scratch
  PostgreSQL 16.16 that day. The nightly run itself is not confirmed yet. Off-server copies to Cloudflare R2 can be added later.
- **Environment (Coolify secrets, never in git):**
  - `DATABASE_URL`, `CHITTY_AADHAAR_KEY`
  - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
  - `SUPERADMIN_MOBILE`, `SUPERADMIN_PASSWORD`
  - `APP_URL`, `TZ=Asia/Kolkata`
- **`CHITTY_AADHAAR_KEY` must also be kept by the owner** in a password manager. Losing it loses every Aadhaar number.
- **Release:**
  1. All tests pass on the Mac.
  2. Push to `main`.
  3. Press **Redeploy** in Coolify if it has not started by itself; it builds and starts, and the app migrates.
  4. Check `/api/health`.
  5. Do a quick smoke test with the **Demo organiser**.

## 5. Build plan

Each phase ends with its tests passing and a check-in with the owner.

| Phase | What | Done when |
|---|---|---|
| **0. Design preview** ✅ | Design system: colours, fonts, components, motion rules. A clickable preview with fake data of: the **auction room** (full animations, bid box), **collection bowl**, **payout flow**, organiser dashboard and chit page, member app, Super Admin. | **The owner approves the look.** Nothing else is built before this. |
| **1. Foundation** ✅ | Next.js app, PostgreSQL schema and migrations, tenancy with RLS. Super Admin seed and login; organiser create, edit, disable, reset and usage counts; organiser login. Money and rules modules ported, with the 5L/20 tests. | Tests pass, including cross-tenant attack tests. |
| **2. Chits and months** ✅ | Draft chit with schedule preview, member IDs, Start with a date, month-1 auto winner, scheduler auto-open, close with confirm, lottery, per-month date change. Paid tick/untick, payout with adjustments and arrears, rounding difference, collection bowl and payout animations. | A full 20-month chit runs in tests. |
| **3. Members and live room** ✅ | Member links and WhatsApp share, PWA install guide, member app (account and schedule), live room over SSE with the bid box and every rule, auction-room animations. | Playwright: 20 parallel members, same-moment bids, reconnect, link revoke, arrears and leader blocks. |
| **4. Notifications** ✅ (phone check pending) | Web Push: open, date change, closed summary, 2-day reminder, receipt and correction. WhatsApp backup buttons, per-user language. | Push verified on a real Android phone. |
| **5. Reports, import, transfer, Aadhaar** ✅ | 5 reports with CSV and print, Excel import with template, preview and errors, seat transfer, encrypted Aadhaar with audited Show, audit log viewer. | A real paper chit imports cleanly. |
| **6. Deploy** (live since 2026-11-21; restore tested 2026-11-25; key backup done and home-screen app checked on iPhone, per the owner; nightly run, Edit and push on phone, Demo organiser not confirmed) | Dockerfile, private GitHub repo, Coolify app, PostgreSQL, secrets, limits, health check, nightly backup, domain and HTTPS, Super Admin seed, Demo organiser. | The live site works on the phone. |
| **7. Dry run and hardening** | A full simulated chit with the Demo organiser, a security review, fixes. | The owner signs off on using it for real chits. |

## 6. The phase-1 SQLite prototype

The zero-dependency prototype (`src/`, `test/`, README) was built from HANDOFF.md before the review.
Phase 1 ports its money and rule tests, with the rule changes in BUSINESS-CONCEPT §19, and then the prototype is removed.
