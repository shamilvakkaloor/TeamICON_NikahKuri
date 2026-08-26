import {
  el,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Money,
  Notice,
  Progress,
  Skeleton,
  TeamDot,
} from "../lib/ui.js";
import { countdown, fmtDate, money } from "../lib/format.js";
import { activeRound, data, dataStore, memberById } from "../lib/data.js";
import { buildRoundLedger, loadRoundContext, teamTotals } from "../lib/roundLedger.js";
import { currentMember, isAdmin } from "../lib/auth.js";
import { TEAMS } from "../domain/ledger.js";

export function renderDashboard(host) {
  let extra = { participation: new Map(), overrides: new Map() };

  const unsub = dataStore.subscribe(draw);

  function draw() {
    const { loading, members, rounds } = data();
    if (loading) return host.replaceChildren(Skeleton(5));

    const round = activeRound();
    if (!round) return host.replaceChildren(noRound(members, rounds));

    const { rows, expected, collected, groom } = buildRoundLedger(round, extra);
    const clock = countdown(round.kuriLastDate);
    const me = currentMember();
    const myRow = rows.find((r) => r.memberId === me?.id);

    host.replaceChildren(
      el(
        "div.stack",
        groomCard({ round, groom, expected, collected, clock }),
        myRow ? myDueCard(myRow) : null,
        teamCard(rows),
        clock.tone === "past" && expected > collected
          ? Notice(
              `The Kuri Last Date has passed with ${money(expected - collected)} outstanding. ` +
                "The relaxation period is informal — the admin closes the round on the reduced " +
                "figure when it’s clear no more is coming.",
              "warn",
            )
          : null,
      ),
    );
  }

  // Opt-outs and overrides aren't part of the live listeners, so fetch them
  // once and redraw when they land.
  const round = activeRound();
  if (round) {
    loadRoundContext(round.id).then((ctx) => {
      extra = ctx;
      draw();
    });
  }

  return unsub;
}

function noRound(members, rounds) {
  const completed = rounds.filter((r) => r.status === "completed").length;
  return EmptyState({
    title: "No round is open",
    body:
      completed > 0
        ? `${completed} of ${members.length} members have had their round. The admin opens the next one when a date is fixed.`
        : "The admin opens the first round by assigning a groom and setting the dates.",
    action: isAdmin()
      ? Button("Open a round", { onClick: () => (window.location.hash = "#/rounds") })
      : null,
  });
}

function groomCard({ round, groom, expected, collected, clock }) {
  const toneClass = clock.tone === "past" ? "owed" : clock.tone === "warn" ? "pending" : "paid";

  return el(
    "section.card",
    el(
      "div.card-body.groom-head",
      Avatar(groom?.name || "?", groom?.photoUrl, true),
      el(
        "div",
        { style: { flex: "1", minWidth: "0" } },
        el("div.stat-label", `Kuri ${round.kuriNumber} · Current groom`),
        el("h2", { style: { fontSize: "var(--text-xl)" } }, groom?.name || "Unassigned"),
        el(
          "div.row.wrap",
          { style: { marginTop: "var(--s2)" } },
          groom ? el("span.badge", TeamDot(groom.team), ` ${groom.team}`) : null,
          Badge(clock.label, toneClass),
        ),
      ),
    ),
    el(
      "div.card-body.bordered-top",
      el(
        "div.spread",
        { style: { marginBottom: "var(--s3)" } },
        el("div", el("div.stat-label", "Collected"), Money(collected, { size: "hero", tone: "paid" })),
        el(
          "div",
          { style: { textAlign: "right" } },
          el("div.stat-label", "Expected pot"),
          Money(expected, { size: "lg", tone: "muted" }),
        ),
      ),
      Progress(collected, expected),
      el(
        "div.spread.small.muted",
        { style: { marginTop: "var(--s2)" } },
        el(
          "span",
          expected > collected ? `${money(expected - collected)} still to come` : "Fully collected",
        ),
        el("span", `Nikah ${fmtDate(round.nikahDate)}`),
      ),
    ),
  );
}

function myDueCard(row) {
  return Card({
    title: "Your due this round",
    body: el(
      "div.spread",
      el(
        "div",
        Money(row.balance, { size: "lg", tone: row.balance > 0 ? "owed" : "paid" }),
        el(
          "div.stat-note",
          row.balance <= 0
            ? "Settled — thank you."
            : row.paidSoFar > 0
              ? `Paid ${money(row.paidSoFar)} of ${money(row.dueAmount)}`
              : row.explanation,
        ),
      ),
      row.locked ? Badge("Fixed by history", "info") : null,
    ),
  });
}

function teamCard(rows) {
  return Card({
    title: "Collection by team",
    body: el(
      "div.stack",
      teamTotals(rows, TEAMS).map(({ team, expected, collected, outstanding }) =>
        el(
          "div",
          el(
            "div.spread",
            { style: { marginBottom: "var(--s1)" } },
            el("span.small", { style: { fontWeight: "550" } }, TeamDot(team), ` ${team}`),
            el(
              "span.small",
              Money(collected, { size: "sm", tone: "paid" }),
              el("span.muted", " / "),
              Money(expected, { size: "sm", tone: "muted" }),
            ),
          ),
          Progress(collected, expected),
          outstanding > 0
            ? el("div.xs.muted", { style: { marginTop: "var(--s1)" } }, `${outstanding} still to pay`)
            : null,
        ),
      ),
    ),
  });
}
