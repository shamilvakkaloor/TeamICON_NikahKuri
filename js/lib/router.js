/**
 * Hash routing.
 *
 * Hashes rather than paths because the app is dropped onto Netlify, GitHub
 * Pages or Cloudflare as a plain folder — there is no server to configure a
 * rewrite on, and `/#/rounds/abc` survives a refresh where `/rounds/abc`
 * would 404.
 */

const routes = [];
let onNavigate = null;
let currentCleanup = null;

export function route(pattern, handler) {
  // "/rounds/:kuriId" → /^#?\/rounds\/([^/]+)$/
  const names = [];
  const source = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\/:([A-Za-z0-9_]+)/g, (_, name) => {
      names.push(name);
      return "/([^/]+)";
    });
  routes.push({ regex: new RegExp(`^${source}$`), names, handler });
}

export function startRouter(handleNavigate) {
  onNavigate = handleNavigate;
  window.addEventListener("hashchange", resolve);
  resolve();
}

export function navigate(path) {
  if (currentPath() === path) resolve();
  else window.location.hash = path;
}

export function currentPath() {
  const raw = window.location.hash.replace(/^#/, "");
  return raw || "/";
}

export function resolve() {
  const path = currentPath();

  // Pages that attach listeners return a cleanup function; running it before
  // the next render is what stops old Firestore subscriptions piling up.
  if (typeof currentCleanup === "function") currentCleanup();
  currentCleanup = null;

  for (const { regex, names, handler } of routes) {
    const match = path.match(regex);
    if (!match) continue;
    const params = {};
    names.forEach((name, i) => {
      params[name] = decodeURIComponent(match[i + 1]);
    });
    currentCleanup = onNavigate ? onNavigate(handler, params, path) : handler(params);
    return;
  }

  navigate("/");
}
