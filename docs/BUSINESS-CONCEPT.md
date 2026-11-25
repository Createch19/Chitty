# Chitty: Business Concept (v3)

Agreed with the owner in a question-by-question review on 2026-11-20, using the real
5 lakh / 20 month sheet ([sample-5L-20-schedule.jpg](sample-5L-20-schedule.jpg)).
**Where this differs from [HANDOFF.md](HANDOFF.md), this document wins.**
Every rule and default below is confirmed by the owner (business questions 1–40, tech and design questions T1–T12).
The technical design and build plan are in [TECH-STACK.md](TECH-STACK.md).

---

## 1. In one paragraph

Chitty is a **SaaS** app: a Super Admin creates organisers, and each organiser runs their own chits, fully separated
from the other organisers. An organiser runs several chits at the same time. Every seat in a chit is its own **member ID**,
for example `A07`. A person with 3 seats has 3 IDs, 3 links and 3 separate bids. Month 1 always goes to the
organiser without a discount; this is the organiser's income, since there is no commission. From month 2 to
month n−1, a live online auction (ஏலம்) runs for the whole auction day. Bidders must offer **more** than the
minimum discount (தள்ளு), and the highest offer wins. If nobody bids, a lottery (குலுக்கல்) picks the winner at
the minimum discount. The discount is shared equally by all n seats. The last month goes to the one remaining
seat without a discount. Members pay within 10 days of the auction. The winner is paid once everyone has paid.

## 2. Who uses it

| Role | Access |
|---|---|
| **Super Admin** | The software owner. Created by database seeding (mobile number and password come from server settings). Can only see and manage **organisers**: create, edit, disable/enable, reset password, and see usage counts (number of chits and member IDs). **Cannot see any chit, member, Aadhaar or money data.** |
| **Organiser** | Created by the Super Admin. One login per organiser (no assistants). Creates chits, adds members, closes auctions, runs lotteries, ticks payments and payouts, sees every report, but only for **their own** data. |
| **Member ID** | No login: a secret link per member ID. The link opens a web app (PWA) that can be added to the phone's home screen. One phone can hold several IDs. |

- **Login** for the Super Admin and organisers is **mobile number + password**. There is no OTP, because SMS costs money.
  A forgotten organiser password is reset by the Super Admin.
- The Super Admin and an organiser are **separate accounts**. The owner uses a separate organiser account to run their own chits.
- **Each organiser's data is fully separate.** This is enforced in the code and in the database, and covered by tests.
- **Disabling an organiser pauses everything of theirs.** Their login stops. Member links show
  "Service temporarily paused". Auctions don't open and no notifications go out.
  Nothing is deleted, and re-enabling continues exactly where it stopped.
- **Branding:** each organiser has a **business name** (e.g. "Sri Murugan Chits"), set by the Super Admin.
  Members see it at the top of their app and in every notification. "Chitty" appears small at the bottom.
- **Pricing and billing for organisers are handled offline.** There is nothing about money between the owner and organisers in the app.

## 3. Setting up a chit

| Field | Rule |
|---|---|
| Chit value (total) | e.g. ₹5,00,000 |
| Months (n) | e.g. 20. Seats = n. |
| Monthly rate % (வட்டி) | % of the chit value. **Default 30 ÷ n** (20 → 1.5%, 15 → 2%, 10 → 3%, 30 → 1%). Editable when creating. |
| Bid increment | Default **₹500**, editable per chit (e.g. ₹300, ₹1,000) |
| Auction open time | 9:00 AM, editable per chit |
| Chit code | Auto letter `A`, `B`, `C`… (per organiser), editable. Member IDs are code + number: `A01`…`A20`. |
| Room display | Per chit: **"ID only" (default)** or "ID + name". Phone and Aadhaar are never shown to members. |

**Chit life cycle:**
1. **Create (draft):** fill in the fields above. There is **no start date yet**.
   Before saving, the app shows the full discount table (like the PDF) for checking.
