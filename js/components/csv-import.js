/**
 * The shared CSV import dialog: choose a file, see every row judged, then
 * write only the good ones.
 *
 * Members, rounds and payments all import through this. The rule it enforces
 * for all three is that **nothing is written until the admin has seen the
 * preview** — these imports set fields that cannot be edited afterwards
 * (a member's joining round, a payment's groom), so a silent bulk write of a
 * mis-mapped column would be genuinely hard to unpick.
 */

import { el, Badge, Button, Notice, openDialog, toast } from "../lib/ui.js";
import { downloadCsv, parseCsv } from "../lib/csv.js";

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {Node[]} opts.help            explanatory nodes shown above the picker
 * @param {string} opts.templateName    filename for the downloadable template
 * @param {string[]} opts.templateHeaders
 * @param {Array[]} opts.templateRows
 * @param {{label: string, get: Function, num?: boolean, truncate?: boolean}[]} opts.columns
 *        preview columns, rendered after the Status column
 * @param {Function} opts.validate      (parsed) => {rows, counts}; may throw to
 *                                      reject the whole file
 * @param {Function} opts.write         (value) => Promise, called per new row
 * @param {Function} opts.noun          (n) => "3 members" etc.
 * @param {Function} opts.onDone
 */
export function openCsvImport({
  title,
  help = [],
  templateName,
  templateHeaders,
  templateRows,
  columns,
  validate,
  write,
  noun,
  onDone,
  options = {},
  optionsUI = null,
}) {
  // The raw text is kept so toggling an option re-judges the same file rather
  // than making someone pick it again.
  const state = { parsed: null, busy: false, text: null };

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

  function revalidate() {
    if (state.text === null) return;
    try {
      state.parsed = validate(parseCsv(state.text), options);
    } catch (err) {
      state.parsed = { fatal: err.message };
    }
    draw();
  }

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      state.text = String(reader.result);
      revalidate();
    };
    reader.onerror = () => {
      state.parsed = { fatal: "That file could not be read." };
      draw();
    };
    reader.readAsText(file);
  }

  function draw() {
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
          p.counts.duplicate ? Badge(`${p.counts.duplicate} already added`, "pending") : null,
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
              // Status leads: it is the reason this preview exists, and in a
              // narrow dialog a trailing column scrolls out of sight exactly
              // when it matters most.
              el(
                "tr",
                el("th", "Status"),
                columns.map((c) => el(`th${c.num ? ".num" : ""}`, c.label)),
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
                      ? Badge(r.reason || "new", r.reason ? "info" : "paid")
                      : r.status === "duplicate"
                        ? Badge(r.reason || "already added", "pending")
                        : Badge(r.reason, "owed"),
                  ),
                  columns.map((c) =>
                    el(
                      `td${c.num ? ".num" : ""}${c.truncate ? ".truncate" : ""}${c.small ? ".xs" : ""}`,
                      String(c.get(r.value) ?? "—"),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    footerHost.replaceChildren(
      Button("Cancel", { variant: "outline", onClick: () => close() }),
      Button(`Import ${noun(importable.length)}`, {
        disabled: importable.length === 0 || state.busy,
        onClick: () => run(importable),
      }),
    );
  }

  async function run(rows) {
    state.busy = true;
    draw();

    const progress = el("div.small.muted");
    previewHost.replaceChildren(el("div.stack", progress));

    let done = 0;
    const failures = [];

    // Sequential rather than parallel: several of these are multi-write
    // operations, and a partial failure has to name the row it happened on.
    for (const row of rows) {
      progress.textContent = `Importing ${done + 1} of ${rows.length}…`;
      try {
        await write(row.value);
        done++;
      } catch (e) {
        failures.push(`${row.label || row.value.name || "row"}: ${e?.message || "failed"}`);
      }
    }

    if (failures.length === 0) {
      toast(`${noun(done)} imported.`, "success");
      close();
      onDone();
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
          onDone();
        },
      }),
    );
  }

  const close = openDialog({
    title,
    wide: true,
    body: el(
      "div.stack",
      ...help,
      el(
        "div.row.wrap",
        Button("Download template", {
          variant: "outline",
          size: "sm",
          onClick: () => downloadCsv(templateName, templateHeaders, templateRows),
        }),
      ),
      el("div.field", el("label", "Choose a CSV file"), fileInput),
      optionsUI ? optionsUI(options, revalidate) : null,
      previewHost,
    ),
    footer: footerHost,
  });

  draw();
}

/** Shared counter used by every validate() implementation. */
export function makeCounts() {
  return { new: 0, duplicate: 0, error: 0 };
}
