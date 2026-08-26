/** INR only — no other currency is accepted (rule 22). */

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const plain = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** ₹1,23,456 — Indian lakh grouping. */
export function money(amount) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return inr.format(amount);
}

/** Same grouping, no symbol — for columns that carry their own header. */
export function num(amount) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return plain.format(amount);
}

export function fmtDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** For the Kuri Last Date countdown on the dashboard. */
export function countdown(target) {
  if (!target) return { label: "No date set", tone: "ok" };
  const days = Math.ceil((target - Date.now()) / 86_400_000);
  if (days < 0) return { label: `${Math.abs(days)} days past due`, tone: "past" };
  if (days === 0) return { label: "Due today", tone: "warn" };
  if (days <= 7) return { label: `${days} days left`, tone: "warn" };
  return { label: `${days} days left`, tone: "ok" };
}

export function initials(name) {
  return (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

/** yyyy-mm-dd, for <input type="date">. */
export function dateInputValue(ms) {
  const d = ms ? new Date(ms) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