2. **Add members:** this can take as many days as needed.
   The organiser's own seat is `A01` by default (the organiser can pick another ID); it is the month-1 winner.
3. **Start:** possible **only when every seat is filled**. The organiser presses Start and picks the
   **start date** at that moment, for example the 1st, 5th or 10th of the next month.
   Only days **1–28** can be picked. A chit never starts by itself.
4. The start date is month 1, and its day is the **auction day of every month**
   (start on the 10th → auction every 10th).
5. All terms are **frozen once the chit starts**. Member links are sent after Start (§10).
6. The chit is **completed** after the last month's payout.

## 4. The money math

```
installment          = total ÷ n                         5L/20: ₹25,000
monthly interest R   = total × rate%                     5L × 1.5% = ₹7,500
minimum discount(k)  = R × (n + 1 − k)   for 2 ≤ k ≤ n−1  month 2: 7,500 × 19 = ₹1,42,500
month 1 and month n  : no auction, discount 0
winner gets (prize)  = total − discount
every seat pays      = installment − discount ÷ n        (winners and the organiser too)
```

**Rounding:** when discount ÷ n is not a whole rupee, the monthly payment is rounded to the
**nearest whole rupee**. The winner still gets exactly **total − discount**, and the organiser keeps or covers
the few rupees of difference.
- Example: 3L/15 with a ₹84,500 discount gives ₹14,366.67, which rounds to ₹14,367.
- 15 × 14,367 = ₹2,15,505 is collected and the winner gets ₹2,15,500, so the organiser keeps ₹5.
- The reports show this difference for each month.
- This never happens in 5L/20.

5L / 20 months, discount at the minimum each month:

| Month | Discount | Winner gets | Everyone pays |
|---|---|---|---|
| 1 (organiser) | — | 5,00,000 | 25,000 |
| 2 | 1,42,500 | 3,57,500 | 17,875 |
| 10 | 82,500 | 4,17,500 | 20,875 |
| 19 | 15,000 | 4,85,000 | 24,250 |
| 20 (last seat) | — | 5,00,000 | 25,000 |

Each seat pays ₹4,29,125 in total over 20 months.
- The month-2 winner pays ₹71,625 more than they receive (the cost of getting the money early).
- The month-20 winner gains ₹70,875 (the reward for waiting).
- The organiser's month-1 seat gains ₹70,875 **and** gets the money first.

There is no commission and no late penalty.

## 5. One month, step by step

1. **Auction day, opening time:** the auction opens **automatically**, but only if last month is closed.
   If it isn't, the organiser gets a warning. Every member ID gets a push notification.
   The organiser also posts one reminder in the chit's WhatsApp group by hand.
2. **During the day:** members join the room through their link and bid (§6).
3. **Evening:** the organiser presses **Close**, and the app asks
   "Close the auction? Winner A07, ₹1,45,000 · Yes / No".
   **Yes is final**: there is no reopen.
4. **No bids at all:** the organiser presses **Lottery**, and the app picks a winner at random (§7). This is also final.
5. **Right after closing:** every member ID gets "This month pay ₹X, last day DD/MM".
6. **Collection:** members pay within **10 days**. The organiser ticks Paid (§9).
   Two days before the last day, unpaid IDs **only** get a reminder.
7. **Payout:** once **all** seats are Paid, the organiser pays the winner and ticks Payout done (§9).

The organiser can move **one month's** auction date (for a festival, say).
Members are notified, and that month's last payment day moves with it.

## 6. Bidding rules (the server enforces all of them)

- The organiser's minimum discount is **not** a valid bid.
  The first bid is at least **minimum + increment**: ₹1,43,000 in month 2.
- Each next bid is at least **current highest + increment**.
- The **current leader cannot bid again** until someone else outbids them.
  This stops an accidental double tap from raising their own bid.
