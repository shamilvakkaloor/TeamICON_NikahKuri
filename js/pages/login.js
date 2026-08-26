import { el, Button, Notice } from "../lib/ui.js";
import { brandMark } from "../lib/icons.js";
import { authStore, signIn } from "../lib/auth.js";

export function renderLogin(app) {
  const { error } = authStore.get();

  app.replaceChildren(
    el(
      "div.centre-page",
      el(
        "div.centre-card.stack",
        el(
          "div",
          el("div", { style: { marginBottom: "var(--s4)" } }, brandMark(64)),
          el("h1", { style: { fontSize: "var(--text-2xl)" } }, "Nikah Kuri"),
          el(
            "p.muted.small",
            { style: { marginTop: "var(--s2)" } },
            "Team ICON — a rotating wedding fund kept honestly, in one ledger.",
          ),
        ),
        error ? Notice(error, "danger") : null,
        Button("Sign in with Google", { onClick: signIn, variant: "block" }),
        el(
          "p.xs.muted",
          "Sign in with the Google account registered against your name in the group.",
        ),
        el("a.small", { href: "#/public" }, "View round summaries without signing in →"),
      ),
    ),
  );
}

export function renderUnrecognised(app) {
  const { firebaseUser } = authStore.get();

  app.replaceChildren(
    el(
      "div.centre-page",
      el(
        "div.centre-card.stack",
        el("h1", { style: { fontSize: "var(--text-xl)" } }, "Not on the member list"),
        Notice(
          `${firebaseUser?.email || "This account"} isn’t registered against any member of the kuri. ` +
            "Ask the admin to add this email to your member record, then sign in again.",
          "warn",
        ),
        Button("Sign out", {
          variant: "outline block",
          onClick: () => import("../lib/auth.js").then((m) => m.signOutNow()),
        }),
        el("a.small", { href: "#/public" }, "View public round summaries →"),
      ),
    ),
  );
}

export function renderUnconfigured(app) {
  app.replaceChildren(
    el(
      "div.centre-page",
      el(
        "div.centre-card.stack",
        { style: { maxWidth: "520px", textAlign: "left" } },
        el("h1", { style: { fontSize: "var(--text-xl)" } }, "Firebase isn’t configured yet"),
        Notice(
          "Open config.js in this folder and replace the six PASTE_… placeholders with the values from your Firebase project.",
          "info",
        ),
        el(
          "p.small.muted",
          "Firebase Console → Settings → Project settings → Your apps → SDK setup and configuration. " +
            "Then reload this page. Full walkthrough in SETUP.md.",
        ),
      ),
    ),
  );
}
