/**
 * Each of the four coordinators hands his own team's total directly to the
 * groom — four separate handovers per round, not one pooled payment. The admin
 * sees at a glance which teams have settled and which are still holding cash.
 */

import { el, Badge, Button, Card, EmptyState, Money, Notice, TeamDot, toast } from "../lib/ui.js";
import { icon } from "../lib/icons.js";
import { fmtDate, money } from "../lib/format.js";
import { activeRound, dataStore, memberById } from "../lib/data.js";
import { buildRoundLedger, loadRoundContext, teamTotals } from "../lib/roundLedger.js";
import { currentMember, isAdmin } from "../lib/auth.js";
import { fetchHandovers, setHandover } from "../lib/crud.js";
import { TEAMS } from "../domain/ledger.js";

export function renderHandover(host) {
  let extra = { participation: new Map(), overrides: new Map() };
  let handovers = [];

  const round = activeRound();
  const unsub = dataStore.subscribe(draw);

  async function reload() {
    if (!round) return draw();
    const [ctx, hs] = await Promise.all([
      loadRoundContext(round.id),
      fetchHandovers(round.id).catch(() => []),
    ]);
    extra = ctx;
    handovers = hs;
    draw();
  }
  reload();

  function draw() {
    if (!round) return host.replaceChildren(EmptyState({ title: "No round is open" }));

    const { rows, groom } = buildRoundLedger(round, extra);
    const totals = teamTotals(rows, TEAMS);
    const me = currentMember();
    const done = totals.filter(
      (t) => handovers.find((h) => h.team === t.team)?.status === "handed_over",
    ).length;

    host.replaceChildren(
      el(
        "div.stack",
        Notice(
          `Kuri ${round.kuriNumber} — ${groom?.name}. ${done} of ${TEAMS.length} teams have handed over.`,
          "info",
        ),
        totals.map(({ team, collected, expected, outstanding }) => {
          const record = handovers.find((h) => h.team === team);
          const handedOver = record?.status === "handed_over";
          const canAct = (me?.team === team && me?.role === "coordinator") || isAdmin();

          const heading = el("div.row", { style: { gap: "var(--s2)" } }, TeamDot(team), el("strong", team));
          if (handedOver) {
            const b = Badge("handed over", "paid");
            b.prepend(icon("check", 11));
            heading.append(b);
          } else {
            heading.append(Badge("collecting", "pending"));
          }

          return Card({
            body: el(
              "div",
              el(
                "div.spread",
                el(
                  "div",
                  heading,
                  el(
                    "div.small.muted",
                    { style: { marginTop: "var(--s1)" } },
                    handedOver && record?.handedOverAt
                      ? `Given to ${groom?.name} on ${fmtDate(record.handedOverAt)}`
                      : outstanding > 0
                        ? `${outstanding} member${outstanding > 1 ? "s" : ""} still to pay`
                        : "All collected — ready to hand over",
                  ),
                ),
                el(
                  "div",
                  { style: { textAlign: "right" } },
                  Money(handedOver ? (record?.collectedAmount ?? collected) : collected, { tone: "paid" }),
                  el("div.xs.muted", `of ${money(expected)}`),
                ),
              ),
              canAct && !handedOver
                ? el(
                    "div",
                    { style: { marginTop: "var(--s3)" } },
                    Button(`Mark handed to ${groom?.name?.split(" ")[0] || "groom"}`, {
                      size: "sm",
                      disabled: collected === 0,
                      onClick: async () => {
                        await setHandover(round.id, team, {
                          collectedAmount: collected,
                          coordinatorMemberId: me.id,
                          handedOverAt: Date.now(),
                          status: "handed_over",
                        });
                        toast(`${team} handed over.`, "success");
                        reload();
                      },
                    }),
                    outstanding > 0
                      ? el(
                          "span.xs.muted",
                          { style: { marginLeft: "var(--s3)" } },
                          "You can hand over a partial total — the rest follows later.",
                        )
                      : null,
                  )
                : null,
            ),
          });
        }),
      ),
    );
  }

  return unsub;
}
