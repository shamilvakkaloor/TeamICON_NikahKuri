/**
 * Exit reconciliation.
 *
 * A past groom is net-positive and must be brought to zero before he can
 * leave; a member who never had his round is refunded in full. Exit is gated —
 * status cannot become `exited` until every line is settled, so the window is
 * auditable rather than a WhatsApp argument.
 */

import {
  el,
  Badge,
  Button,
  Card,
  EmptyState,
  Money,
  Notice,
  Select,
  toast,
} from "../lib/ui.js";
import { money } from "../lib/format.js";
import { data, dataStore, memberById } from "../lib/data.js";
import { isAdmin } from "../lib/auth.js";
import { computeSettlement, priorGroomRoundOf } from "../domain/ledger.js";
import {
  fetchSettlements,
  markSettlementSettled,
  updateMember,
  writeSettlements,
} from "../lib/crud.js";

export function renderSettlement(host) {
  if (!isAdmin()) {
    host.replaceChildren(EmptyState({ title: "Admin only", body: "Settlement is run by the admin." }));
    return () => {};
  }

  const state = { selectedId: "", existing: [] };
  const unsub = dataStore.subscribe(draw);

  async function select(memberId) {
    state.selectedId = memberId;
    state.existing = memberId ? await fetchSettlements(memberId).catch(() => []) : [];
    draw();
  }

  function draw() {
    const { members, payments, rounds } = data();
    const exiting = memberById(state.selectedId);

    const lines = exiting ? computeSettlement(exiting, members, payments, rounds) : [];
    const wasGroom = exiting
      ? priorGroomRoundOf(exiting.id, Number.MAX_SAFE_INTEGER, rounds) !== null
      : false;
    const total = lines.reduce((t, l) => t + l.amount, 0);
    const allSettled =
      state.existing.length > 0 && state.existing.every((s) => s.status === "settled");

    host.replaceChildren(
      el(
        "div.stack",
        Card({
          body: el(
            "div.field",
            el("label", "Member leaving the scheme"),
            Select(
              members.filter((m) => m.status !== "exited").map((m) => ({
                value: m.id,
                label: `${m.name} — ${m.team}`,
              })),
              { value: state.selectedId, placeholder: "Select a member…", onChange: select },
            ),
          ),
        }),
        !exiting
          ? EmptyState({
              title: "Nobody selected",
              body: "Pick a member to compute what he owes, or is owed, before he can leave.",
            })
          : el(
              "div.stack",
              Notice(
                wasGroom
                  ? `${exiting.name} has already had his round, so he is net-positive. He must repay ` +
                      `everyone below before he can leave — ${money(total)} in total.`
                  : `${exiting.name} has not had his round, so he is refunded in full. The past grooms ` +
                      `below return ${money(total)} between them.`,
                wasGroom ? "warn" : "info",
              ),
              state.existing.length === 0
                ? el(
                    "div.stack",
                    Card({
                      title: `${lines.length} obligations`,
                      padded: lines.length === 0,
                      body:
                        lines.length === 0
                          ? el(
                              "p.small.muted",
                              `Nothing to settle — no money has moved between ${exiting.name} and anyone else.`,
                            )
                          : el(
                              "div.ledger",
                              lines.map((l) =>
                                el(
                                  "div.ledger-row",
                                  el(
                                    "div.ledger-main",
                                    el("div.ledger-title", memberById(l.counterpartyMemberId)?.name || "?"),
                                    el(
                                      "div.ledger-meta",
                                      l.direction === "owed_by_exiting"
                                        ? `${exiting.name} repays him`
                                        : `He refunds ${exiting.name}`,
                                    ),
                                  ),
                                  Money(l.amount, {
                                    tone: l.direction === "owed_by_exiting" ? "owed" : "paid",
                                  }),
                                ),
                              ),
                            ),
                    }),
                    Button("Start settlement", {
                      disabled: lines.length === 0,
                      onClick: async () => {
                        await writeSettlements(
                          lines.map((l) => ({
                            exitingMemberId: exiting.id,
                            counterpartyMemberId: l.counterpartyMemberId,
                            direction: l.direction,
                            amount: l.amount,
                            status: "pending",
                          })),
                        );
                        await updateMember(exiting.id, { status: "exiting" }, exiting);
                        toast("Settlement started.", "success");
                        select(exiting.id);
                      },
                    }),
                  )
                : el(
                    "div.stack",
                    Card({
                      title: "Settlement in progress",
                      padded: false,
                      body: el(
                        "div.ledger",
                        state.existing.map((s) =>
                          el(
                            `div.ledger-row${s.status === "settled" ? ".dim" : ""}`,
                            el(
                              "div.ledger-main",
                              el("div.ledger-title", memberById(s.counterpartyMemberId)?.name || "?"),
                              el(
                                "div.ledger-meta",
                                s.direction === "owed_by_exiting" ? "repay" : "refund",
                              ),
                            ),
                            Money(s.amount, { tone: s.status === "settled" ? "muted" : "owed" }),
                            s.status === "settled"
                              ? Badge("settled", "paid")
                              : Button("Mark settled", {
                                  variant: "outline",
                                  size: "sm",
                                  onClick: async () => {
                                    await markSettlementSettled(s.id);
                                    select(exiting.id);
                                  },
                                }),
                          ),
                        ),
                      ),
                    }),
                    Button(
                      exiting.status === "exited"
                        ? "Exited"
                        : allSettled
                          ? "Complete exit"
                          : "Exit blocked until every line is settled",
                      {
                        disabled: !allSettled || exiting.status === "exited",
                        onClick: async () => {
                          // Re-syncing the index is what actually revokes
                          // access — the rules read status from there, not
                          // from the member document.
                          await updateMember(exiting.id, { status: "exited" }, exiting);
                          toast(`${exiting.name} has exited.`, "success");
                          select(exiting.id);
                        },
                      },
                    ),
                  ),
            ),
      ),
    );
  }

  draw();
  return unsub;
}
