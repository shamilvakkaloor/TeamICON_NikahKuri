# Setup guide

Everything below is done in a web browser. No terminal, no Node, no npm, no
build step, no credit card. Budget about 15 minutes for the first run.

---

## Part 1 — Create the Firebase project

### 1. Make the project

Go to <https://console.firebase.google.com> and sign in with the Google account
that will run the kuri.

- **Add project** → name it (e.g. `nikah-kuri-icon`) → Continue
- Google Analytics: **turn it off**. You do not need it and it adds a step.
- Create project → wait about 30 seconds → Continue

You stay on the free **Spark** plan throughout. If Firebase ever asks you to
upgrade to Blaze, you have wandered into Cloud Functions or Storage — neither
is used here. Back out.

### 2. Turn on Firestore

- Left sidebar → **Databases and Storage → Firestore** → Create database
- Edition: **Standard**
- Location: **`asia-south1`** (Mumbai) for India. **This cannot be changed later.**
- Start in **production mode**. Rules get replaced in step 5 anyway.
- Enable

### 3. Turn on Authentication

- Left sidebar → **Security → Authentication** → Get started
- **Google** → toggle **Enable** → pick a support email → Save

Everyone signs in with their own real Google account. No passwords for you to
manage or reset, and no SMS costs — it works the same for the member on a UAE
number as for everyone else.

### 4. Copy your config into `config.js`

- Click **Project Overview** in the left sidebar, then the **+ Add app** button
  just under your project name
- Choose the web icon `</>`
- App nickname: anything. Leave "Also set up Firebase Hosting" unticked — you
  are deploying elsewhere in Part 2 → **Register app**
- You now see a code block containing `const firebaseConfig = { … }`
- Copy the six values into `config.js` in this folder, replacing every
  `PASTE_…` placeholder.

Already registered an app and need the values again? **Settings** in the left
sidebar → **Project settings** → scroll to **Your apps** → **SDK setup and
configuration** → **Config**.

Save the file. This is the only file you edit.

> These values are public. Anyone can read them by viewing your page source,
> and that is fine — they identify your project, they do not grant access to
> it. All access control lives in the rules you paste in the next step.

### 5. Paste the security rules

This step is what makes the app safe. Do not skip it — nothing will work
without it, including the first-run setup screen.

- **Firestore → Rules** tab
- Delete everything in the editor
- Open `firestore.rules` from this folder, copy the whole file, paste it in
- **Publish**

### 6. Database indexes

**There are none to create.** Every query this app runs is on a single field,
and Firestore indexes those automatically. If you ever see an error asking for
an index, the link in it creates exactly the right one in a click.

---

## Part 2 — Put the app online

Pick one. All three are free and need no card.

### Option A — Netlify Drop (fastest, about 60 seconds)

1. Go to <https://app.netlify.com/drop>
2. Drag this entire folder onto the page
3. You get a live URL immediately

To update later, drag the folder again. Create a free account if you want to
keep the same URL and set a custom name.

### Option B — GitHub Pages

1. Create a free GitHub account and a new repository
2. **Add file → Upload files**
3. **Important:** open the project folder on your computer, select
   **everything inside it** — `index.html`, `config.js`, the `css` and `js`
   folders, and so on — and drag *those* in. Do **not** drag the outer folder
   itself.
4. Commit
5. **Settings → Pages** → Source: `Deploy from a branch` → Branch: `main`,
   folder `/ (root)` → Save
6. Wait a minute; your URL appears at the top of that page

**Getting a 404?** Open your repository page. You should see `index.html`
listed directly in the file list. If instead you see a single folder you have
to click into first, that is the problem — the files went in one level too
deep. Delete them and re-upload following step 3 exactly.

### Option C — Cloudflare Pages

1. <https://pages.cloudflare.com> → Create a project → Direct Upload
2. Drag the folder → Deploy

### One thing to do after deploying

Copy your live web address and add it in Firebase:
**Authentication → Settings → Authorized domains → Add domain**.

Google sign-in refuses to run on a domain it does not know. `localhost` is
already allowed, so this only bites once you are online — and the app will tell
you exactly this if it happens.

### Testing on your own machine first

Opening `index.html` by double-clicking will **not** work — browsers block ES
modules loaded from `file://`. Use any of the three options above, or if you
happen to have Python installed, run `python -m http.server` in this folder and
open <http://localhost:8000>.

---

## Part 3 — First run

1. Open your live URL. It shows **Set up the kuri**.
2. Sign in with the Google account that will be the admin.
3. Enter the group name, your own name and your team → **Finish setup**.

That is it. You are now the admin, and you are also an ordinary kuri member —
you pay in and take your turn as groom like everyone else.

> **Why the app asks you to sign in before setup:** the security rules decide
> who you are by reading a small `memberIndex` document keyed on your email.
> Before any admin exists there is nobody who can write that document, which
> would be a deadlock. So the rules allow exactly one bootstrap — while the
> `settings/app` document does not exist, any signed-in account may create it
> together with its own admin record. The setup screen does this once, and the
> door then closes permanently.

### Recommended order

| # | Screen | What to do |
|---|---|---|
| 1 | **Members** | Add the group. Name, team, and the Google email each person signs in with. Set **joined at Kuri** correctly — see below |
| 2 | **Rounds** | Open the first round: pick the groom, set the Nikah date and the Kuri Last Date |
| 3 | **Rounds → the round** | Review the generated dues *before* telling anyone a figure. This is the moment to catch a wrong amount or a missed opt-out |
| 4 | — | Hand coordinators their role under Members → Edit → Role |
| 5 | **Payments** | Coordinators record money as they collect it |

