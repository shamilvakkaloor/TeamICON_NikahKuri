/**
 * The app shell: sidebar on desktop, bottom nav on mobile, and the page
 * container everything renders into.
 */

import { el, clear, Avatar, Button } from "./ui.js";
import { icon } from "./icons.js";
import { authStore, isAdmin, isCoordinator, signOutNow } from "./auth.js";
import { currentPath, navigate } from "./router.js";

const PRIMARY = [
  { path: "/", label: "Home", icon: "home" },
  { path: "/rounds", label: "Rounds", icon: "rounds" },
  { path: "/payments", label: "Payments", icon: "payment" },
  { path: "/mine", label: "Mine", icon: "wallet" },
];

const SECONDARY = [
  { path: "/members", label: "Members", icon: "users" },
  { path: "/reports", label: "Reports", icon: "report" },
  { path: "/pairs", label: "Who owes whom", icon: "scale" },
  { path: "/handover", label: "Handover", icon: "handover", coordinator: true },
  { path: "/settlement", label: "Settlement", icon: "settings", admin: true },
  { path: "/audit", label: "Audit log", icon: "audit", admin: true },
];

const TITLES = {
  "/": "Nikah Kuri",
  "/rounds": "Kuri rounds",
  "/payments": "Payments",
  "/mine": "My contributions",
  "/members": "Members",
  "/reports": "Reports",
  "/pairs": "Who owes whom",
  "/handover": "Team handover",
  "/settlement": "Settlement",
  "/audit": "Audit log",
};

const visible = (item) =>
  (!item.admin || isAdmin()) && (!item.coordinator || isCoordinator());

function navLink(item, { onNavigate } = {}) {
  const active = currentPath() === item.path;
  const link = el(
    `a.nav-link${active ? ".active" : ""}`,
    {
      href: `#${item.path}`,
      onclick: () => onNavigate && onNavigate(),
    },
    item.label,
  );
  link.prepend(icon(item.icon, 18));
  return link;
}

let shellRoot = null;
let contentNode = null;

/** Builds the chrome once; later navigations only swap the content node. */
export function renderShell(app) {
  const { member, firebaseUser } = authStore.get();
  const secondary = SECONDARY.filter(visible);

  const sidebar = el(
    "nav.sidebar",
    el(
      "div.brand",
      el("span.brand-mark", "N"),
      el("span", el("span.brand-name", "Nikah Kuri"), el("br"), el("span.brand-sub", "Team ICON")),
    ),
    PRIMARY.map((item) => navLink(item)),
    el("div.nav-section", "Group"),
    secondary.map((item) => navLink(item)),
  );

  const topbar = el(
    "header.topbar",
    el("h1", TITLES[currentPath()] || "Nikah Kuri"),
    member ? el("span.badge", member.role) : null,
    member ? Avatar(member.name, member.photoUrl) : null,
    Button("Sign out", {
      variant: "ghost",
      size: "sm",
      onClick: signOutNow,
      title: firebaseUser?.email || "",
    }),
  );

  contentNode = el("main.content");

  const bottomNav = el("nav.bottom-nav");
  for (const item of PRIMARY) {
    const link = el(
      `a${currentPath() === item.path ? ".active" : ""}`,
      { href: `#${item.path}` },
      el("span", item.label),
    );
    link.prepend(icon(item.icon, 20));
    bottomNav.append(link);
  }
  bottomNav.append(
    (() => {
      const b = el("button", { type: "button", onclick: () => openMoreSheet(secondary) }, el("span", "More"));
      b.prepend(icon("more", 20));
      return b;
    })(),
  );

  shellRoot = el("div.shell", sidebar, el("div.main", topbar, contentNode), bottomNav);
  clear(app).append(shellRoot);
  return contentNode;
}

/** Called on every navigation: refresh the active states and the title. */
export function refreshShellChrome() {
  if (!shellRoot) return;
  const path = currentPath();

  shellRoot.querySelectorAll(".sidebar .nav-link, .bottom-nav a").forEach((link) => {
    const target = link.getAttribute("href")?.replace(/^#/, "");
    link.classList.toggle("active", target === path);
  });

  const heading = shellRoot.querySelector(".topbar h1");
  if (heading) heading.textContent = TITLES[path] || "Nikah Kuri";
}

export function contentHost() {
  return contentNode;
}

function openMoreSheet(items) {
  const backdrop = el("div.dialog-backdrop");
  const close = () => backdrop.remove();
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  backdrop.append(
    el(
      "div.dialog",
      el("header.dialog-head", el("h2", "More")),
      el(
        "div.dialog-body",
        el(
          "div.stack",
          items.map((item) =>
            navLink(item, {
              onNavigate: () => {
                close();
                setTimeout(() => navigate(item.path), 0);
              },
            }),
          ),
        ),
      ),
    ),
  );
  document.body.append(backdrop);
}
