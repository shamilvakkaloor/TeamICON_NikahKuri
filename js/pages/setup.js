/**
 * First run.
 *
 * The person doing the setup becomes the admin. This exists so nobody has to
 * hand-create documents in the Firebase console to bootstrap the first admin —
 * the security rules allow exactly one non-admin write, guarded by
 * `settings/app` not existing yet, and this screen is it.
 */

import { el, Button, Field, Input, Notice, Select, toast } from "../lib/ui.js";
import { brandMark } from "../lib/icons.js";
import { TEAMS } from "../domain/ledger.js";
import { completeSetup } from "../lib/crud.js";
import { getFirebaseAuth, googleProvider, signInWithPopup } from "../lib/firebase.js";
import { friendlyAuthError } from "../lib/auth.js";

export function renderSetup(app) {
  const state = { groupName: "Team ICON", name: "", team: "KOZHIKODE", busy: false, error: null };

  function draw() {
    const user = getFirebaseAuth().currentUser;

    const body = user
      ? [
          Notice(
            `You are signed in as ${user.email}. This account becomes the admin — it can add members, open rounds and record payments.`,
            "info",
          ),
          Field({
            label: "Group name",
            control: Input({
              value: state.groupName,
              oninput: (e) => {
                state.groupName = e.target.value;
              },
            }),
          }),
          Field({
            label: "Your name",
            hint: "As the group knows you. You are a kuri member too — you pay in and take your turn.",
            control: Input({
              value: state.name,
              oninput: (e) => {
                state.name = e.target.value;
              },
            }),
          }),
          Field({
            label: "Your team",
            control: Select(
              TEAMS.map((t) => ({ value: t, label: t })),
              {
                value: state.team,
                onChange: (v) => {
                  state.team = v;
                },
              },
            ),
          }),
          state.error ? Notice(state.error, "danger") : null,
          Button(state.busy ? "Setting up…" : "Finish setup", {
            variant: "block",
            disabled: state.busy,
            onClick: finish,
          }),
        ]
      : [
          Notice(
            "Sign in with the Google account that will run the kuri. It becomes the admin.",
            "info",
          ),
          state.error ? Notice(state.error, "danger") : null,
          Button("Sign in with Google", { variant: "block", onClick: signInFirst }),
        ];

    app.replaceChildren(
      el(
        "div.centre-page",
        el(
          "div.centre-card.stack",
          { style: { maxWidth: "460px", textAlign: "left" } },
          el(
            "div",
            { style: { textAlign: "center" } },
            brandMark(56),
            el("h1", { style: { fontSize: "var(--text-xl)", marginTop: "var(--s3)" } }, "Set up the kuri"),
            el("p.muted.small", { style: { marginTop: "var(--s2)" } }, "This runs once."),
          ),
          ...body,
        ),
      ),
    );
  }

  async function signInFirst() {
    state.error = null;
    try {
      await signInWithPopup(getFirebaseAuth(), googleProvider);
      draw();
    } catch (e) {
      // The setup screen is exactly where a first deploy hits
      // auth/unauthorized-domain, so it needs the explanatory message rather
      // than the raw Firebase one.
      state.error = friendlyAuthError(e);
      draw();
    }
  }

  async function finish() {
    const user = getFirebaseAuth().currentUser;
    if (!user) return;
    if (!state.name.trim()) {
      state.error = "Your name is required.";
      return draw();
    }

    state.busy = true;
    state.error = null;
    draw();

    try {
      await completeSetup({
        groupName: state.groupName.trim() || "Team ICON",
        name: state.name.trim(),
        email: user.email,
        team: state.team,
      });
      toast("Setup complete — you are the admin.", "success");
      window.location.reload();
    } catch (e) {
      state.busy = false;
      state.error =
        e?.code === "permission-denied"
          ? "Permission denied. The security rules haven’t been pasted into the Firebase console yet — see SETUP.md step 5."
          : e?.message || "Setup failed.";
      draw();
    }
  }

  draw();
}
