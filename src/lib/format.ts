/** INR only — no other currency is accepted (rule 22). */

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const plain = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** ₹1,23,456 — Indian lakh grouping. */
export function money(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  return inr.format(amount);
}

/** Same grouping, no symbol — for table columns that carry their own header. */
export function number(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  return plain.format(amount);
}

/** Signed figure for the ledger: +₹7,000 / −₹7,000. */
export function signedMoney(amount: number): string {
  if (amount === 0) return money(0);
  return `${amount > 0 ? '+' : '−'}${inr.format(Math.abs(amount))}`;
}

export function date(value: number | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** "12 days left" / "Passed 3 days ago" for the Kuri Last Date countdown. */
export function countdown(target: number | null | undefined): {
  label: string;
  tone: 'ok' | 'warn' | 'past';
} {
  if (!target) return { label: 'No date set', tone: 'ok' };
  const days = Math.ceil((target - Date.now()) / 86_400_000);
  if (days < 0) return { label: `${Math.abs(days)} days past due`, tone: 'past' };
  if (days === 0) return { label: 'Due today', tone: 'warn' };
  if (days <= 7) return { label: `${days} days left`, tone: 'warn' };
  return { label: `${days} days left`, tone: 'ok' };
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
