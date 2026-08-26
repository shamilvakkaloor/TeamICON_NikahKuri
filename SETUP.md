# Setup

About 20 minutes end to end. Most of it happens in a browser.

---

## 1. Create the Firebase project

Go to <https://console.firebase.google.com>, signed in with the Google account
that will own this.

- **Add project** → name it (e.g. `nikah-kuri-icon`) → Continue
- Google Analytics: **off**. It adds a step and you don't need it.
- Create → wait ~30 seconds → Continue

You stay on the free **Spark** plan for everything this build uses.

### Firestore

**Build → Firestore Database → Create database**

- Location: **`asia-south1`** (Mumbai). **This cannot be changed later.**
- Start in **production mode** — the rules get replaced in step 4 anyway.

### Authentication

**Build → Authentication → Get started → Google → Enable** → pick a support
email → Save.

Everyone signs in with their own real Google account. No passwords to manage,
no SMS costs, and it works the same for the member on a UAE number.

### Storage (optional)

Only needed for member photos. Firebase Storage now requires the Blaze plan —
skip it if you'd rather not add a card. The app works fine without photos.

---

## 2. Copy the config

**Project Overview** → **+ Add app** → web icon `</>` → register (leave
"Firebase Hosting" unticked; you'll wire that up in step 6).

You'll see a `const firebaseConfig = { … }` block. Copy the six values into
`.env.local`:

```bash
cp .env.example .env.local
```

```
VITE_FIREBASE_API_KEY=AIza…
VITE_FIREBASE_AUTH_DOMAIN=nikah-kuri-icon.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=nikah-kuri-icon
VITE_FIREBASE_STORAGE_BUCKET=nikah-kuri-icon.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef
```

Need them again later? **Project settings** (gear) → **Your apps** → **SDK
setup and configuration**.

> These values are public. Anyone can read them in your page source, and that's
> fine — they identify the project, they don't grant access to it. All access
> control lives in the rules.

---

## 3. Seed the first admin — do this before deploying rules

**This is the step people get wrong, and it locks you out if you skip it.**

The security rules resolve who you are by reading `memberIndex/{your-email}`.
That document is admin-only to write. Before any admin exists, nobody can
create it — so the first one has to be made by hand.

In **Firestore Database → Start collection**:

- Collection ID: `memberIndex`
- Document ID: **your Google account email, lowercased** — e.g.
  `m.shamilvakkaloor07@gmail.com`
- Fields:

| Field | Type | Value |
|---|---|---|
| `role` | string | `admin` |
| `team` | string | one of `KODUVALLY` `KOZHIKODE` `MALAPPURAM` `VADAKARA` |
| `status` | string | `active` |
| `memberId` | string | leave empty for now |

Then create your own **`members`** document (Start collection → `members` →
auto-ID) with at least:

| Field | Type | Value |
|---|---|---|
| `name` | string | your name |
| `email` | string | the same email, lowercased |
| `team` | string | same team as above |
| `role` | string | `admin` |
| `status` | string | `active` |
| `hasBeenGroom` | boolean | `false` |
| `joinedAtKuriNumber` | number | `1` |
| `standingAmount` | number | `7000` |
| `amountHistory` | array | empty |

Finally, copy that document's auto-ID back into the `memberId` field of your
`memberIndex` document.

From here on the app maintains `memberIndex` itself — every member you add or
edit through the UI keeps it in step. You never touch it by hand again.

---

## 4. Deploy the rules

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # pick your project
firebase deploy --only firestore:rules,storage
```

Check it worked: sign in to the app. If you see **"Not on the member list"**,
your `memberIndex` document ID doesn't exactly match your Google email — check
for capitals or a stray space.

> Keep rules deploys manual. A bad one locks the group out or exposes payment
> data, and that's not something you want happening on a git push.

---

## 5. Import the group

With admin access you can add members through **Members → Add member**. For
each: name, team, Google email, mobile, and **joined at Kuri**.

`joinedAtKuriNumber` matters and can't be changed afterwards. It's what makes
a late joiner correctly collect from fewer members — he owes nothing to rounds
before it, and their grooms owe him nothing back. Founding members are `1`.

If you're bringing across history from the sheet, the important part is that
**every historical payment needs `toMemberId`** — the groom of the round it
went into. The sheet leaves the groom implied by the column; backfilling it
onto a year of history later is painful, and rule 2 doesn't work without it.
Set `hasBeenGroom: true` on everyone who has already had a round.

---

## 6. Deploy the app

```bash
firebase init hosting:github
```

Point it at this repo and let it write the workflow. Then add the six
`VITE_FIREBASE_*` values as **repository secrets** in GitHub
(Settings → Secrets and variables → Actions) — the build needs them, and they
aren't in the repo.

After that:

- **Push to `main`** → builds and deploys live
- **Open a PR** → a preview channel URL to check changes safely

---

## Troubleshooting

**"Not on the member list" after signing in.** The `memberIndex` document ID
must be your email, lowercased, exactly. This is also what you'll see if a
member's email was edited without going through the app.

**A member suddenly can't see anything.** Their `memberIndex` entry is out of
step with their `members` document. Re-save them through **Members → Edit** —
that re-syncs it.

**Missing or insufficient permissions.** Rules aren't deployed yet, or you're
signed in as someone not on the roster.

**The dashboard shows a due you don't expect.** Open the round and read the
reason on that member's row — every figure carries its basis. `Repayment` means
it's mirroring an earlier receipt and is locked; that's rule 1 working, not a
bug.
