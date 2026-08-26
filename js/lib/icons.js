/**
 * Inline 1.5px-stroke line icons, Lucide-style.
 *
 * Kept as path data rather than files so there is no icon request to make and
 * nothing to load before the first paint.
 */

const PATHS = {
  home: ["M3 10.5 12 3l9 7.5", "M5 9.5V21h14V9.5"],
  users: [
    "M9 8a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 8Z",
    "M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5",
    "M16 5.2a3.2 3.2 0 0 1 0 6.1",
    "M18 14.9c2 .7 3 2.6 3 5.1",
  ],
  rounds: ["M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z", "M12 7v5l3.2 2"],
  payment: ["M2.5 8A2.5 2.5 0 0 1 5 5.5h14A2.5 2.5 0 0 1 21.5 8v8a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 2.5 16V8Z", "M2.5 10h19", "M6.5 14.5h4"],
  report: ["M5 21V10", "M12 21V4", "M19 21v-7", "M3 21h18"],
  wallet: ["M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3", "M3 10a2.5 2.5 0 0 1 2.5-2.5h13A2.5 2.5 0 0 1 21 10v6.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5V10Z", "M16.5 14.4a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z"],
  scale: ["M12 4v16", "M7 20h10", "M4 8h16", "M4 8 1.5 14h5L4 8Z", "M20 8l-2.5 6h5L20 8Z"],
  handover: ["M3 12.5 7.5 8l4 3.5", "M11.5 11.5h6a2 2 0 0 1 0 4h-4", "M21 11.5 16.5 16l-4-3.5"],
  audit: ["M6 3h9l4 4v14H6z", "M15 3v4h4", "M9 12h6", "M9 16h4"],
  alert: ["M12 4 2.8 20h18.4L12 4Z", "M12 10v4", "M12 17.2h.01"],
  check: ["m4.5 12.5 5 5 10-11"],
  plus: ["M12 5v14", "M5 12h14"],
  close: ["m6 6 12 12", "m18 6-12 12"],
  lock: ["M4.5 12.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-6Z", "M8 10.5V7.8a4 4 0 0 1 8 0v2.7"],
  more: ["M5 13.4a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Z", "M12 13.4a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Z", "M19 13.4a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Z"],
  settings: ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3"],
  globe: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M3 12h18", "M12 3c2.5 2.7 3.8 5.7 3.8 9S14.5 18.3 12 21c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z"],
  edit: ["M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z", "M13.5 6.5l4 4"],
  back: ["M15 6l-6 6 6 6"],
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z", "m20 20-4-4"],
  download: ["M12 4v11", "m8 11 4 4 4-4", "M4 19h16"],
};

export function icon(name, size = 18) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  for (const d of PATHS[name] || []) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

/** The thin-stroke compass mark used on the login and public pages. */
export function brandMark(size = 64) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");

  const shapes = [
    ["circle", { cx: 32, cy: 32, r: 22, stroke: "var(--green)", "stroke-width": 1.5 }],
    ["circle", { cx: 32, cy: 32, r: 13, stroke: "var(--gold)", "stroke-width": 1.5, "stroke-dasharray": "3 4" }],
    ["path", { d: "M32 10v44M10 32h44", stroke: "var(--green)", "stroke-width": 1.5, "stroke-opacity": 0.28 }],
    ["circle", { cx: 32, cy: 32, r: 4, fill: "var(--gold)" }],
  ];

  for (const [tag, attrs] of shapes) {
    const node = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    svg.append(node);
  }
  return svg;
}
