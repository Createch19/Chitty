# Chitty

Chit fund management SaaS with a live auction room.

- **Business rules:** [docs/BUSINESS-CONCEPT.md](docs/BUSINESS-CONCEPT.md)
- **Stack, deploy and build plan:** [docs/TECH-STACK.md](docs/TECH-STACK.md)

## Current status: Phase 5 done (reports, paper-chit import, seat transfer, Aadhaar, audit log)

| What | Where |
|---|---|
| Organiser login | `/login` → `/app`: chits, new chit, chit page (`/app/chits/[id]`), month page (auction, lottery, collection, payout) |
| Member (no login) | `/m/<token>`: home, payments, schedule; `/m/<token>/room/<month>`: live auction. Links are sent from the chit page (Member links → Send). |
| Reports, import, audit | `/app/reports` (CSV + print), `/app/import` (Excel template → preview → import), `/app/audit` |
| Notifications | Member home → "Get auction and payment alerts". Needs `VAPID_*` keys (see `.env.example`). Aadhaar needs `CHITTY_AADHAAR_KEY`. Messages are also listed on the member home. |
| Installed app | `/manifest.webmanifest`, start page `/open`, service worker `public/sw.js` |
| Super Admin | `/admin/login` → `/admin` (organisers: create, edit, pause, reset password, usage counts) |
| Design preview (approved look) | `/` and `/preview/*` |

**Local logins:** the Super Admin is created on the first start from `SUPERADMIN_MOBILE` / `SUPERADMIN_PASSWORD` in `.env.local`
(git-ignored; copy `.env.example`). Organisers are created from the admin console; a local demo organiser login is noted in `.env.local`.

**Database:** without `DATABASE_URL` an embedded PostgreSQL (PGlite) is used, in `./.data/pglite`. Delete that folder to start fresh.
Schema is in `src/db/schema.ts`; migrations are in `drizzle/` (`npx drizzle-kit generate` after schema changes).

**Tests:** `npx vitest run`. They cover the money and rules (5L/20 sheet), tenancy attacks, logins, sessions, the rate limit, a full 20-month chit, member links, 20 parallel bidders and the live SSE stream.

## Phase 0: design preview

These are clickable screens with **fake data**. There is no database and nothing is saved.
The owner approves the look before Phase 1 starts.

| Screen | URL |
|---|---|
| Preview index | `/` |
| Live auction room (bolts, bid box, close, lottery, winner) | `/preview/room` |
| Collection bowl and payout | `/preview/collection` |
| Organiser dashboard | `/preview/dashboard` |
| Chit page (schedule and member IDs) | `/preview/chit` |
| Member app (phone) | `/preview/member` |
| Member (no login) | `/m/<token>`: home, payments, schedule; `/m/<token>/room/<month>`: live auction. Links are sent from the chit page (Member links → Send). |
| Reports, import, audit | `/app/reports` (CSV + print), `/app/import` (Excel template → preview → import), `/app/audit` |
| Notifications | Member home → "Get auction and payment alerts". Needs `VAPID_*` keys (see `.env.example`). Aadhaar needs `CHITTY_AADHAAR_KEY`. Messages are also listed on the member home. |
| Installed app | `/manifest.webmanifest`, start page `/open`, service worker `public/sw.js` |
| Super Admin | `/preview/admin` |

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:3000. The EN / தமிழ் and light / dark switches are in the top bar.

```bash
npx vitest run
```

## Layout

- `src/app/`: routes (Next.js 16 App Router, Cache Components on)
- `src/components/room/`: auction stage (SVG + bolts) and the room screen
- `src/components/collection/`: glass bowl, payout animation and the collection screen
- `src/components/screens/`: dashboard, chit page, member app, Super Admin
- `src/components/ui/kit.tsx`: buttons, dialogs, toasts, count-up, ring, segmented control
- `src/lib/`: preview money helpers, language and theme preferences, mock data
- `src/db/`: Drizzle schema, connection (PostgreSQL or PGlite), `withOrganiser()` (RLS tenancy)
- `src/domain/`: money and auction rules (pure, tested)
- `src/server/`: accounts, sessions, chits and months, member links (`members.ts`), live events (`events.ts`, `sse.ts`), scheduler; `src/app/actions/`: server actions (each re-checks the session or the member link)
- `src/components/member/`: member home and the live room
- `legacy-prototype/`: the old zero-dependency SQLite prototype. Phase 1 ports its money and rule tests, then removes it.
