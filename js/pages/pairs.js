/**
 * The pairwise view the spreadsheet never had: for any member, what he has
 * given each other member and what he has received back.
 *
 * A balance only becomes a *debt* once both members have had their rounds —
 * until then it is an expectation. The screen says which it is rather than
 * presenting an expectation as money owed.
 */

import { el, Badge, Card, EmptyState, Money, Select } from "../lib/ui.js";
import { money } from "../lib/format.js";
import { data, dataStore, memberById } from "../lib/data.js";
import { currentMember } from "../lib/auth.js";
import { pairwiseBalances } from "../domain/ledger.js";

export function renderPairs(host) {
  const state = { focusId: currentMember()?.id || "" };
  const unsub = dataStore.subscribe(draw);

  function draw() {
    const { members, payments, rounds } = data();
    const balances = pairwiseBalances(members, payments, rounds);
    const mine = balances.filter((b) => b.memberId === state.focusId);
    const focus = memberById(state.focusId);

    host.replaceChildren(
      el(
        "div.stack",
        Card({
          body: el(
            "div.field",
            el("label", "Show balances for"),
            Select(
              members.map((m) => ({ value: m.id, label: m.name })),
              {
                value: state.focusId,
                placeholder: "Select a member…",
                onChange: (v) => {
                  state.focusId = v;
                  draw();
                },
              },
            ),
          ),
        }),
        !focus
          ? EmptyState({
              title: "Pick a member",
              body: "Choose someone to see every pair they’re part of.",
            })
          : mine.length === 0
            ? EmptyState({
                title: `No money has moved through ${focus.name} yet`,
                body: "Balances appear once payments are recorded.",
              })
            : el(
                "div.stack",
                pairList({
                  title: `Owed to ${focus.name}`,
                  emptyText: "Nobody owes him anything.",
                  rows: mine.filter((b) => b.net > 0),
                  tone: "paid",
                }),
                pairList({
                  title: `${focus.name} owes`,
                  emptyText: "He owes nobody.",
                  rows: mine.filter((b) => b.net < 0),
                  tone: "owed",
                }),
              ),
      ),
    );
  }

  return unsub;
}

function pairList({ title, emptyText, rows, tone }) {
  return Card({
    title,
    padded: rows.length === 0,
    body:
      rows.length === 0
        ? el("p.small.muted", emptyText)
        : el(
            "div.ledger",
            rows.map((b) =>
              el(
                "div.ledger-row",
                el(
                  "div.ledger-main",
                  el("div.ledger-title", memberById(b.counterpartyId)?.name || "?"),
                  el("div.ledger-meta", `gave ${money(b.gave)} · received ${money(b.received)}`),
                ),
                el(
                  "div",
                  { style: { textAlign: "right" } },
                  Money(Math.abs(b.net), { tone }),
                  el(
                    "div",
                    { style: { marginTop: "2px" } },
                    b.bothSettled ? Badge("both settled", "paid") : Badge("expected", "pending"),
                  ),
                ),
              ),
            ),
          ),
  });
}