**`joined at Kuri` matters and cannot be changed afterwards.** It is what makes
a late joiner correctly collect from fewer members: he owes nothing to rounds
before it, and the grooms of those rounds owe him nothing back. Everyone who
was there from the start is `1`.

### Bringing across history from the sheet

If you are importing past rounds, the one thing that matters is that **every
historical payment records who the groom was**. The sheet leaves the groom
implied by which column the row sits in; here it is a field on the payment, and
the entire repayment rule depends on it. Also tick `hasBeenGroom` for everyone
who has already had their round.

---

## Part 4 — Running a round

1. **Rounds → Open a round.** Pick the groom and both dates. The app tells you
   how many members he collects from before you commit.
2. **Review the dues.** Every row shows the amount *and the reason for it*:

   | Reason | Means |
   |---|---|
   | **Standard** | His standing amount — ₹7,000 unless you changed it |
   | **This round only** | A one-off you set. Does not carry forward |
   | **Repayment** 🔒 | He is repaying exactly what this groom gave him. Fixed by history and not editable |
   | **Groom** | Pays nothing into his own round |
   | **Opted out** | Zero this round, and he forfeits this groom's contribution in his own round |

3. **Publish these dues** to store the reviewed sheet as the round's record.
4. **Payments → Record payment** as money comes in. Partial payments are fine;
   they accumulate.
5. **Handover.** Each coordinator hands his own team's total straight to the
   groom and marks it — four separate handovers, not one pooled payment.
6. **Close round** when it is done. If it came up short, closing marks the
   reduced figure as final. Nothing special happens to the ledger: because
   repayment mirrors what was actually received, each member is now owed back
   only what he actually gave.

---

## Part 5 — Everyday questions

**Someone's amount needs changing.**
Open the round → **Edit** on his row. You must pick a scope: *only this round*
(the normal case) or *from this round onward* (becomes his standing amount).
Rows marked **Repayment** cannot be edited — the figure is fixed by what
actually changed hands.

**Someone can't afford this round.**
Same dialog → tick **Opt out of this round**, with a reason. His due goes to
zero and he forfeits this groom's contribution in his own round. He cannot opt
out of a **Repayment**.

**A payment was recorded wrong.**
Payments → **Edit**. Payments are never deleted; the correction leaves a
permanent "edited" marker and an audit entry with your reason. Be aware it
changes what that member is owed back in his own round.

**Why does he owe ₹7,000 and I owe ₹3,500?**
Open **Mine** — every row carries its reason. Almost always the answer is that
one of you is repaying an earlier receipt and the other is paying a standard
amount.

**Someone is leaving the scheme.**
Settlement (admin only). The app works out every pairwise obligation. A member
who has already had his round must repay everyone before he can go — the exit
stays blocked until every line is marked settled. A member who never had his
round is refunded in full.

**Someone forgot which Google account they used.**
Members → Edit → change the email to the one they actually use. The app
re-syncs their access automatically.

**Adding a second admin, or handing the role over.**
Members → Edit → Role → Admin. The app then asks which you mean:

- **Add as an additional admin** (the default) — you both keep full access.
  Useful if you want someone to cover for you.
- **Hand over** — you drop to ordinary member the moment it saves.

Handing over is deliberate because you cannot undo it yourself: once you are
not an admin, you cannot make yourself one again. Someone else has to.

For the same reason the app refuses to remove the last admin. If it did, no
account would be left that could write anything — including putting one back.
Make someone else an admin first.

**The public page shows nothing.**
It reads a separate, deliberately small projection. Open a round and press
**Publish to public page**. Nothing else in the database is world-readable.

---

## Part 6 — Staying inside the free tier

The free Spark plan allows 50,000 document reads, 20,000 writes and 20,000
deletes per day, and 1 GiB stored. A 33-person kuri uses a rounding error of
that.

The app holds three live listeners open while somebody has it open — members,
rounds and payments — and computes everything else in the browser. For a group
this size that is a few hundred reads per person per day at the very most.

Check usage any time under **Firestore → Usage**.

---

## Troubleshooting

**A white page, or "Firebase isn't configured yet".**
`config.js` still has `PASTE_…` placeholders in it.

**"Missing or insufficient permissions."**
Nine times out of ten the rules were not pasted, or were pasted from an older
copy of `firestore.rules` than the code you are running. Redo Part 1 step 5
with the file from *this* folder.

**Sign-in popup opens and immediately closes, or "unauthorised domain".**
Add your live web address under **Authentication → Settings → Authorized
domains**.

**"Not on the member list" after signing in.**
That Google account is not on the roster. The email on the member record has to
match exactly what they sign in with — check for a stray `.` or a different
Gmail address. The admin fixes it under Members → Edit.

**A member suddenly can't see anything.**
Their `memberIndex` entry has drifted from their member record. Re-save them
through **Members → Edit** — that re-syncs it.

**The setup screen appears on a project that is already set up.**
It should not — the app only shows it on a definite "no setup found". If you
see it anyway, do **not** complete it; reload instead. Completing it is
harmless (the rules refuse it once `settings/app` exists) but confusing.

**Everything sits on a loading shimmer.**
The app waits about 12 seconds before saying it cannot reach the server, then
offers Retry. Usually a connection problem; occasionally the rules again.

**How do I wipe everything and start again?**
Firebase console → Firestore → delete each collection, including `settings`.
Reload the app and it offers first-run setup again.