- Bids sit on the increment grid starting from the minimum (+500, +1,000, +1,500 …).
- A bid must be below the chit value.
- A bid can never be withdrawn.
- If two bids for the same amount arrive at the same moment, the one the server got first wins.
- A member ID must **join the room** before bidding.
- An ID that already won a month cannot bid.
- An ID with **unpaid earlier months cannot bid**. It can watch the room.
  Once the organiser ticks those months Paid, it can bid the same day.
- **Bids only through the member's own page.** The organiser cannot bid on anyone's behalf.
- **A bid needs the member's fixed 6-digit PIN** (§10). Anyone holding a member's link can watch and join; the PIN is asked
  once per room visit, before the first bid. 5 wrong PINs lock that connection's bidding for that ID for 15 minutes.
- Month 1 and month n have no auction.

**The bid box in the room:**
- The amount box is **always pre-filled with the next valid amount**: if the highest bid is ₹14,000 and the
  increment is ₹500, it shows ₹14,500.
- It **updates live** when someone else bids, but **never while the member is typing**.
- The member can **edit** the amount and press **Bid**.
- If a new bid makes the typed amount too low, the box turns red: "At least ₹15,500". One tap fixes it.
- An amount off the increment grid shows "Only in steps of ₹500".
- Quick buttons **+500 / +1,000 / +5,000 / +10,000** (following the chit's increment) only **fill the box**
  with highest + X. The bid is placed only when **Bid** is pressed, so a stray tap never places a bid.
- The box is disabled, with a message, when the member is the current leader ("You are leading 🏆")
  or has arrears ("Pay your arrears to bid").

## 7. When nobody bids: lottery

- The lottery includes **every ID that has not won yet**: absent IDs and IDs with arrears too.
- The winner gets the prize at the **minimum discount** and **cannot refuse**.
- If the winner has arrears, they are deducted from the payout (§9).
- The result, the list of IDs in the draw and the random pick are stored in the audit log.

## 8. First and last month

- **Month 1:** no auction. The organiser's seat wins automatically.
  Everyone pays the full installment (₹25,000). The organiser takes the payout after everyone has paid.
- **Month n:** no auction. The one remaining ID wins automatically.
  Everyone pays the full installment. Payout follows the normal rules.

## 9. Payments, arrears, payout

- **Payment status is just Paid / Not paid** per ID per month. There is no payment method, date or part-payment.
- **Ticking Paid** asks "Mark A07 as paid? · Yes / No". Only Yes sets the tick,
  and only then does the member get a receipt notification.
- **Unticking** (a correction) asks Yes / No too. It goes into the audit log, and the member gets a "correction" notification.
  The payout tick works the same way.
- **The winner's own installment comes out of the payout.** On paper the organiser hands over the net amount.
  In the system, the winner's installment is ticked **Paid (adjusted from payout)**
  and the payout is recorded as the **full prize**, with a note of the cash actually handed over.
  - Example, month 2 at ₹1,45,000: prize ₹3,55,000, everyone pays ₹17,750,
    winner receives ₹3,37,250 in cash. The system shows a payout of ₹3,55,000 and the winner's installment as Paid.
- **A lottery winner with arrears:** the arrears are deducted the same way and marked Paid (adjusted from payout).
  - Example, month 3 at the minimum ₹1,35,000: prize ₹3,65,000, this month's installment ₹18,250,
    arrears ₹17,875 from month 2, cash ₹3,28,875.
- **Payout waits until every seat has paid.** The Payout done tick is blocked until then.
- **Counting on the collection screen:** it always counts **all n IDs** (e.g. 20/20), the organiser's own ID included,
  and the total due is n × the monthly payment (= the prize, ₹3,55,000 in the example). The organiser ticks their
  own ID like any other. The winner's own share shows "at payout"; it becomes **Paid (adjusted)** when the payout is
  confirmed, so payout opens once the other n − 1 IDs have paid.

## 10. Members and seats

- 1 seat = 1 member ID. Name and phone **do not have to be unique**; one person can hold many IDs.
- Each ID gets its **own link, sent once when the chit starts**, by WhatsApp: the app prepares the
  message and the organiser taps Send. The link stays the same for the whole chit.
- **Group link + PIN:** a chit has **one link for its WhatsApp group**. Each person has **one fixed random 6-digit PIN per chit**
  (all their IDs under the same mobile share it); the organiser sends it privately, can show it again, or make a new one.
  The member opens the group link, chooses the ID and types the PIN; the phone then remembers. Works before Start too.
  An ID shows **Connected** only after a PIN sign-in, never just because a link was sent. A new PIN signs those phones out.
  PINs are stored encrypted; every view of the PIN list and every wrong PIN is audited. Private links stay as an option.
- **Transfer:** a seat can pass to a new person mid-chit. The ID stays the same and the name and phone change.
  The old link stops working and the new person gets a new link. All history is kept, and the transfer is audited.
- **Aadhaar:** the full 12 digits are stored **encrypted**. They are checked with the Aadhaar checksum when typed,
  shown masked (`XXXX XXXX 1234`) with a Show button for the organiser only, and every Show is audited.
  If the encryption key is lost, the numbers are lost too, so the key needs its own safe backup.
- No guarantor or document tracking: the organiser handles that outside the app.

## 11. What a member sees in the app

- **Yes:**
  - the organiser's business name;
  - the live auction room on auction day;
  - their own account: what they paid each month, this month's amount, any arrears;
  - the full minimum-discount table of the chit.
- **No:**
  - past months' winners and discounts (visible live in the room on the day only);
  - other members' payment status;
  - anyone's phone or Aadhaar.

## 12. Notifications (free, app push; WhatsApp only for sending the link once)

| When | To whom |
|---|---|
| Auction opens | all IDs of the chit |
| Auction date changed | all IDs |
| Auction closed: amount and last day | all IDs |
| 2 days before the last day | unpaid IDs only |
| Paid ticked (receipt) / unticked (correction) | that ID |

**Content of the "auction closed" and "2 days before the last day" messages.** One message per member ID,
in that member's language, under the organiser's business name:

| Field | Example |
|---|---|
| Member ID | A07 |
| Chit code | A |
| Chit value | ₹5,00,000 |
| Chit day | 10th of every month |
| Month number | 2nd month |
| Final discount (highest bid the auction closed at) | ₹1,45,000 |
| This member's share of the discount (discount ÷ n) | ₹7,250 |
| Amount to pay | ₹17,750 |
| Last date to pay | 20/12/2026 |

The 2-day reminder starts with "Reminder: 2 days left". The phone shows a short notification;
tapping it opens a page with every field. The winner's ID is **not** included (§11).

**WhatsApp backup:** on the collection page, every member ID has a **"Send on WhatsApp"** button.
It opens WhatsApp with this same message filled in (a wa.me link), and the organiser taps Send. This is for
members who don't get app notifications. It costs nothing and has no ban risk, because nothing is automated.

## 13. Reports for the organiser

1. **Month collection:** who paid, who didn't, collected vs pending.
2. **Chit summary:** winner, discount and payout status for each month.
3. **Arrears list:** across all chits.
4. **Member ledger:** paid, received and arrears for one ID.
5. **Download:** CSV (opens in Excel / Google Sheets) and a printable page for PDF.

## 14. Importing chits already running on paper

Running paper chits follow the same rules, so they can move into the app midway:

1. The organiser downloads an **Excel template** that comes with a filled-in sample chit (5L/20, 7 months done).
2. The template has 4 sheets:
   - **Chit:** code, value, months, rate %, increment, start date.
   - **Members:** IDs, names, phones, Aadhaar, and which ID is the organiser's.
   - **Months:** for each finished month, the discount, the winner and whether the payout is done.
   - **Payments:** Paid or Not paid for each ID and month.
3. The organiser fills it in Excel or Google Sheets and **uploads** it.
4. The app checks everything and shows a **preview**. Errors are listed with their row, for example the same ID
   winning twice, a discount above the chit value, or a discount below that month's minimum.
5. The organiser presses **Import**. The finished months are recorded, the app works out every amount from the
   discounts, and **from the next month on the chit runs in the app as normal**. Member links are sent as for a new chit.

## 15. Look and feel

The UI must look **premium**, with rich animation everywhere. A plain-looking app is not acceptable.

- **Theme:** the auction room is **always a dark + gold stage**. Every other screen follows the phone's light or
  dark setting. All screens use one design system: colours, fonts (a good Tamil font and a premium English font),
  shadows and corners.
- **Auction room**, based on [bid-room-demo.html](bid-room-demo.html) but richer:
  - On each bid, an electric bolt runs down the bidder's wire into the gold orb, and the orb pulses.
  - Joined IDs have a live, glowing wire; IDs that haven't joined are grey with a dashed wire.
  - The price counts up, the leader wears a crown, and the winner gets confetti.
- **Collection:** a bowl fills with coins as each ID is ticked Paid, and is full when everyone has paid.
- **Payout:** once it is confirmed, the money flows from the bowl to the winner.
- **Small moments:** button presses, the ✓ when a tick lands, page transitions and number count-ups.
  Android phones vibrate briefly on a new bid and on becoming the leader.
- Everything is 2D (SVG/Canvas) made to look 3D (gloss, light, shadow), so it stays smooth on cheap phones.
  Phones set to "reduce motion" get calmer animation.
- **A clickable design preview of the key screens is approved by the owner before the full build** (TECH-STACK.md, Phase 0).

## 16. Language

Tamil and English. Every user (Super Admin, organiser and each member ID) picks their own, and the app remembers it.
**The default is English.** Notifications go out in the member's language.

## 17. Not in the app (decided)

- Commission
- Late penalty
- Bidding timer
- Reopening a closed auction
- Organiser bidding for a member
- Guarantor tracking
- Payment method, date or part-payments
- Assistant logins
- OTP login
- Billing between the owner and organisers (offline)
- Automatic WhatsApp messages (ban risk, or a paid API)
- A separate test site (testing happens locally, plus a "demo" organiser on the real site)

## 18. Still open

Every business question is decided. Outside the app:
- **Chit Funds Act registration:** the owner will check this.
- **Off-server backup:** not wanted for now. Nightly backups stay on the server, and Cloudflare R2 can be added later.

## 19. Rules that changed from the phase-1 prototype

Phase 1 was a zero-dependency SQLite prototype built from HANDOFF.md before this review. The real build moves to
Next.js + PostgreSQL (TECH-STACK.md). The pure math and its tests (the 5L/20 values) carry over, with these rule changes:

- **Rate:** "step % of installment" becomes "monthly rate % of total" (default 30 ÷ n). The 5L/20 values stay the same.
- **Bids:**
  - The first bid must be ≥ minimum + increment, and every bid must sit on the increment grid.
  - The current leader cannot bid again until outbid.
  - IDs with arrears cannot bid.
- **Rounding:** the monthly payment rounds to the nearest whole rupee and the prize stays exact.
- **Members:** member and slot merge into one member ID per seat (`A01`). Chits get a code and a display setting.
- **Month 1:** the organiser's seat wins automatically.
- **No bids:** a lottery among all unwon IDs, instead of the organiser choosing.
- **Closing:** close is a single final step. There is no reopen and no separate confirm step.
- **Start date:** picked when pressing Start (days 1–28 only), not when creating the chit.
- **New:**
  - SaaS roles
  - automatic opening, per-month date change, seat transfer
  - payment untick, payout adjustment records
  - push notifications
  - encrypted Aadhaar
  - Excel import
