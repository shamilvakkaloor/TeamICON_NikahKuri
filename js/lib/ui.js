/**
 * DOM helpers and the shared component vocabulary.
 *
 * `el` is the whole rendering strategy: build real elements, no virtual DOM,
 * no template strings. Text always goes in as a text node, so a member's name
 * can never be parsed as markup.
 */

import { money, num } from "./format.js";
import { icon } from "./icons.js";
import { photoSrc } from "./photo.js";

/**
 * el("div.card", { onclick }, child, child, …)
 *
 * The tag accepts `tag.class.class#id` shorthand. Children may be nodes,
 * strings, numbers, or null/false/undefined (skipped, so `cond && el(…)`
 * works inline).
 */
export function el(spec, props, ...children) {
  const [tagAndId, ...classes] = String(spec).split(".");
  const [tag, id] = tagAndId.split("#");
  const node = document.createElement(tag || "div");
  if (id) node.id = id;
  if (classes.length) node.className = classes.join(" ");

  if (props && typeof props === "object" && !(props instanceof Node) && !Array.isArray(props)) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === "class") node.className = [node.className, value].filter(Boolean).join(" ");
      else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
      else if (key === "dataset") Object.assign(node.dataset, value);
      else if (key.startsWith("on") && typeof value === "function") {
        node.addEventListener(key.slice(2), value);
      } else if (key === "html") node.innerHTML = value; // only ever our own SVG
      else if (key in node && key !== "list") node[key] = value;
      else node.setAttribute(key, value);
    }
  } else if (props !== undefined && props !== null) {
    children.unshift(props);
  }

  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

// --- money ----------------------------------------------------------------

/**
 * Every figure that represents money goes through here, so the tabular face
 * and the size scale stay consistent and columns line up.
 *
 * @param {number} amount
 * @param {{size?: "hero"|"lg"|"row"|"sm", tone?: "paid"|"owed"|"muted"}} opts
 */
export function Money(amount, { size = "row", tone } = {}) {
  const sizeClass = size === "row" ? "row-size" : size;
  return el(`span.money.${sizeClass}${tone ? `.${tone}` : ""}`, money(amount));
}

// --- structure ------------------------------------------------------------

export function Card({ title, action, body, tight, padded = true } = {}) {
  const card = el("section.card");
  if (title) {
    card.append(el("header.card-head", el("h2", title), action || null));
  }
  if (body) {
    card.append(padded ? el(`div.card-body${tight ? ".tight" : ""}`, body) : body);
  }
  return card;
}

/**
 * A headline figure. `count: true` for things that are not money — a rupee
 * sign in front of "31 members still to receive" is simply wrong.
 */
export function Stat({ label, amount, note, tone, count = false }) {
  return el(
    "section.card.stat",
    el("div.stat-label", label),
    count
      ? el(`span.money.lg${tone ? `.${tone}` : ""}`, num(amount))
      : Money(amount, { size: "lg", tone }),
    note ? el("div.stat-note", note) : null,
  );
}

export function Badge(text, tone) {
  return el(`span.badge${tone ? `.${tone}` : ""}`, text);
}

export function Progress(value, total) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  const tone = pct >= 100 ? "" : pct >= 60 ? ".warn" : ".short";
  return el(
    `div.progress${tone}`,
    { role: "progressbar", "aria-valuenow": Math.round(pct) },
    el("span", { style: { width: `${pct}%` } }),
  );
}

export function EmptyState({ title, body, action }) {
  return el(
    "div.empty",
    el("h3", title),
    body ? el("p.small", body) : null,
    action ? el("div", { style: { marginTop: "var(--s4)" } }, action) : null,
  );
}

export function Notice(text, tone = "info") {
  return el(`div.notice.${tone}`, text);
}

export function Skeleton(rows = 3) {
  return el(
    "div.stack",
    { "aria-hidden": "true" },
    Array.from({ length: rows }, () => el("div.skeleton")),
  );
}

/**
 * Initials, replaced by the photo only once it has actually loaded.
 *
 * The image is probed detached and swapped in on success, so a dead link —
 * an unshared Drive file, a moved image, no connection — leaves the initials
 * standing rather than the browser's broken-image icon.
 */
