/**
 * Sign-in and role resolution.
 *
 * Members sign in with their own Google account. The account is matched to a
 * kuri member by email, which is why every member record carries the exact
 * Gmail address the admin was given.
 */

import {
  getFirebaseAuth,
  googleProvider,
  isFirebaseConfigured,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "./firebase.js";
import { createStore } from "./store.js";
import { dataStore, startDataListeners, stopDataListeners } from "./data.js";
import { isSetupComplete } from "./crud.js";

/** status: "loading" | "setup" | "signed_out" | "unrecognised" | "ready" */
export const authStore = createStore({
  status: "loading",
  firebaseUser: null,
  member: null,
  error: null,
});

export const currentMember = () => authStore.get().member;
export const isAdmin = () => authStore.get().member?.role === "admin";
export const isCoordinator = () => {
  const role = authStore.get().member?.role;
  return role === "coordinator" || role === "admin";
};

export async function initAuth() {
  if (!isFirebaseConfigured()) {
    authStore.set({ status: "unconfigured" });
    return;
  }

  onAuthStateChanged(getFirebaseAuth(), (user) => {
    if (!user) {
      stopDataListeners();

      // Show the login straight away rather than waiting on a Firestore read.
      // Signing in does not depend on that read, and on a poor connection
      // gating the screen behind it leaves a member staring at a spinner when
      // the thing they came to do would have worked.
      authStore.set({ status: "signed_out", firebaseUser: null, member: null });

      // Then, in the background, find out whether this project has ever been
      // set up. Only a definite "no" switches to the first-run screen — a
      // timeout or an error leaves the login in place.
      checkSetup().then((pending) => {
        if (pending && authStore.get().status === "signed_out") {
          authStore.set({ status: "setup" });
        }
      });
      return;
    }

    authStore.set({ firebaseUser: user });
    startDataListeners();
  });

  // The roster arrives asynchronously, so resolving which member is signed in
  // has to react to it rather than read it once.
  dataStore.subscribe(({ members, loading }) => {
    const { firebaseUser } = authStore.get();
    if (!firebaseUser) return;

    const email = (firebaseUser.email || "").toLowerCase();
    const member = members.find((m) => m.email === email) || null;

    if (member) {
      authStore.set({ status: "ready", member });
    } else if (!loading) {
      // Only after the roster has actually loaded — otherwise a slow first
      // snapshot flashes the "not on the list" screen at a legitimate member.
      authStore.set({ status: "unrecognised", member: null });
    }
  });
}

/**
 * Has this project never been set up?
 *
 * Firestore retries an unreachable backend quietly and indefinitely, so this
 * read can hang rather than fail. It races a deadline and reports "not
 * pending" on timeout, because showing the login to a first-run user is a far
 * smaller mistake than showing the setup screen to an existing group.
 */
async function checkSetup() {
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), 6000));
  const probe = isSetupComplete()
    .then((done) => !done)
    .catch(() => false);
  return Promise.race([probe, timeout]);
}

export async function signIn() {
  authStore.set({ error: null });
  try {
    await signInWithPopup(getFirebaseAuth(), googleProvider);
  } catch (e) {
    authStore.set({ error: friendlyAuthError(e) });
  }
}

export async function signOutNow() {
  stopDataListeners();
  await signOut(getFirebaseAuth());
}

function friendlyAuthError(e) {
  const code = e?.code || "";
  if (code.includes("popup-closed")) return "Sign-in was cancelled.";
  if (code.includes("popup-blocked")) {
    return "Your browser blocked the sign-in popup. Allow popups for this site and try again.";
  }
  if (code.includes("unauthorized-domain")) {
    return "This web address isn’t authorised in Firebase. Add it under Authentication → Settings → Authorized domains.";
  }
  if (code.includes("operation-not-allowed")) {
    return "Google sign-in isn’t switched on for this Firebase project yet (SETUP.md, step 3).";
  }
  return e?.message || "Sign-in failed.";
}
