/**
 * Bulk member import.
 *
 * Nothing is written until the admin has seen a row-by-row preview. That is
 * not politeness: `joinedAtKuriNumber` cannot be changed once a member is
 * saved — it is what makes a late joiner correctly collect from fewer people —
 * so a silent import of 33 rows with a wrong column would be genuinely hard to
 * unpick.
 */

import { el, Badge, Button, Notice, openDialog, toast } from "../lib/ui.js";
import { downloadCsv, parseCsv } from "../lib/csv.js";
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

const TEMPLATE_HEADERS = [
  "Name",
  "Team",
  "Email",
  "Mobile",
  "Joined at Kuri",
  "Standing amount",
  "Role",
  "Photo URL",
];

const TEMPLATE_ROWS = [
  [
    "Shamil Vakkaloor",
    "MALAPPURAM",
    "shamil@gmail.com",
    "9876543210",
    "1",
    "7000",
    "Member",
    "",
  ],
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
  const state = { parsed: null, busy: false };

  const fileInput = el("input", {
    type: "file",
    accept: ".csv,text/csv",
    onchange: (e) => {
      const file = e.target.files?.[0];
      if (file) readFile(file);
    },
  });

  const previewHost = el("div");
  const footerHost = el("div.row", { style: { gap: "var(--s2)" } });

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        state.parsed = validate(parseCsv(String(reader.result)));
      } catch (err) {
        state.parsed = { fatal: err.message };
      }
      drawPreview();
    };
    reader.onerror = () => {
      state.parsed = { fatal: "That file could not be read." };
      drawPreview();
    };
    reader.readAsText(file);
  }

  function drawPreview() {
    previewHost.replaceChildren();
    footerHost.replaceChildren(Button("Cancel", { variant: "outline", onClick: () => close() }));

    const p = state.parsed;
    if (!p) return;

    if (p.fatal) {
      previewHost.append(Notice(p.fatal, "danger"));
      return;
    }

    const importable = p.rows.filter((r) => r.status === "new");

    previewHost.append(
      el(
        "div.stack",
        el(
          "div.row.wrap",
          { style: { gap: "var(--s2)" } },
          Badge(`${importable.length} to import`, importable.length ? "paid" : ""),
          p.counts.duplicate ? Badge(`${p.counts.duplicate} already on the roster`, "pending") : null,
          p.counts.error ? Badge(`${p.counts.error} with problems`, "owed") : null,
        ),
        p.counts.error
          ? Notice("Rows with problems are skipped. Fix them in the file and import again.", "warn")
          : null,
        el(
          "div.table-scroll",
          el(
            "table.data",
            el(
              "thead",
              // Status leads. It is the reason this preview exists, and in a
              // narrow dialog a trailing column scrolls out of sight exactly
              // when it matters most.
              el(
                "tr",
                el("th", "Status"),
                el("th", "Name"),
                el("th", "Team"),
                el("th", "Email"),
                el("th.num", "Joined"),
                el("th.num", "Amount"),
                el("th", "Role"),
                el("th", "Photo"),
              ),
            ),
            el(
              "tbody",
              p.rows.map((r) =>
                el(
                  `tr${r.status === "new" ? "" : ".dim-row"}`,
                  el(
                    "td",
                    r.status === "new"
                      ? Badge("new", "paid")
                      : r.status === "duplicate"
                        ? Badge("already added", "pending")
                        : Badge(r.reason, "owed"),
                  ),
                  el("td", r.value.name || "—"),
                  el("td.xs", r.value.team || "—"),
                  el("td.xs.muted.truncate", r.value.email || "—"),
                  el("td.num", String(r.value.joinedAtKuriNumber ?? "—")),
                  el("td.num", String(r.value.standingAmount ?? "—")),
                  el("td.xs", r.value.role || "—"),
                  el("td.xs.muted", r.value.photoUrl ? "yes" : "—"),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    footerHost.replaceChildren(
      Button("Cancel", { variant: "outline", onClick: () => close() }),
      Button(`Import ${importable.length} member${importable.length === 1 ? "" : "s"}`, {
        disabled: importable.length === 0 || state.busy,
        onClick: () => runImport(importable),
      }),
    );
  }

  async function runImport(rows) {
    state.busy = true;
    drawPreview();

    const progress = el("div.small.muted");
    previewHost.replaceChildren(el("div.stack", progress));

    let done = 0;
    const failures = [];

    // Sequential rather than parallel: each member is two writes (the record
    // and its memberIndex entry), and a partial failure needs to name the row
    // it happened on.
    for (const row of rows) {
      progress.textContent = `Importing ${done + 1} of ${rows.length}…`;
      try {
        const { mobile, ...member } = row.value;
        const docRef = await createMember(member);
        if (mobile) await setContact(docRef.id, mobile);
        done++;
      } catch (e) {
        failures.push(`${row.value.name}: ${e?.message || "failed"}`);
      }
    }

    if (failures.length === 0) {
      toast(`${done} members imported.`, "success");
      close();
      onImported();
      return;
    }

    state.busy = false;
    previewHost.replaceChildren(
      el(
        "div.stack",
        Notice(
          `${done} imported, ${failures.length} failed. The ones that failed were not saved — ` +
            "fix them and import those rows again.",
          "warn",
        ),
        el("ul.small", failures.map((f) => el("li", f))),
      ),
    );
    footerHost.replaceChildren(
      Button("Done", {
        onClick: () => {
          close();
          onImported();
        },
      }),
    );
  }

  const close = openDialog({
    title: "Import members from CSV",
    wide: true,
    body: el(
      "div.stack",
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
          "Leave it blank and initials are shown instead; you can always add it later.",
      ),
      el(
        "div.row.wrap",
        Button("Download template", {
          variant: "outline",
          size: "sm",
          onClick: () => downloadCsv("nikah-kuri-members-template.csv", TEMPLATE_HEADERS, TEMPLATE_ROWS),
        }),
      ),
      el("div.field", el("label", "Choose a CSV file"), fileInput),
      previewHost,
    ),
    footer: footerHost,
  });

  drawPreview();
}

/**
 * Turn parsed rows into candidate members, marking each one importable,
 * already-present, or broken. Nothing here writes.
 */
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
  const counts = { new: 0, duplicate: 0, error: 0 };

  const out = rows.map((raw) => {
    const name = (raw.name || "").trim();
    const team = (raw.team || "").trim().toUpperCase();
    const email = (raw.email || "").trim().toLowerCase();
    const roleRaw = (raw.role || "member").trim().toLowerCase();
    // People write "Team coordinator", "Co-ordinator", "TEAM COORDINATOR".
    // Strip everything but letters and accept any of them, so a roster does
    // not get rejected over a wording choice.
    const roleKey = roleRaw.replace(/[^a-z]/g, "");
    const role = ROLE_WORDS[roleKey];

    const joinedRaw = raw.joinedatkuri ?? raw.joinedatkurinumber ?? raw.joined ?? "";
    const amountRaw = raw.standingamount ?? raw.amount ?? raw.standing ?? "";

    const joinedAtKuriNumber = joinedRaw === "" ? 1 : Number(joinedRaw);
    const standingAmount = amountRaw === "" ? DEFAULT_AMOUNT : Number(amountRaw);

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
      return { value, status: "error", reason };
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
      return { value, status: "duplicate" };
    }

    counts.new++;
    return { value, status: "new" };
  });

  return { rows: out, counts };
}