export function Avatar(name, photoUrl, large = false) {
  const node = el(
    `span.avatar${large ? ".lg" : ""}`,
    { "aria-hidden": "true" },
    (name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join(""),
  );

  const src = photoSrc(photoUrl);
  if (src) {
    const probe = new Image();
    probe.onload = () => {
      clear(node);
      node.append(el("img", { src, alt: "", loading: "lazy" }));
    };
    probe.src = src;
  }

  return node;
}

export function TeamDot(team) {
  return el("span.team-dot", { style: { background: `var(--team-${team})` } });
}

export function Row({ avatar, title, meta, trailing, actions, dim }) {
  return el(
    `div.ledger-row${dim ? ".dim" : ""}`,
    avatar || null,
    el("div.ledger-main", el("div.ledger-title", title), meta ? el("div.ledger-meta", meta) : null),
    trailing || null,
    actions || null,
  );
}

// --- buttons & forms ------------------------------------------------------

export function Button(label, { onClick, variant = "", size = "", disabled, type = "button", title } = {}) {
  return el(
    `button.btn${variant ? `.${variant}` : ""}${size ? `.${size}` : ""}`,
    { type, disabled: Boolean(disabled), onclick: onClick, title },
    label,
  );
}

export function IconButton(name, { onClick, label, variant = "ghost" } = {}) {
  const b = el(`button.btn.${variant}.icon`, {
    type: "button",
    onclick: onClick,
    "aria-label": label,
    title: label,
  });
  b.append(icon(name));
  return b;
}

export function Field({ label, hint, error, control }) {
  return el(
    "div.field",
    el("label", label),
    control,
    error ? el("span.error", error) : hint ? el("span.hint", hint) : null,
  );
}

export function Input(props = {}) {
  return el("input", { type: "text", ...props });
}

export function MoneyInput(props = {}) {
  return el("input.money-input", { type: "number", min: 0, step: 100, ...props });
}

export function Select(options, { value, onChange, placeholder } = {}) {
  const sel = el("select", { onchange: onChange ? (e) => onChange(e.target.value) : null });
  if (placeholder) sel.append(el("option", { value: "" }, placeholder));
  for (const opt of options) {
    sel.append(el("option", { value: opt.value, selected: opt.value === value }, opt.label));
  }
  if (value !== undefined) sel.value = value;
  return sel;
}

export function Checkbox(label, { checked, onChange } = {}) {
  const input = el("input", {
    type: "checkbox",
    checked: Boolean(checked),
    onchange: onChange ? (e) => onChange(e.target.checked) : null,
    style: { width: "auto", minHeight: 0 },
  });
  return el("label.row.checkbox", input, el("span.small", label));
}

export function Radio(label, { name, checked, onChange } = {}) {
  const input = el("input", {
    type: "radio",
    name,
    checked: Boolean(checked),
    onchange: onChange ? () => onChange() : null,
    style: { width: "auto", minHeight: 0 },
  });
  return el("label.row.checkbox", input, el("span.small", label));
}

// --- dialog ---------------------------------------------------------------

/**
 * Bottom sheet on mobile, centred modal on desktop — the CSS decides which.
 * Returns a close function; Escape and a backdrop click also close it.
 */
export function openDialog({ title, body, footer, wide }) {
  const backdrop = el("div.dialog-backdrop", {
    role: "dialog",
    "aria-modal": "true",
    "aria-label": title,
  });

  function close() {
    backdrop.remove();
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener("keydown", onKey);

  const closeBtn = IconButton("close", { onClick: close, label: "Close" });
  backdrop.append(
    el(
      `div.dialog${wide ? ".lg" : ""}`,
      el("header.dialog-head", el("h2", title), closeBtn),
      el("div.dialog-body", body),
      footer ? el("footer.dialog-foot", footer) : null,
    ),
  );

  document.body.append(backdrop);
  return close;
}

/** A yes/no gate for anything that cannot simply be undone. */
export function confirmDialog({ title, body, confirmLabel = "Confirm", danger, onConfirm }) {
  const close = openDialog({
    title,
    body,
    footer: [
      Button("Cancel", { variant: "outline", onClick: () => close() }),
      Button(confirmLabel, {
        variant: danger ? "danger" : "",
        onClick: async () => {
          await onConfirm();
          close();
        },
      }),
    ],
  });
  return close;
}

// --- toast ----------------------------------------------------------------

let toastHost;

export function toast(message, tone = "info") {
  if (!toastHost) {
    toastHost = el("div.toast-host");
    document.body.append(toastHost);
  }
  const node = el(`div.toast.${tone}`, message);
  toastHost.append(node);
  setTimeout(() => {
    node.classList.add("leaving");
    setTimeout(() => node.remove(), 300);
  }, 3200);
}
