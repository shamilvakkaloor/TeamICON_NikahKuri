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
  Stat,
  TeamDot,
} from "../lib/ui.js";
import { countdown, fmtDate, money } from "../lib/format.js";
import { activeRound, data, dataStore, memberById } from "../lib/data.js";
import { buildRoundLedger, loadRoundContext, teamTotals } from "../lib/roundLedger.js";
import { currentMember, isAdmin } from "../lib/auth.js";
import { TEAMS, generateRoundDues, priorGroomRoundOf } from "../domain/ledger.js";

export function renderDashboard(host) {
  let extra = { participation: new Map(), overrides: new Map() };

  const unsub = dataStore.subscribe(draw);

  function draw() {
    const { loading, members, rounds } = data();
    if (loading) return host.replaceChildren(Skeleton(5));

    const round = activeRound();
    if (!round) return host.replaceChildren(betweenRounds());

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

/**
 * Between rounds — which is most of the time.
 *
 * This is the page everyone opens, so an empty state here wasted it. There is
 * plenty worth knowing when no collection is running: how far the scheme has
 * got, what has moved through it, where each member stands, and what happened
 * in the rounds already closed.
 */
function betweenRounds() {
  const { members, rounds, payments } = data();
  const me = currentMember();

  const completed = rounds.filter((r) => r.status === "completed");
  const active = members.filter((m) => m.status !== "exited");
  const waiting = active.filter((m) => !m.hasBeenGroom);
  const collected = payments.reduce((t, p) => t + p.amount, 0);

  if (rounds.length === 0) {
    return EmptyState({
      title: "No rounds yet",
      body: "The first round starts when the admin assigns a groom and sets the dates.",
      action: isAdmin()
        ? Button("Open a round", { onClick: () => (window.location.hash = "#/rounds") })
        : null,
    });
  }

  return el(
    "div.stack",
    progressCard({ completed: completed.length, total: active.length, waiting: waiting.length }),
    el(
      "div.grid",
      Stat({ label: "Collected, all time", amount: collected, tone: "paid" }),
      Stat({ label: "Rounds completed", amount: completed.length, count: true }),
      Stat({ label: "Still to receive", amount: waiting.length, tone: "muted", count: true }),
    ),
    me ? myPositionCard(me, members, rounds, payments) : null,
    lastRoundCard(completed, payments),
    roundsSoFarCard(rounds, payments),
    byTeamCard(members, payments),
  );
}

function progressCard({ completed, total, waiting }) {
  return el(
    "section.card.card-body",
    el(
      "div.spread",
      { style: { marginBottom: "var(--s3)" } },
      el(
        "div",
        el("div.stat-label", "Between rounds"),
        el("h2", `${completed} of ${total} have had their turn`),
      ),
      isAdmin()
        ? Button("Open a round", { onClick: () => (window.location.hash = "#/rounds") })
        : null,
    ),
    Progress(completed, total),
    el(
      "div.small.muted",
      { style: { marginTop: "var(--s2)" } },
      waiting === 0
        ? "Everyone has had a round. The scheme can be closed out through Settlement."
        : `${waiting} still waiting. A new round opens when the next nikah date is fixed.`,
    ),
  );
}

/**
 * What the signed-in member's position is right now, including a forecast of
 * the pot when his own turn arrives — computed by asking the ledger what
 * everyone would owe him if the next round were his.
 */
function myPositionCard(me, members, rounds, payments) {
  const paidOut = payments
    .filter((p) => p.fromMemberId === me.id)
    .reduce((t, p) => t + p.amount, 0);
  const received = payments
    .filter((p) => p.toMemberId === me.id)
    .reduce((t, p) => t + p.amount, 0);

  const hadRound = priorGroomRoundOf(me.id, Number.MAX_SAFE_INTEGER, rounds) !== null;

  let forecast = null;
  if (!hadRound) {
    const kuriNumber = Math.max(0, ...rounds.map((r) => r.kuriNumber)) + 1;
    const pseudo = {
      id: "__forecast",
      kuriNumber,
      groomMemberId: me.id,
      nikahDate: 0,
      kuriLastDate: 0,
      status: "active",
    };
    const dues = generateRoundDues(members, {
      round: pseudo,
      groom: me,
      allRounds: [...rounds, pseudo],
      allPayments: payments,
      participation: new Map(),
      overrides: new Map(),
    });
    forecast = dues.reduce((t, d) => t + d.dueAmount, 0);
  }

  return Card({
    title: "Where you stand",
    body: el(
      "div.stack",
      el(
        "div.spread",
        el(
          "div",
          el("div.stat-label", "Paid in so far"),
          Money(paidOut, { size: "lg", tone: "paid" }),
        ),
        el(
          "div",
          { style: { textAlign: "right" } },
          el("div.stat-label", hadRound ? "Received in your round" : "Received"),
          Money(received, { size: "lg", tone: "muted" }),
        ),
      ),
      hadRound
        ? el(
            "p.small.muted",
            "You have had your round. From here you repay each member exactly what he gave you, " +
              "as his own turn comes.",
          )
        : el(
            "div",
            el("div.divider"),
            el(
              "div.spread",
              el("span.small", "If your round were next, you would collect about"),
              Money(forecast, { tone: "paid" }),
            ),
            el(
              "p.xs.muted",
              { style: { marginTop: "var(--s2)" } },
              "An estimate from what everyone owes you today. It moves as members join, opt out, " +
                "or have their own rounds first.",
            ),
          ),
    ),
  });
}

function lastRoundCard(completed, payments) {
  if (completed.length === 0) return null;
  const last = [...completed].sort((a, b) => b.kuriNumber - a.kuriNumber)[0];
  const groom = memberById(last.groomMemberId);
  const total = payments.filter((p) => p.kuriId === last.id).reduce((t, p) => t + p.amount, 0);

  return Card({
    title: "Most recent round",
    action: last.closedShort ? Badge("closed short", "pending") : Badge("complete", "paid"),
    body: el(
      "div.spread",
      el(
        "div",
        el("div.ledger-title", groom?.name || "Unassigned"),
        el("div.small.muted", `Kuri ${last.kuriNumber} · nikah ${fmtDate(last.nikahDate)}`),
      ),
      el(
        "div",
        { style: { textAlign: "right" } },
        Money(total, { tone: "paid" }),
        el("div.xs.muted", "handed over"),
      ),
    ),
  });
}

function roundsSoFarCard(rounds, payments) {
  return Card({
    title: "Rounds so far",
    padded: false,
    body: el(
      "div.ledger",
      [...rounds]
        .sort((a, b) => b.kuriNumber - a.kuriNumber)
        .map((r) => {
          const groom = memberById(r.groomMemberId);
          const total = payments.filter((p) => p.kuriId === r.id).reduce((t, p) => t + p.amount, 0);
          const contributors = new Set(
            payments.filter((p) => p.kuriId === r.id && p.amount > 0).map((p) => p.fromMemberId),
          ).size;

          const link = el("a.ledger-row.plain", { href: `#/rounds/${r.id}` });
          link.append(
            el("span.avatar", String(r.kuriNumber)),
            el(
              "div.ledger-main",
              el("div.ledger-title", groom?.name || "Unassigned"),
              el(
                "div.ledger-meta",
                `${fmtDate(r.nikahDate)} · ${contributors} contributed`,
              ),
            ),
            el(
              "div",
              { style: { textAlign: "right" } },
              Money(total, { tone: "paid" }),
              r.closedShort
                ? el("div", { style: { marginTop: "2px" } }, Badge("short", "pending"))
                : null,
            ),
          );
          return link;
        }),
    ),
  });
}

function byTeamCard(members, payments) {
  return Card({
    title: "Paid in by team, all time",
    body: el(
      "div.stack",
      TEAMS.map((team) => {
        const ids = new Set(members.filter((m) => m.team === team).map((m) => m.id));
        const paidIn = payments
          .filter((p) => ids.has(p.fromMemberId))
          .reduce((t, p) => t + p.amount, 0);
        return el(
          "div.spread",
          el("span.small", TeamDot(team), ` ${team}`),
          el(
            "span.small",
            Money(paidIn, { size: "sm", tone: "paid" }),
            el("span.muted", ` · ${ids.size} members`),
          ),
        );
      }),
    ),
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
