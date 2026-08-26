# Nikah Kuri — Team ICON

A rotating wedding-assistance fund (*kuri*) for a 33-person class group split
across four regional teams: **KODUVALLY, KOZHIKODE, MALAPPURAM, VADAKARA**.

Members take turns as *groom of the round*. A groom pays nothing into his own
round but pays normally into every other one. This app replaces the Google
Sheet the group runs on today — where JOURNAL was the only real data and every
other tab was a pivot somebody had to keep in sync by hand.

Here, `payments` is the journal and everything else is computed.

---

## The one rule everything hangs off

The sheet treats a round's due as one number: ₹7,000 × everyone. The real rules
make it specific to **each pair of members**. For member M in groom G's round:

1. M has exited, or opted out of this round → **owes 0**, and the link is
   severed both ways.
2. M has already had his own round → he repays **exactly what G gave him**,
   whatever that figure was. Received ₹10,000, repay ₹10,000. Received ₹3,500,
   repay ₹3,500. If G gave nothing, M owes nothing.
3. Otherwise → M gives the amount the admin has set for him, defaulting to
   **₹7,000**.

Rule 2 is why every payment records **`toMemberId`** — the groom. Without it
you cannot answer *"how much did G give M?"*, and the whole model collapses.

Three consequences fall out of this for free, rather than needing special cases:

- **Shortfalls need no mechanism.** A member who managed only ₹5,000 is
  automatically owed only ₹5,000 back. The ledger corrects itself.
- **A past groom can't shrink his debt.** Once he has had his round, everything
  he owes is fixed by rule 2. Lowering his standing amount does nothing.
- **A late joiner collects from fewer members.** Someone joining at Kuri 10
  never paid the grooms of rounds 1–9, so they owe him nothing when his turn
  comes. This is intended, not a gap.

The rules live in [`src/domain/ledger.ts`](src/domain/ledger.ts), deliberately
free of any Firebase import, with the cases above covered in
[`ledger.test.ts`](src/domain/ledger.test.ts).

```bash
npx vitest run
```

---

## Amounts, and the scope every change carries

The admin sets amounts, and **every change carries a scope**:

- **Only this round** — a one-off that does not carry forward. This is the
  default, because in practice almost every change is a one-off.
- **From this round onward** — becomes the member's standing amount, appended
  to `amountHistory` and still editable later.

Where the two collide, **the one-off wins** — it was set deliberately for that
round. The round's dues screen flags where a standing change didn't take effect
so the admin can see it.

Entering more than ₹7,000 shows a confirmation naming who will owe that back,
so the obligation is visible at the moment it's created.

---

## Running it

```bash
npm install
cp .env.example .env.local   # then fill in the six Firebase values
npm run dev
```

Without `.env.local` the app renders a setup notice rather than an opaque SDK
error. Full walkthrough in [SETUP.md](SETUP.md).

| Command | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | typecheck + production build |
| `npx vitest run` | domain rule tests |

---

## Roles

| Role | Can do |
|---|---|
| **Admin** (single, transferable) | Everything: members, amounts, rounds, payments, opt-outs, closing rounds, settlement |
| **Coordinator** (one per team) | Records his own team's collections and hands the team total to the groom |
| **Member** | Views his own dues with the *reason* for each, plus all group-wide payment data |
| **Public** | Round summaries and the current groom — nothing else |

Admin and coordinators are ordinary kuri members who pay in and take their
turn. Role is a field on the member record, not an account type, and both are
transferable to anyone. Handing over the admin role drops the incumbent
straight to ordinary member — the app enforces exactly one admin at a time.

---

## How access control actually works

Two decisions here are load-bearing, and both exist because **Firestore rules
are document-level and cannot run queries**:

**Roles resolve through `memberIndex/{email}`.** Member documents are created
by the admin, with auto-IDs, long before that person first signs in — so the
document ID is never the Firebase Auth uid, and rules can't look a member up by
uid or search by email. Instead a small admin-maintained document keyed by
lowercased email holds the role, team and status, and the rules `get()` it
directly. `updateMember()` keeps it in step; **if it drifts, that member
silently loses access.**

**Mobile numbers live in `memberContacts/{memberId}`, not on the member
document.** A `mobile` field on `members` would be readable by every signed-in
member through the raw API no matter what the UI chose to render. Contact
details are not payment data, so they get a path only the admin can read.

**The public sees a projection, not a filtered view.** `publicRounds` is a
separate collection containing only round number, groom name and photo, dates
and totals. It is the single world-readable path in the database, so a rules
mistake there cannot leak payment records or phone numbers — the path simply
doesn't contain them.

Everything else: any member on the roster reads everything (all payment data is
open to the group by design); only the admin writes, except that a coordinator
may record payments carrying his own team.

---

## Data model

```
members/{id}                     name, team, email, role, status,
                                 joinedAtKuriNumber, standingAmount, amountHistory
memberIndex/{email}              role/team/status — what the security rules read
memberContacts/{memberId}        mobile — admin only
kuriRounds/{kuriId}              kuriNumber, groomMemberId, dates, status
                                 (no flat due amount — see below)
roundDues/{kuriId}/members/{id}  dueAmount + basis + mirroredFromPaymentIds
roundOverrides/{kuriId}/…        one-off amounts, this round only
roundParticipation/{kuriId}/…    opt-outs
payments/{id}                    THE JOURNAL — fromMemberId, toMemberId, amount
handovers/{kuriId}/teams/{team}  four separate handovers per round
settlements/{id}                 exit reconciliation, tracked to completion
credits/{id}                     overpayment carried against a future round
auditLog/{id}                    every change to a closed round
publicRounds/{kuriId}            world-readable projection
```

**The round document carries no due amount.** That's the main structural
departure from the spreadsheet, and it's forced: the amount depends on the pair,
so there is no single number to store.

`roundDues` stores the **basis** alongside every figure — `mirrors_earlier_receipt`,
`standing_amount`, `round_override`, `exempt_groom`, `opted_out`. Storing the
reason means the app can always explain why someone owes ₹7,000 rather than
₹3,500, which is exactly the thing that causes arguments in a real group.
Mirrored figures are locked and cannot be edited.

---

## Deploying

Push to `main` → the GitHub Action builds and deploys to Firebase Hosting. Open
a PR → a preview channel URL.

**Rules are deliberately not deployed from CI.** A bad rules deploy can lock the
whole group out or expose payment data, so it stays a deliberate manual step:

```bash
firebase deploy --only firestore:rules,storage
```

---

## Build status

**Phase 1 is implemented** — auth, members, rounds, per-pair dues generation
with the reason shown, payment recording, dashboard, reports, CSV export.

Also in place from later phases, because the data model supported them from day
one: per-round opt-out, the over-₹7,000 confirmation, the pairwise *who owes
whom* view, coordinator role and handover, audit log, and the settlement
worksheet with exit gating.

**Not yet built:** Cloud Functions to maintain `kuriRoundSummaries`,
`memberTotals` and the `publicRounds` projection — the app currently computes
dues client-side from source data, which works on the Spark (free) plan and
keeps the screen from ever drifting out of step with the ledger. Publishing to
`publicRounds` is an admin write for now. Also outstanding: photo upload with
client-side resize, the `pendingRecalculations` review flow for retroactive
edits, credits applied automatically against future dues, and the WhatsApp
reminder generator.
