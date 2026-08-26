/**
 * The member's own view: what he has paid, what he is owed, and — crucially —
 * *why* each figure is what it is. The basis is shown on every row because
 * "why do I owe ₹7,000 and he owes ₹3,500?" is the question that starts
 * arguments in a real group.
 */

import { el, Badge, Card, EmptyState, Money, Stat } from "../lib/ui.js";
import { icon } from "../lib/icons.js";
import { fmtDate } from "../lib/format.js";
import { data, dataStore, memberById } from "../lib/data.js";
import { currentMember } from "../lib/auth.js";
import { generateRoundDues, priorGroomRoundOf } from "../domain/ledger.js";

export function renderMine(host) {
  const unsub = dataStore.subscribe(draw);

  function draw() {
    const me = currentMember();
    if (!me) return host.replaceChildren(EmptyState({ title: "Not signed in" }));

    const { members, rounds, payments } = data();
    const paidOut = payments.filter((p) => p.fromMemberId === me.id);
    const received = payments.filter((p) => p.toMemberId === me.id);

    const perRound = [...rounds]
      .filter((r) => r.status !== "upcoming" && r.groomMemberId !== me.id)
      .sort((a, b) => b.kuriNumber - a.kuriNumber)
      .map((round) => {
        const groom = memberById(round.groomMemberId);
        if (!groom) return null;

        const dues = generateRoundDues(members, {
          round,
          groom,
          allRounds: rounds,
          allPayments: payments,
          participation: new Map(),
          overrides: new Map(),
        });
        const mine = dues.find((d) => d.memberId === me.id);
        if (!mine) return null;

        const paid = paidOut
          .filter((p) => p.kuriId === round.id)
          .reduce((t, p) => t + p.amount, 0);
        return { round, groom, due: mine, paid };
      })
      .filter(Boolean);

    const totalPaid = paidOut.reduce((t, p) => t + p.amount, 0);
    const totalReceived = received.reduce((t, p) => t + p.amount, 0);
    const outstanding = perRound.reduce((t, r) => t + Math.max(0, r.due.dueAmount - r.paid), 0);
    const hadRound = priorGroomRoundOf(me.id, Number.MAX_SAFE_INTEGER, rounds) !== null;

    host.replaceChildren(
      el(
        "div.stack",
        el(
          "div.grid",
          Stat({ label: "Paid in, lifetime", amount: totalPaid, tone: "paid" }),
          Stat({ label: "Received", amount: totalReceived, tone: "muted" }),
          Stat({
            label: "Outstanding now",
            amount: outstanding,
            tone: outstanding > 0 ? "owed" : "paid",
            note: outstanding === 0 ? "Nothing due." : null,
          }),
        ),
        !hadRound
          ? Card({
              body: el(
                "div.spread",
                el(
                  "span.small",
                  "You haven’t had your round yet. When it comes, everyone who received from you " +
                    "repays exactly what you gave.",
                ),
                Money(totalPaid, { tone: "paid" }),
              ),
            })
          : null,
        Card({
          title: "Round by round",
          padded: perRound.length === 0,
          body:
            perRound.length === 0
              ? EmptyState({ title: "No rounds yet" })
              : el(
                  "div.ledger",
                  perRound.map(({ round, groom, due, paid }) => {
                    const balance = due.dueAmount - paid;
                    const badges = el("div", { style: { marginTop: "2px" } });

                    badges.append(
                      balance > 0
                        ? Badge("due", "owed")
                        : due.dueAmount === 0
                          ? Badge("n/a")
                          : Badge("paid", "paid"),
                    );
                    if (due.locked) {
                      const b = Badge("fixed", "info");
                      b.prepend(icon("lock", 11));
                      badges.append(" ", b);
                    }

                    return el(
                      `div.ledger-row${due.dueAmount === 0 ? ".dim" : ""}`,
                      el("span.avatar", String(round.kuriNumber)),
                      el(
                        "div.ledger-main",
                        el("div.ledger-title", groom.name),
                        el("div.ledger-meta", `${fmtDate(round.nikahDate)} · ${due.explanation}`),
                      ),
                      el(
                        "div",
                        { style: { textAlign: "right" } },
                        Money(balance > 0 ? balance : due.dueAmount, {
                          tone: balance > 0 ? "owed" : due.dueAmount === 0 ? "muted" : "paid",
                        }),
                        badges,
                      ),
                    );
                  }),
                ),
        }),
      ),
    );
  }

  return unsub;
}
