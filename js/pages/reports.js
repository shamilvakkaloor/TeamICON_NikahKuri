import { el, Button, Card, EmptyState, Money, Stat, TeamDot } from "../lib/ui.js";
import { icon } from "../lib/icons.js";
import { fmtDate } from "../lib/format.js";
import { data, dataStore, memberById } from "../lib/data.js";
import { TEAMS } from "../domain/ledger.js";

export function renderReports(host) {
  const state = { view: "round" };
  const unsub = dataStore.subscribe(draw);

  function draw() {
    const { rounds, payments, members } = data();
    const collected = payments.reduce((t, p) => t + p.amount, 0);

    host.replaceChildren(
      el(
        "div.stack",
        el(
          "div.grid",
          Stat({ label: "Collected, all time", amount: collected, tone: "paid" }),
          Stat({
            label: "Rounds completed",
            amount: rounds.filter((r) => r.status === "completed").length,
          }),
          Stat({
            label: "Members still to receive",
            amount: members.filter((m) => !m.hasBeenGroom && m.status === "active").length,
            tone: "muted",
          }),
        ),
        el(
          "div.row.wrap.between",
          el(
            "div.pill-row",
            ["round", "team", "member"].map((v) =>
              el(
                `button.pill${state.view === v ? ".active" : ""}`,
                {
                  onclick: () => {
                    state.view = v;
                    draw();
                  },
                },
                `By ${v}`,
              ),
            ),
          ),
          (() => {
            const b = Button("Export CSV", {
              variant: "outline",
              size: "sm",
              disabled: payments.length === 0,
              onClick: exportCsv,
            });
            b.prepend(icon("download", 14));
            return b;
          })(),
        ),
        payments.length === 0
          ? EmptyState({
              title: "Nothing to report yet",
              body: "Reports fill in as payments are recorded.",
            })
          : state.view === "round"
            ? byRound()
            : state.view === "team"
              ? byTeam()
              : byMember(),
      ),
    );
  }

  function exportCsv() {
    const { payments, rounds } = data();
    const header = ["Date", "From", "To (groom)", "Kuri", "Team", "Amount", "Edited", "Notes"];
    const lines = payments.map((p) =>
      [
        new Date(p.date).toISOString().slice(0, 10),
        memberById(p.fromMemberId)?.name || p.fromMemberId,
        memberById(p.toMemberId)?.name || p.toMemberId,
        rounds.find((r) => r.id === p.kuriId)?.kuriNumber ?? "",
        p.team,
        p.amount,
        p.edited ? "yes" : "",
        p.notes || "",
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(","),
    );

    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: `nikah-kuri-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  return unsub;
}

function table(headers, rows) {
  return el(
    "div.table-scroll",
    el(
      "table.data",
      el("thead", el("tr", headers.map((h) => el(`th${h.num ? ".num" : ""}`, h.label || h)))),
      el("tbody", rows),
    ),
  );
}

function byRound() {
  const { rounds, payments } = data();
  return Card({
    title: "By round",
    padded: false,
    body: table(
      [{ label: "Kuri" }, { label: "Groom" }, { label: "Nikah" }, { label: "Contributors", num: true }, { label: "Collected", num: true }],
      [...rounds]
        .sort((a, b) => b.kuriNumber - a.kuriNumber)
        .map((r) => {
          const ps = payments.filter((p) => p.kuriId === r.id);
          return el(
            "tr",
            el("td", String(r.kuriNumber)),
            el("td", memberById(r.groomMemberId)?.name || "—"),
            el("td", fmtDate(r.nikahDate)),
            el("td.num", String(new Set(ps.map((p) => p.fromMemberId)).size)),
            el("td.num", Money(ps.reduce((t, p) => t + p.amount, 0), { size: "sm", tone: "paid" })),
          );
        }),
    ),
  });
}

function byTeam() {
  const { payments, members } = data();
  return Card({
    title: "By team",
    padded: false,
    body: table(
      [{ label: "Team" }, { label: "Members", num: true }, { label: "Paid in", num: true }, { label: "Received", num: true }],
      TEAMS.map((team) => {
        const ids = new Set(members.filter((m) => m.team === team).map((m) => m.id));
        const paidIn = payments
          .filter((p) => ids.has(p.fromMemberId))
          .reduce((t, p) => t + p.amount, 0);
        const received = payments
          .filter((p) => ids.has(p.toMemberId))
          .reduce((t, p) => t + p.amount, 0);
        return el(
          "tr",
          el("td", TeamDot(team), ` ${team}`),
          el("td.num", String(ids.size)),
          el("td.num", Money(paidIn, { size: "sm", tone: "paid" })),
          el("td.num", Money(received, { size: "sm", tone: "muted" })),
        );
      }),
    ),
  });
}

function byMember() {
  const { payments, members } = data();
  return Card({
    title: "By member",
    padded: false,
    body: table(
      [{ label: "Member" }, { label: "Team" }, { label: "Paid in", num: true }, { label: "Received", num: true }, { label: "Net", num: true }],
      members.map((m) => {
        const paidIn = payments
          .filter((p) => p.fromMemberId === m.id)
          .reduce((t, p) => t + p.amount, 0);
        const received = payments
          .filter((p) => p.toMemberId === m.id)
          .reduce((t, p) => t + p.amount, 0);
        const net = paidIn - received;
        return el(
          "tr",
          el("td", m.name),
          el("td.xs.muted", m.team),
          el("td.num", Money(paidIn, { size: "sm" })),
          el("td.num", Money(received, { size: "sm" })),
          el("td.num", Money(net, { size: "sm", tone: net > 0 ? "paid" : net < 0 ? "owed" : "muted" })),
        );
      }),
    ),
  });
}
