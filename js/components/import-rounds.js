/**
 * Import past rounds — the sheet's NIKAH tab.
 *
 * This exists mainly to bring an already-running kuri into the app. Rounds
 * that have finished are created directly as `completed`, which the normal
 * "Open a round" flow cannot do: it only ever opens the single active round.
 *
 * Marking a round completed also sets `hasBeenGroom` on its groom. That flag
 * is what makes every later round treat him as repaying rather than
 * contributing, so importing rounds without it would silently produce wrong
 * dues everywhere.
 */

import { el, Notice } from "../lib/ui.js";
import { openCsvImport, makeCounts } from "./csv-import.js";
import { fmtDate, parseLooseDate } from "../lib/format.js";
import { data } from "../lib/data.js";
import { createRound, updateMember } from "../lib/crud.js";

const HEADERS = ["Kuri number", "Groom email", "Nikah date", "Kuri last date", "Status"];

const TEMPLATE = [
  ["1", "fuhadpp572@gmail.com", "2024-03-15", "2024-03-10", "completed"],
  ["2", "vmadhil786@gmail.com", "2024-09-20", "2024-09-15", "completed"],
];

export function openRoundsImport({ onImported }) {
  openCsvImport({
    title: "Import past rounds",
    templateName: "nikah-kuri-rounds-template.csv",
    templateHeaders: HEADERS,
    templateRows: TEMPLATE,
    noun: (n) => `${n} round${n === 1 ? "" : "s"}`,
    help: [
      Notice(
        "Required columns: Kuri number, Groom email, Nikah date. Optional: Kuri last date, Status.",
        "info",
      ),
      el(
        "p.small.muted",
        "Do this ",
        el("strong", "before"),
        " importing payments — a payment is attached to its round’s groom, which is what makes " +
          "repayments work. The groom’s email must already be on the member list.",
      ),
      el(
        "p.small.muted",
        "Dates may be written 2024-03-15 or 15/03/2024 (day first). ",
        el("strong", "Check the parsed dates in the preview"),
        " — that is the only reliable way to catch a day/month mix-up.",
      ),
      el(
        "p.small.muted",
        "Status defaults to ",
        el("strong", "completed"),
        ". A completed round marks its groom as having had his turn, so he will never be offered " +
          "as groom again and will repay rather than contribute from then on. At most one round " +
          "may be ",
        el("strong", "active"),
        ".",
      ),
    ],
    columns: [
      { label: "Kuri", get: (v) => v.kuriNumber, num: true },
      { label: "Groom", get: (v) => v.groomName },
      { label: "Nikah date", get: (v) => fmtDate(v.nikahDate) },
      { label: "Last date", get: (v) => fmtDate(v.kuriLastDate) },
      { label: "Status", get: (v) => v.status, small: true },
    ],
    validate,
    write: async (value) => {
      await createRound({
        kuriNumber: value.kuriNumber,
        groomMemberId: value.groomMemberId,
        nikahDate: value.nikahDate,
        kuriLastDate: value.kuriLastDate,
        status: value.status,
      });
      if (value.status === "completed") {
        const groom = data().members.find((m) => m.id === value.groomMemberId);
        if (groom && !groom.hasBeenGroom) {
          await updateMember(groom.id, { hasBeenGroom: true }, groom);
        }
      }
    },
    onDone: onImported,
  });
}

function validate({ headers, rows }) {
  if (rows.length === 0) throw new Error("That file has no rows under the header line.");

  const required = ["kurinumber", "groomemail", "nikahdate"];
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length) {
    throw new Error(
      `The file is missing a column for: ${missing.join(", ")}. Found: ${headers.filter(Boolean).join(", ") || "nothing"}.`,
    );
  }

  const { members, rounds } = data();
  const byEmail = new Map(members.map((m) => [m.email, m]));
  const existingNumbers = new Set(rounds.map((r) => r.kuriNumber));
  const existingGrooms = new Set(rounds.map((r) => r.groomMemberId));

  const seenNumbers = new Set();
  const seenGrooms = new Set();
  let activeCount = rounds.filter((r) => r.status === "active").length;
  const counts = makeCounts();

  const out = rows.map((raw) => {
    const kuriNumber = Number(raw.kurinumber ?? raw.kuri ?? raw.number);
    const email = (raw.groomemail ?? raw.email ?? raw.groom ?? "").trim().toLowerCase();
    const groom = byEmail.get(email);

    const nikahDate = parseLooseDate(raw.nikahdate ?? raw.date);
    const lastRaw = raw.kurilastdate ?? raw.lastdate ?? "";
    const kuriLastDate = parseLooseDate(lastRaw) ?? nikahDate;

    const statusRaw = (raw.status || "completed").trim().toLowerCase();
    const status = ["completed", "active", "upcoming"].includes(statusRaw) ? statusRaw : null;

    const value = {
      kuriNumber,
      groomMemberId: groom?.id || "",
      groomName: groom?.name || email || "—",
      nikahDate,
      kuriLastDate,
      status: status || statusRaw,
    };
    const label = `Kuri ${raw.kurinumber ?? "?"}`;

    const fail = (reason) => {
      counts.error++;
      return { value, label, status: "error", reason };
    };

    if (!Number.isFinite(kuriNumber) || kuriNumber < 1) return fail("kuri number must be 1 or more");
    if (!email) return fail("no groom email");
    if (!groom) return fail(`no member with the email ${email}`);
    if (!nikahDate) return fail("nikah date could not be read");
    if (!status) return fail(`status “${statusRaw}” must be completed, active or upcoming`);

    if (seenNumbers.has(kuriNumber)) return fail("this kuri number appears twice in the file");
    seenNumbers.add(kuriNumber);

    // Rule 8: one round per member, ever.
    if (existingGrooms.has(groom.id)) return fail(`${groom.name} already has a round in the app`);
    if (seenGrooms.has(groom.id)) return fail(`${groom.name} is groom of two rows in this file`);
    seenGrooms.add(groom.id);

    if (status === "active") {
      // Rounds are strictly sequential — only one is ever open.
      if (activeCount > 0) return fail("another round is already active");
      activeCount++;
    }

    if (existingNumbers.has(kuriNumber)) {
      counts.duplicate++;
      return { value, label, status: "duplicate", reason: "kuri number already exists" };
    }

    counts.new++;
    return { value, label, status: "new" };
  });

  return { rows: out, counts };
}
