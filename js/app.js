/**
 * Boot.
 *
 * Auth state decides which of five things is on screen: the config notice, the
 * first-run setup, the login, the "not on the list" wall, or the app shell.
 * Only the last one mounts the router.
 */

import { el, Notice, Skeleton } from "./lib/ui.js";
import { authStore, initAuth } from "./lib/auth.js";
import { dataStore } from "./lib/data.js";
import { contentHost, refreshShellChrome, renderShell } from "./lib/shell.js";
import { navigate, resolve, route, startRouter, currentPath } from "./lib/router.js";

import { renderLogin, renderUnconfigured, renderUnrecognised } from "./pages/login.js";
import { renderSetup } from "./pages/setup.js";
import { renderPublic } from "./pages/public.js";
import { renderDashboard } from "./pages/dashboard.js";
import { renderRounds } from "./pages/rounds.js";
import { renderRoundDetail } from "./pages/round-detail.js";
import { renderPayments } from "./pages/payments.js";
import { renderMine } from "./pages/mine.js";
import { renderMembers } from "./pages/members.js";
import { renderReports } from "./pages/reports.js";
import { renderPairs } from "./pages/pairs.js";
import { renderHandover } from "./pages/handover.js";
import { renderAudit } from "./pages/audit.js";
import { renderSettlement } from "./pages/settlement.js";

const app = document.getElementById("app");

route("/", renderDashboard);
route("/rounds", renderRounds);
route("/rounds/:kuriId", renderRoundDetail);
route("/payments", renderPayments);
route("/mine", renderMine);
route("/members", renderMembers);
route("/reports", renderReports);
route("/pairs", renderPairs);
route("/handover", renderHandover);
route("/settlement", renderSettlement);
route("/settlement/:memberId", renderSettlement);
route("/audit", renderAudit);

let mountedStatus = null;
let routerStarted = false;
let stallTimer = null;

authStore.subscribe((state) => {
  // The public page stands outside the auth gate entirely.
  if (currentPath().startsWith("/public")) {
    if (mountedStatus !== "public") {
      mountedStatus = "public";
      renderPublic(app);
    }
    return;
  }

  if (state.status === mountedStatus && state.status !== "ready") return;

  // Any screen other than the spinner cancels the "still trying" fallback.
  // Without this it fires later and overwrites a perfectly good screen with a
  // misleading connection warning.
  if (state.status !== "loading") clearTimeout(stallTimer);

  switch (state.status) {
    case "unconfigured":
      mountedStatus = state.status;
      return renderUnconfigured(app);

    case "setup":
      mountedStatus = state.status;
      return renderSetup(app);

    case "signed_out":
      mountedStatus = state.status;
      return renderLogin(app);

    case "unrecognised":
      mountedStatus = state.status;
      return renderUnrecognised(app);

    case "ready":
      if (mountedStatus !== "ready") {
        mountedStatus = "ready";
        renderShell(app);
        if (!routerStarted) {
          routerStarted = true;
          startRouter((handler, params) => handler(contentHost(), params));
        } else {
          resolve();
        }
      }
      return;

    default:
      mountedStatus = "loading";
      return renderLoading();
  }
});

// Firestore retries a dropped connection silently and forever, so a first load
// with no network never resolves. Say so rather than spinning indefinitely.
function renderLoading() {
  app.replaceChildren(el("div.centre-page", el("div.centre-card.stack", Skeleton(3))));

  clearTimeout(stallTimer);
  stallTimer = setTimeout(() => {
    if (authStore.get().status !== "ready") {
      app.replaceChildren(
        el(
          "div.centre-page",
          el(
            "div.centre-card.stack",
            Notice(
              "Still trying to reach the server. Check your connection — your data is safe, it " +
                "just can’t load right now.",
              "warn",
            ),
            el(
              "button.btn.outline",
              { onclick: () => window.location.reload() },
              "Retry",
            ),
          ),
        ),
      );
    }
  }, 12_000);
}

// Route changes need to refresh the nav's active state and the page title,
// and to catch someone navigating to (or away from) /public.
window.addEventListener("hashchange", () => {
  const path = currentPath();
  if (path.startsWith("/public")) {
    mountedStatus = "public";
    return renderPublic(app);
  }
  if (mountedStatus === "public") {
    mountedStatus = null;
    return authStore.set({});
  }
  refreshShellChrome();
});

// Surface a listener failure — almost always the rules not being pasted yet.
dataStore.subscribe(({ error }) => {
  if (!error) return;
  const host = contentHost();
  if (host) host.prepend(Notice(error, "danger"));
});

if (window.location.hash.replace(/^#/, "") === "/public") {
  mountedStatus = "public";
  renderPublic(app);
}

initAuth();
