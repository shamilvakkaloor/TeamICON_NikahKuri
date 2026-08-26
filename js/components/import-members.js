/**
 * Bulk member import.
 *
 * `joinedAtKuriNumber` cannot be changed once a member is saved — it is what
 * makes a late joiner correctly collect from fewer people — so the shared
 * preview matters more here than anywhere else.
 */

import { el, Notice } from "../lib/ui.js";
import { openCsvImport, makeCounts } from "./csv-import.js";
import { data } from "../lib/data.js";
import { createMember, setContact } from "../lib/crud.js";
import { DEFAULT_AMOUNT, TEAMS } from "../domain/ledger.js";

/** Accepted spellings for the role column, keyed on letters only. */
const ROLE_WORDS = {
  "": "member",
  member: "member",
  members: "member",
  ordinary: "member",
  coordinator: "coordinator",
  coordinators: "coordinator",
  teamcoordinator: "coordinator",
  teamcoordinators: "coordinator",
  coord: "coordinator",
};

const HEADERS = [
  "Name",
  "Team",
  "Email",
  "Mobile",
  "Joined at Kuri",
  "Standing amount",
  "Role",
  "Photo URL",
];

const TEMPLATE = [
  ["Shamil Vakkaloor", "MALAPPURAM", "shamil@gmail.com", "9876543210", "1", "7000", "Member", ""],
  [
    "Anas Rahman",
    "KODUVALLY",
    "anas@gmail.com",
    "9876543211",
    "1",
    "7000",
    "Team coordinator",
    "https://example.com/anas.jpg",
  ],
];

export function openImportDialog({ onImported }) {
  openCsvImport({
    title: "Import members from CSV",
    templateName: "nikah-kuri-members-template.csv",
    templateHeaders: HEADERS,
    templateRows: TEMPLATE,
    noun: (n) => `${n} member${n === 1 ? "" : "s"}`,
    help: [
      Notice(
        "Required columns: Name, Team, Email. Optional: Mobile, Joined at Kuri, Standing amount, " +
          "Role, Photo URL. Column order does not matter and the header spelling is forgiving.",
        "info",
      ),
      el(
        "p.small.muted",
        "Blank ",
        el("strong", "Joined at Kuri"),
        " means 1 — right for everyone who has been in the kuri from the start. " +
          "It decides who owes whom and cannot be changed after a member is saved, so check the " +
          "preview before importing. Blank ",
        el("strong", "Standing amount"),
        ` means ₹${DEFAULT_AMOUNT.toLocaleString("en-IN")}.`,
      ),
      el(
        "p.small.muted",
        "Role may be ",
        el("strong", "Member"),
        " or ",
        el("strong", "Coordinator"),
        " (“Team coordinator” works too). Admins cannot be created this way — set that " +
          "individually afterwards.",
      ),
      el(
        "p.small.muted",
        el("strong", "Photo URL"),
        " is a direct link to an image — the groom’s photo is the centrepiece of the home page. " +
          "Leave it blank and initials are shown instead.",
      ),
    ],
    columns: [
      { label: "Name", get: (v) => v.name },
      { label: "Team", get: (v) => v.team, small: true },
      { label: "Email", get: (v) => v.email, truncate: true },
      { label: "Joined", get: (v) => v.joinedAtKuriNumber, num: true },
      { label: "Amount", get: (v) => v.standingAmount, num: true },
      { label: "Role", get: (v) => v.role, small: true },
      { label: "Photo", get: (v) => (v.photoUrl ? "yes" : "—"), small: true },
    ],
    validate,
    write: async (value) => {
      const { mobile, ...member } = value;
      const docRef = await createMember(member);
      if (mobile) await setContact(docRef.id, mobile);
    },
    onDone: onImported,
  });
}

function validate({ headers, rows }) {
  if (rows.length === 0) throw new Error("That file has no rows under the header line.");

  const required = ["name", "team", "email"];
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length) {
    throw new Error(
      `The file is missing a column for: ${missing.join(", ")}. Found: ${headers.filter(Boolean).join(", ") || "nothing"}.`,
    );
  }

  const existingEmails = new Set(data().members.map((m) => m.email));
  const seen = new Set();
  const counts = makeCounts();

  const out = rows.map((raw) => {
    const name = (raw.name || "").trim();
    const team = (raw.team || "").trim().toUpperCase();
    const email = (raw.email || "").trim().toLowerCase();

    const roleRaw = (raw.role || "member").trim().toLowerCase();
    // People write "Team coordinator", "Co-ordinator", "MEMBER". Strip
    // everything but letters so a roster is never rejected over wording.
    const roleKey = roleRaw.replace(/[^a-z]/g, "");
    const role = ROLE_WORDS[roleKey];

    const joinedRaw = raw.joinedatkuri ?? raw.joinedatkurinumber ?? raw.joined ?? "";
    const amountRaw = raw.standingamount ?? raw.amount ?? raw.standing ?? "";

    const joinedAtKuriNumber = joinedRaw === "" ? 1 : Number(joinedRaw);
    const standingAmount =
      amountRaw === "" ? DEFAULT_AMOUNT : Number(String(amountRaw).replace(/[₹,\s]/g, ""));

    const value = {
      name,
      team,
      email,
      mobile: (raw.mobile ?? raw.phone ?? "").trim(),
      role: role || "member",
      photoUrl: (raw.photourl ?? raw.photo ?? raw.photolink ?? raw.image ?? "").trim(),
      joinedAtKuriNumber,
      standingAmount,
      status: "active",
      hasBeenGroom: false,
      amountHistory: [],
    };

    const fail = (reason) => {
      counts.error++;
      return { value, label: name || email, status: "error", reason };
    };

    if (!name) return fail("no name");
    if (!TEAMS.includes(team)) return fail(`team must be one of ${TEAMS.join(", ")}`);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("email looks wrong");
    if (roleKey === "admin") return fail("cannot create an admin by import");
    if (!role) return fail(`role “${roleRaw}” not recognised — use member or coordinator`);
    if (!Number.isFinite(joinedAtKuriNumber) || joinedAtKuriNumber < 1) {
      return fail("joined at Kuri must be 1 or more");
    }
    if (!Number.isFinite(standingAmount) || standingAmount < 0) return fail("amount is not a number");

    if (seen.has(email)) return fail("this email appears twice in the file");
    seen.add(email);

    if (existingEmails.has(email)) {
      counts.duplicate++;
      return { value, label: name, status: "duplicate" };
    }

    counts.new++;
    return { value, label: name, status: "new" };
  });

  return { rows: out, counts };
}
