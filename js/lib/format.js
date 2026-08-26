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

/**
 * Parse a date the way it actually appears in a spreadsheet.
 *
 * Accepts ISO (2024-01-15), day-first (15/01/2024, 15-01-2024, 15.1.24) and
 * Excel's serial day number. Day-first rather than month-first because that is
 * what everyone here writes — 03/04/2024 is the 3rd of April.
 *
 * Ambiguity is why every import preview shows the *parsed* date back: the only
 * safe way to settle a date format is to let someone look at the result.
 *
 * @returns {number|null} epoch ms at local midnight, or null if unparseable
 */
export function parseLooseDate(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return atMidnight(+iso[1], +iso[2], +iso[3]);

  const dmy = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (dmy) {
    let year = +dmy[3];
    if (year < 100) year += year < 70 ? 2000 : 1900;
    return atMidnight(year, +dmy[2], +dmy[1]);
  }

  // Excel stores dates as days since 1899-12-30.
  if (/^\d{5}$/.test(s)) {
    const serial = Number(s);
    if (serial > 20000 && serial < 60000) {
      return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).getTime();
    }
  }

  const loose = Date.parse(s);
  return Number.isNaN(loose) ? null : loose;
}

function atMidnight(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  return d.getMonth() === month - 1 && d.getDate() === day ? d.getTime() : null;
}

/** yyyy-mm-dd, for <input type="date">. */
export function dateInputValue(ms) {
  const d = ms ? new Date(ms) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
