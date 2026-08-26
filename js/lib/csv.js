/**
 * CSV reading and writing.
 *
 * Hand-rolled rather than pulled from a CDN, because the whole app is
 * dependency-free and the format people actually paste in from Excel needs
 * only three things handled properly: quoted fields containing commas,
 * doubled quotes inside a quoted field, and Windows line endings.
 */

/**
 * Split CSV text into rows of cells. Quotes are consumed, `""` becomes `"`,
 * and newlines inside quotes stay part of the cell.
 */
export function parseRows(text) {
  const src = text.replace(/^﻿/, ""); // Excel writes a byte-order mark
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      // Swallow the \n of a \r\n pair.
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  // Drop rows that are entirely empty — trailing newlines are normal.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * "Joined at Kuri" and "joined_at_kuri" and "JoinedAtKuri" are the same
 * header. Normalising away case and punctuation means nobody has to match a
 * spelling exactly.
 */
export function normaliseHeader(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Parse into objects keyed by normalised header.
 *
 * @returns {{headers: string[], rows: object[]}}
 */
export function parseCsv(text) {
  const rows = parseRows(text);
  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0].map((h) => normaliseHeader(h));
  const out = rows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = (cells[i] ?? "").trim();
    });
    return obj;
  });

  return { headers, rows: out };
}

/** Quote every cell — simplest thing that is always correct. */
export function toCsv(headers, rows) {
  const line = (cells) => cells.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",");
  return [line(headers), ...rows.map(line)].join("\n");
}

/** Hand the browser a file to save. */
export function downloadCsv(filename, headers, rows) {
  const blob = new Blob([toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
