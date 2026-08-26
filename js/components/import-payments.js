/**
 * Import the JOURNAL — historical payments.
 *
 * The one thing that matters here is `toMemberId`, the groom the money went
 * to. The sheet never records it: it is implied by which column a row sits in.
 * Rather than ask for it (and let a typo attach a payment to the wrong groom),
 * this derives it from the round's own groom. That makes it impossible for an
 * imported payment to disagree with its round, which is what the entire
 * repayment rule depends on.
 *
 * Members and rounds must both be imported first.
 */

import { el, Notice } from "../lib/ui.js";
import { openCsvImport, makeCounts } from "./csv-import.js";
import { fmtDate, money, parseLooseDate } from "../lib/format.js";
import { data } from "../lib/data.js";
import { recordPayment } from "../lib/crud.js";
import { currentMember } from "../lib/auth.js";

const HEADERS = ["Kuri number", "Email", "Amount", "Date", "Note"];

const TEMPLATE = [
  ["1", "abdulfathahmuthu528528@gmail.com", "7000", "2024-03-02", ""],
  ["1", "vmadhil786@gmail.com", "5000", "2024-03-04", "paid in two parts"],
  ["2", "abdulfathahmuthu528528@gmail.com", "7000", "2024-09-06", ""],
];

export function openPaymentsImport({ onImported }) {
  const me = currentMember();

  openCsvImport({
    title: "Import payment history",
    templateName: "nikah-kuri-journal-template.csv",
    templateHeaders: HEADERS,
    templateRows: TEMPLATE,
    noun: (n) => `${n} payment${n === 1 ? "" : "s"}`,
    help: [
      Notice(
        "Required columns: Kuri number, Email, Amount. Optional: Date, Note. " +
          "One row per payment — if somebody paid in instalments, give each its own row.",
        "info",
      ),
      el(
        "p.small.muted",
        "Import ",
        el("strong", "members and rounds first"),
        ". Who the money went to is taken from the round’s groom rather than read from the file, " +
          "so an imported payment can never be attached to the wrong person.",
      ),
      el(
        "p.small.muted",
        "A blank date falls back to the round’s nikah date. Dates may be written 2024-03-15 or " +
          "15/03/2024 (day first) — check the parsed dates in the preview.",
      ),
      el(
        "p.small.muted",
        "Rows that exactly match a payment already recorded are marked as already added and " +
          "skipped, so re-running a partly-finished import is safe.",
      ),
    ],
    columns: [
      { label: "Kuri", get: (v) => v.kuriNumber, num: true },
      { label: "From", get: (v) => v.fromName },
      { label: "To (groom)", get: (v) => v.toName },
      { label: "Amount", get: (v) => money(v.amount), num: true },
      { label: "Date", get: (v) => fmtDate(v.date) },
    ],
    validate,
    write: (value) =>
      recordPayment({
        fromMemberId: value.fromMemberId,
        toMemberId: value.toMemberId,
        kuriId: value.kuriId,
        team: value.team,
        amount: value.amount,
        date: value.date,
        recordedByMemberId: me?.id || "",
        notes: value.notes,
      }),
    onDone: onImported,
  });
}

function validate({ headers, rows }) {
  if (rows.length === 0) throw new Error("That file has no rows under the header line.");

  const required = ["kurinumber", "email", "amount"];
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length) {
    throw new Error(
      `The file is missing a column for: ${missing.join(", ")}. Found: ${headers.filter(Boolean).join(", ") || "nothing"}.`,
    );
  }

  const { members, rounds, payments } = data();
  if (rounds.length === 0) {
    throw new Error("No rounds exist yet. Import the rounds first — a payment belongs to a round.");
  }

  const byEmail = new Map(members.map((m) => [m.email, m]));
  const byNumber = new Map(rounds.map((r) => [r.kuriNumber, r]));
  const memberById = new Map(members.map((m) => [m.id, m]));

  // A payment already recorded for the same person, round, amount and day.
  const existing = new Set(
    payments.map((p) => `${p.kuriId}|${p.fromMemberId}|${p.amount}|${dayKey(p.date)}`),
  );
  const seen = new Set();
  const counts = makeCounts();

  const out = rows.map((raw) => {
    const kuriNumber = Number(raw.kurinumber ?? raw.kuri ?? raw.round);
    const email = (raw.email ?? raw.frommail ?? raw.fromemail ?? raw.from ?? "").trim().toLowerCase();
    const amount = Number(String(raw.amount ?? raw.paid ?? "").replace(/[₹,\s]/g, ""));

    const round = byNumber.get(kuriNumber);
    const payer = byEmail.get(email);
    const groom = round ? memberById.get(round.groomMemberId) : null;

    const date = parseLooseDate(raw.date ?? raw.paidon ?? "") ?? round?.nikahDate ?? null;

    const value = {
      kuriNumber,
      kuriId: round?.id || "",
      fromMemberId: payer?.id || "",
      fromName: payer?.name || email || "—",
      toMemberId: round?.groomMemberId || "",
      toName: groom?.name || "—",
      team: payer?.team || "",
      amount,
      date,
      notes: (raw.note ?? raw.notes ?? "").trim(),
    };
    const label = `Kuri ${raw.kurinumber ?? "?"} · ${email || "?"}`;

    const fail = (reason) => {
      counts.error++;
      return { value, label, status: "error", reason };
    };

    if (!Number.isFinite(kuriNumber)) return fail("kuri number is not a number");
    if (!round) return fail(`no round numbered ${kuriNumber} — import rounds first`);
    if (!email) return fail("no email");
    if (!payer) return fail(`no member with the email ${email}`);
    if (!groom) return fail("that round has no groom on the member list");
    if (!Number.isFinite(amount) || amount <= 0) return fail("amount must be more than zero");

    // Rule 3: the groom pays nothing into his own round. A row like this is
    // almost always a mis-keyed email rather than a real payment.
    if (payer.id === round.groomMemberId) {
      return fail(`${payer.name} is the groom of Kuri ${kuriNumber} — he pays nothing into it`);
    }

    // Rule 7: a joiner owes nothing to rounds before he arrived.
    if (payer.joinedAtKuriNumber > kuriNumber) {
      return fail(`${payer.name} joined at Kuri ${payer.joinedAtKuriNumber}, after this round`);
    }

    const key = `${round.id}|${payer.id}|${amount}|${dayKey(date)}`;
    if (seen.has(key)) return fail("this exact payment appears twice in the file");
    seen.add(key);

    if (existing.has(key)) {
      counts.duplicate++;
      return { value, label, status: "duplicate", reason: "already recorded" };
    }

    counts.new++;
    return { value, label, status: "new" };
  });

  return { rows: out, counts };
}

function dayKey(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
