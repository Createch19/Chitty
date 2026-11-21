# Chit Fund Management App: Handoff Brief

Visual/animation reference: [`bid-room-demo.html`](bid-room-demo.html) (in this folder).

## 1. What we are building

A chit fund management app for ONE organiser (me), with members joining a live bidding room via a secret link. UI in Tamil and English. Members see member IDs only (not names/phones/Aadhaar). No commission, no late penalty, no bidding timer (organiser closes bidding manually).

## 2. Chit rules (verified against my real 5 lakh / 20 month sheet)

Let total = chit value, n = months, stepPct = 30 (default, editable).

- installment = total / n
- step = installment * stepPct / 100 (5L/20 months: 25,000 and 7,500)
- starting discount for month k = (n + 1 - k) * step, for 2 <= k <= n-1 (5L/20: month 2 = 1,42,500 ... month 19 = 15,000, dropping 7,500 each month)
- month 1 and month n: NO bidding, discount 0 (organiser assigns winner; last month = the one remaining slot)
- winner prize = total - discount
- EVERY member (including earlier winners) pays: installment - discount / n every month (check: n * that amount = prize)
- Examples (5L/20): base discount 1,42,500 -> everyone pays 17,875, prize 3,57,500; bid 1,70,000 -> pays 16,500, prize 3,30,000
- Highest discount asked wins. Starting discount is the base bid.
- Bid rules: first bid >= starting discount; next bid >= highest + minIncrement (default 500); bid < total; bids can never be withdrawn; tie = earlier server timestamp wins; members who already won a month cannot bid in later months; month k+1 cannot open until month k is closed.
- A member may hold several slots (no limit). Chit can start only when slots == n.

Schedule check values (5L/20, discount by month 2..19):
142500, 135000, 127500, 120000, 112500, 105000, 97500, 90000, 82500, 75000, 67500, 60000, 52500, 45000, 37500, 30000, 22500, 15000

Other chit sizes use the same pattern: 3L/15 months: step 6,000, month-2 start 84,000; 5L/10 months: installment 50,000, step 15,000, month-2 start 1,35,000. (Step = 30% of installment is MY assumption extended to other sizes; confirm with me.)

## 3. Members

Fields: auto ID (M001...), name, phone, Aadhaar (12 digits, optional, shown masked XXXX XXXX 1234 with a Show toggle). Phone checks planned (free): 10-digit Indian mobile format, duplicate check, organiser-set "Verified" tick after WhatsApp/call confirmation, wa.me WhatsApp buttons (no automation, no unofficial WhatsApp libraries because of ban risk).

## 4. Live Bid Room (design: see bid-room-demo.html)

- Dark stage, SVG viewBox 400x400. Gold 3D orb in the centre shows current bid (label switches Starting discount / Current bid) and the prize below it.
- Eligible members sit on a circle (radius 146) as glossy 3D person-icon spheres (radial gradients, specular highlight, drop shadow, gentle bobbing), each connected to the orb by a wire.
- Joined = coloured sphere + wire with flowing cyan dots. Not joined = greyed out, dashed grey wire.
- When someone bids: a jagged electric bolt travels along their wire to the orb (white core + cyan glow + moving spark, ~520 ms), orb pulses with a shockwave ring, price counts up (~750 ms ease-out).
- Leader: gold ring + crown + animated gold dashed wire. On join: green spark from orb to avatar plus pop.
- Subtle 3D tilt on pointer move. Tap an avatar (demo) selects the member. Winner screen with confetti.
- The animation must not restart on re-render: keep the stage DOM persistent and trigger a bolt only when the bid count increases.
- Respect prefers-reduced-motion. Labels sit outside the ring (anchor start/end/middle by angle) to avoid overlap.

## 5. Target architecture (my own existing server, 2 GB RAM cap)

- Node.js 22+, ZERO npm dependencies: built-in http, node:sqlite (currently "experimental", pin the Node version), crypto.
- Live updates: Server-Sent Events (server to browser) + plain POST for bids. Server is the source of truth and the only clock.
- Frontend: PWA, Tamil/English, mobile first.
- Docker, memory limit 512 MB, restart: unless-stopped, healthcheck. Caddy (or Nginx) for HTTPS; disable proxy buffering for SSE.
- SQLite single file, nightly backup copied OFF the server, plus a tested restore.
- Note: another app on the same server has unlimited memory, so reserve memory for this one (OOM-killer risk).

## 6. Data model (draft)

organiser, member, chit, slot(chit, member, index), auction(chit, month, status, winnerSlot, discount), bid(auction, slot, amount, serverTime), join(auction, slot), member_link(token hash, chit, member, revoked), payment(chit, month, slot, paid), payout(chit, month, done), audit_log(who, what, when).

## 7. Security

- Organiser: password login (scrypt hash), httpOnly secure session cookie, login rate limit.
- Member link: 128-bit random token per member per chit, revocable/regenerable, rate limited; no login for members.
- Aadhaar: encrypted at rest (AES-GCM, key in env) OR last 4 digits only (decision pending); organiser-only visibility.
- Validate every input on the server; bids validated server-side only; audit log for bids, close, reopen, winner confirmation.
- HTTPS only. No secrets in the repo.

## 8. Screens

Organiser: login, dashboard, members, chit create (name, total, months, start date, step %, min increment; auto schedule), chit detail (slots + schedule table), month page (open bidding, live room, close and confirm winner, manual assign, reopen with audit), collection (paid checkboxes per member per month, prize payout tick), reports, share member links (WhatsApp), settings/backup.

Member (link): who am I, Join room, live Bid Room, quick raise (+500/+1,000/+5,000/+10,000) and custom amount, outbid notice, result screen, own payment history.

## 9. Build phases (each ends with tests)

1. Server core: DB, calculations, bid rules, audit. Unit tests (PDF schedule above, all bid rules).
2. Organiser app: full flow chit create -> winner confirm.
3. Member link + live room: 20 members in parallel, two bids same moment, SSE reconnect, link revoke.
4. Collection, payout, reports, backup/restore.
5. Deploy package: Dockerfile, compose, Caddy config, backup script, README.
6. Hardening + dry run against a real paper chit.

Testing tools available: Playwright + Chrome for browser e2e.

## 10. Decisions still open

1. Aadhaar: encrypted full number vs last 4 only (my lean: last 4, full only if really needed).
2. Month-1 winner method: organiser selects (current plan).
3. Server details: OS, Docker yes/no, domain/HTTPS, where backups go.
4. Collection reminders and payout tracking in v1 or v2.
5. Chit Funds Act registration status for organiser in my state (I need to confirm myself).

## 11. Already built in the Claude chat (reference only, not production)

- `bid-room-demo.html`: standalone, no server; bots join/bid; this is the visual/animation reference. (Saved in this folder.)
- `chit-manager-organiser-artifact.html`: the organiser app that ran on Claude's artifact database (uses window.claude db capability, so it will not run standalone). Useful for UI flow, Tamil/English strings, validation rules, calculations. It passed 60 browser checks against a fake DB. Known limitation there: members cannot bid from their own phones (artifact DB is writable only by the owner), which is why we move to my own server. (Not saved here yet; may be found among the user's claude.ai artifacts.)
