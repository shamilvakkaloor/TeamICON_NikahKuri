# Nikah Kuri — Team ICON

A rotating wedding-assistance fund (*kuri*) for a 33-person class group split
across four regional teams: **KODUVALLY, KOZHIKODE, MALAPPURAM, VADAKARA**.

Members take turns as *groom of the round*. A groom pays nothing into his own
round but pays normally into every other one. This replaces the Google Sheet
the group runs on today — where JOURNAL was the only real data and every other
tab was a pivot somebody had to keep in sync by hand.

Here, `payments` is the journal and everything else is computed.

**No build step.** Native ES modules and plain CSS, with Firebase loaded from
Google's CDN. Drag the folder onto Netlify Drop and it is live. See
[SETUP.md](SETUP.md).

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

Rule 2 is why every payment records **who the groom was**. The sheet leaves the
groom implied by which column a row sits in; without it as an explicit field
you cannot answer *"how much did G give M?"*, and the whole model collapses.

Three consequences fall out of this for free, rather than needing special cases:

- **Shortfalls need no mechanism.** A member who managed only ₹5,000 is
  automatically owed only ₹5,000 back. The ledger corrects itself.
- **A past groom can't shrink his debt.** Once he has had his round, everything
  he owes is fixed by rule 2. Lowering his standing amount does nothing.
- **A late joiner collects from fewer members.** Someone joining at Kuri 10
  never paid the grooms of rounds 1–9, so they owe him nothing when his turn
  comes. This is intended, not a gap.

The rules live in [`js/domain/ledger.js`](js/domain/ledger.js) — plain data in,
plain data out, no Firebase import. If you have Node on your machine you can
run them; the app itself never needs it:

```bash
node --test js/domain/ledger.test.js
```

---

## Amounts, and the scope every change carries

The admin sets amounts, and **every change carries a scope**:

- **Only this round** — a one-off that does not carry forward. This is the
  default, because in practice almost every change is a one-off.
- **From this round onward** — becomes the member's standing amount, appended
  to his amount history and still editable later.

Where the two collide, **the one-off wins** — it was set deliberately for that
round. The round's dues screen flags where a standing change didn't take effect
so the admin can see it.

Entering more than ₹7,000 shows a confirmation naming who will owe that back,
so the obligation is visible at the moment it is created.

---

## What's on screen

| Screen | |
|---|---|
| **Home** | The groom's photo and details, countdown to the Kuri Last Date, live team-by-team progress, and your own due |
| **Rounds** | Open a round, review the generated dues *with the reason for each figure*, close it |
| **Payments** | Record money as it comes in. Partial payments accumulate. Corrections leave a trail |
| **Mine** | Your own history and upcoming dues, with the basis shown for every row |
| **Members** | The directory. Admin adds people and hands over roles |
| **Reports** | By round, by team, by member. CSV export |
| **Who owes whom** | The pairwise view the spreadsheet never had |
| **Handover** | Four separate per-team handovers to the groom, not one pooled payment |
| **Settlement** | Exit reconciliation, with the exit gated until every line is settled |
| **Audit log** | Every correction to a closed round, permanently |
| **Public page** | `#/public` — round summaries and the current groom, no login |

---

## Roles

| Role | Can do |
|---|---|
| **Admin** (single, transferable) | Everything: members, amounts, rounds, payments, opt-outs, closing rounds, settlement |
| **Coordinator** (one per team) | Records his own team's collections and hands the team total to the groom |
| **Member** | Views his own dues with the reason for each, plus all group-wide payment data |
| **Public** | Round summaries and the current groom — nothing else |

Admin and coordinators are ordinary kuri members who pay in and take their
turn. Role is a field on the member record, not an account type, and both are
transferable to anyone. Handing over the admin role drops the incumbent
straight to ordinary member — the app enforces exactly one admin at a time.

---

## How access control actually works

Three decisions here are load-bearing, and the first two exist because
**Firestore rules are document-level and cannot run queries**:

**Roles resolve through `memberIndex/{email}`.** Member documents are created
by the admin, with auto-IDs, long before that person first signs in — so the
document ID is never the Firebase Auth uid, and rules can't look a member up by
uid or search `members` by email. Instead a small admin-maintained document
keyed by lowercased email holds the role, team and status, and the rules read
it directly. `updateMember()` keeps it in step; **if it drifts, that member
silently loses access** (re-saving them under Members → Edit fixes it).

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

**The first admin** is created by the in-app setup screen. The rules allow
exactly one bootstrap write — while `settings/app` does not exist, a signed-in
account may create it together with its own admin record. After that the door
closes permanently. This is why nothing has to be hand-created in the Firebase
console.

---

## Data model

```
members/{id}                     name, team, email, role, status,
                                 joinedAtKuriNumber, standingAmount, amountHistory
memberIndex/{email}              role/team/status — what the security rules read
memberContacts/{memberId}        mobile — admin only
settings/app                     group name; its existence closes the setup door
kuriRounds/{kuriId}              kuriNumber, groomMemberId, dates, status
                                 (no flat due amount — see below)
roundDues/{kuriId}/members/{id}  dueAmount + basis + which payments it mirrors
roundOverrides/{kuriId}/…        one-off amounts, this round only
roundParticipation/{kuriId}/…    opt-outs
payments/{id}                    THE JOURNAL — fromMemberId, toMemberId, amount
handovers/{kuriId}/teams/{team}  four separate handovers per round
settlements/{id}                 exit reconciliation, tracked to completion
auditLog/{id}                    every change to a closed round
publicRounds/{kuriId}            world-readable projection
```

**The round document carries no due amount.** That's the main structural
departure from the spreadsheet, and it's forced: the amount depends on the
pair, so there is no single number to store.

`roundDues` stores the **basis** alongside every figure —
`mirrors_earlier_receipt`, `standing_amount`, `round_override`, `exempt_groom`,
`opted_out`. Storing the reason means the app can always explain why someone
owes ₹7,000 rather than ₹3,500, which is exactly the thing that causes
arguments in a real group. Mirrored figures are locked and cannot be edited.

---

## Code layout

```
index.html          the only page
config.js           the only file you edit
firestore.rules     paste into the Firebase console
css/styles.css      tokens + everything
js/
  app.js            boot: auth state decides what's on screen; routing
  domain/           the rules. No Firebase import. Testable with node --test
  lib/
    firebase.js     CDN imports + offline persistence
    auth.js         Google sign-in, roster matching
    data.js         three live listeners; everything else is derived
    crud.js         every write, and the two invariants they must keep
    ui.js           el() and the component vocabulary
    router.js       hash routing
    shell.js        sidebar / bottom nav
  pages/            one file per screen
```

Rendering is `el()` building real DOM nodes — no virtual DOM, no template
strings. Text always goes in as a text node, so a member's name can never be
parsed as markup.

---

## Build status

**Working:** setup, Google sign-in, members, rounds with per-pair dues and the
reason shown for every figure, one-off and standing amount changes, per-round
opt-outs, payment recording and corrections with an audit trail, the dashboard,
reports with CSV export, the pairwise view, per-team handover, settlement with
exit gating, and the public page.

**Not built yet:** the `pendingRecalculations` review flow (a retroactive edit
currently records its audit entry and warns you about the downstream effect,
but does not yet produce a reviewable list of dues to apply or reset), credits
from overpayment applied automatically against a future round, photo upload
(paste an image URL instead — Firebase Storage now needs the paid plan), the
closing final report, and the WhatsApp reminder generator.

The public projection is refreshed by an admin pressing **Publish to public
page** rather than by a Cloud Function, which keeps the whole app on the free
Spark plan.
