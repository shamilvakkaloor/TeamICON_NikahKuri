import {
  el,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Money,
  MoneyInput,
  Notice,
  Select,
  TeamDot,
  openDialog,
  toast,
} from "../lib/ui.js";
import { icon } from "../lib/icons.js";
import { dateInputValue, fmtDate, money } from "../lib/format.js";
import { activeRound, data, dataStore, memberById } from "../lib/data.js";
import { buildRoundLedger, loadRoundContext } from "../lib/roundLedger.js";
import { currentMember, isAdmin, isCoordinator } from "../lib/auth.js";
import { editPayment, recordPayment, voidPayment } from "../lib/crud.js";
import { openPaymentsImport } from "../components/import-payments.js";

export function renderPayments(host) {
  const state = { search: "", roundFilter: activeRound()?.id || "all", showRemoved: false };
  const unsub = dataStore.subscribe(draw);

  function draw() {
    const { payments, rounds } = data();
    const q = state.search.trim().toLowerCase();

    const inScope = payments.filter((p) => {
      if (state.roundFilter !== "all" && p.kuriId !== state.roundFilter) return false;
      if (!q) return true;
      const from = memberById(p.fromMemberId)?.name.toLowerCase() || "";
      const to = memberById(p.toMemberId)?.name.toLowerCase() || "";
      return from.includes(q) || to.includes(q);
    });

    // Removed payments stay in the journal but are hidden by default — after a
    // bad import there can be a lot of them, and they carry no money.
    const removedCount = inScope.filter((p) => p.voided).length;
    const filtered = state.showRemoved ? inScope : inScope.filter((p) => !p.voided);

    const total = filtered.reduce((t, p) => t + p.amount, 0);
    const canWrite = isAdmin() || isCoordinator();
    const round = activeRound();

    const searchInput = Input({
      type: "search",
      placeholder: "Search by member…",
      value: state.search,
      style: { maxWidth: "280px" },
      oninput: (e) => {
        state.search = e.target.value;
        draw();
        // Redrawing blows away focus, so put it back where the user was.
        const next = host.querySelector('input[type="search"]');
        if (next) {
          next.focus();
          next.setSelectionRange(next.value.length, next.value.length);
        }
      },
    });

    host.replaceChildren(
      el(
        "div.stack",
        el(
          "div.row.wrap.between",
          searchInput,
          canWrite
            ? el(
                "div.row.wrap",
                { style: { gap: "var(--s2)" } },
                isAdmin()
                  ? Button("Import history", {
                      variant: "outline",
                      size: "sm",
                      onClick: () => openPaymentsImport({ onImported: draw }),
                    })
                  : null,
                (() => {
                  const b = Button("Record payment", {
                    onClick: () => openRecordDialog(),
                    disabled: !round,
                    title: round ? "" : "No round is open",
                  });
                  b.prepend(icon("plus", 16));
                  return b;
                })(),
              )
            : null,
        ),
        el(
          "div.pill-row",
          el(
            `button.pill${state.roundFilter === "all" ? ".active" : ""}`,
            {
              onclick: () => {
                state.roundFilter = "all";
                draw();
              },
            },
            "All rounds",
          ),
          [...rounds]
            .sort((a, b) => b.kuriNumber - a.kuriNumber)
            .map((r) =>
              el(
                `button.pill${state.roundFilter === r.id ? ".active" : ""}`,
                {
                  onclick: () => {
                    state.roundFilter = r.id;
                    draw();
                  },
                },
                `Kuri ${r.kuriNumber}`,
              ),
            ),
        ),
        el(
          "div.spread.small.muted",
          el(
            "span",
            `${filtered.length} payment${filtered.length === 1 ? "" : "s"}`,
            removedCount > 0
              ? el(
                  "button.linkish",
                  {
                    type: "button",
                    onclick: () => {
                      state.showRemoved = !state.showRemoved;
                      draw();
                    },
                  },
                  state.showRemoved
                    ? "hide removed"
                    : `${removedCount} removed — show`,
                )
              : null,
          ),
          Money(total, { size: "sm", tone: "paid" }),
        ),
        filtered.length === 0
          ? EmptyState({
              title: "No payments recorded",
              body: round
                ? "Coordinators record money as they collect it from their team."
                : "Payments are recorded against an open round.",
            })
          : Card({
              padded: false,
              body: el(
                "div.ledger",
                filtered.map((p) => {
                  const round = rounds.find((r) => r.id === p.kuriId);
                  const title = el(
                    "div.ledger-title",
                    `${memberById(p.fromMemberId)?.name || "?"} → ${memberById(p.toMemberId)?.name || "?"}`,
                  );
                  if (p.voided) title.append(" ", Badge("removed", "owed"));
                  else if (p.edited) title.append(" ", Badge("edited", "pending"));

                  return el(
                    `div.ledger-row${p.voided ? ".dim" : ""}`,
                    el("span.avatar", TeamDot(p.team)),
                    el(
                      "div.ledger-main",
                      title,
                      el(
                        "div.ledger-meta",
                        `${fmtDate(p.date)} · Kuri ${round?.kuriNumber ?? "?"} · ${p.team}${p.notes ? ` · ${p.notes}` : ""}`,
                      ),
                    ),
                    Money(p.amount, { tone: p.voided ? "muted" : "paid" }),
                    isAdmin() && !p.voided
                      ? Button("Remove", {
                          variant: "ghost",
                          size: "sm",
                          onClick: () => openRemoveDialog(p),
                        })
                      : null,
                    isAdmin()
                      ? Button(p.voided ? "Restore" : "Edit", {
                          variant: "ghost",
                          size: "sm",
                          onClick: () => openEditDialog(p),
                        })
                      : null,
                  );
                }),
              ),
            }),
      ),
    );
  }

  return unsub;
}

function openRecordDialog() {
  const round = activeRound();
  const me = currentMember();
  if (!round || !me) return;

  const state = { fromMemberId: "", amount: "", when: dateInputValue(), notes: "" };
  const bodyHost = el("div.stack");
  const groomName = memberById(round.groomMemberId)?.name || "";

  let rows = [];

  loadRoundContext(round.id).then((ctx) => {
    rows = buildRoundLedger(round, ctx).rows;
    drawBody();
  });

  function drawBody() {
    // A coordinator collects only from his own team; the admin sees everyone.
    const collectable = rows.filter(
      (r) => r.dueAmount > 0 && (isAdmin() || r.team === me.team),
    );
    const selected = rows.find((r) => r.memberId === state.fromMemberId);

    bodyHost.replaceChildren(
      errorHost,
      Notice(`Goes to ${groomName} for Kuri ${round.kuriNumber}.`, "info"),
      Field({
        label: "From",
        control: Select(
          collectable.map((r) => ({
            value: r.memberId,
            label: `${r.name} — ${r.balance > 0 ? `${money(r.balance)} due` : "settled"}`,
          })),
          {
            value: state.fromMemberId,
            placeholder: "Select a member…",
            onChange: (v) => {
              state.fromMemberId = v;
              const row = rows.find((r) => r.memberId === v);
              if (row && row.balance > 0) state.amount = String(row.balance);
              drawBody();
            },
          },
        ),
      }),
      selected
        ? el(
            "div.notice",
            el(
              "span.small",
              `Due ${money(selected.dueAmount)} · paid ${money(selected.paidSoFar)} · ${selected.explanation}`,
            ),
          )
        : null,
      el(
        "div.form-grid.two",
        Field({
          label: "Amount",
          hint: "Partial payments are fine — they accumulate.",
          control: MoneyInput({
            value: state.amount,
            min: 1,
            oninput: (e) => {
              state.amount = e.target.value;
            },
          }),
        }),
        Field({
          label: "Date",
          control: Input({
            type: "date",
            value: state.when,
            oninput: (e) => {
              state.when = e.target.value;
            },
          }),
        }),
      ),
      Field({
        label: "Note (optional)",
        control: Input({
          value: state.notes,
          placeholder: "e.g. handed at masjid",
          oninput: (e) => {
            state.notes = e.target.value;
          },
        }),
      }),
    );
  }

  const errorHost = el("div");
  drawBody();

  const close = openDialog({
    title: "Record a payment",
    body: bodyHost,
    footer: [
      Button("Cancel", { variant: "outline", onClick: () => close() }),
      Button("Record", { onClick: submit }),
    ],
  });

  async function submit() {
    errorHost.replaceChildren();
    const payer = memberById(state.fromMemberId);
    const value = Number(state.amount);

    if (!payer || !value || value <= 0) {
      errorHost.append(Notice("Choose a member and enter an amount.", "danger"));
      return;
    }

    try {
      await recordPayment({
        fromMemberId: payer.id,
        // The groom. This is the field the whole pairwise rule depends on.
        toMemberId: round.groomMemberId,
        kuriId: round.id,
        team: payer.team,
        amount: value,
        date: new Date(state.when).getTime(),
        recordedByMemberId: me.id,
        notes: state.notes,
      });
      toast(`${money(value)} recorded from ${payer.name}.`, "success");
      close();
    } catch (e) {
      errorHost.append(Notice(e?.message || "Could not record the payment.", "danger"));
    }
  }
}

/**
 * Remove a payment from the ledger.
 *
 * This zeroes it rather than deleting the record. Repayment mirrors what was
 * actually received, so a payment is not just a row — it is the evidence for
 * what somebody is owed back in his own round. Erasing it outright would move
 * that figure with nothing left to explain why, which is exactly the argument
 * this app exists to prevent.
 */
function openRemoveDialog(payment) {
  const me = currentMember();
  const { rounds } = data();
  const round = rounds.find((r) => r.id === payment.kuriId);
  const from = memberById(payment.fromMemberId);
  const to = memberById(payment.toMemberId);

  const state = { reason: "" };
  const errorHost = el("div");

  const close = openDialog({
    title: "Remove this payment?",
    body: el(
      "div.stack",
      errorHost,
      el(
        "div.notice",
        el(
          "span.small",
          `${from?.name || "?"} → ${to?.name || "?"} · ${money(payment.amount)} · Kuri ${round?.kuriNumber ?? "?"} · ${fmtDate(payment.date)}`,
        ),
      ),
      Notice(
        `It stops counting towards Kuri ${round?.kuriNumber ?? "?"} immediately, and ` +
          `${to?.name || "the groom"} will no longer owe ${from?.name || "him"} this money back ` +
          "in his own round.",
        "warn",
      ),
      el(
        "p.small.muted",
        "The row stays in the journal marked ",
        el("strong", "removed"),
        ", with your reason in the audit log. You can restore it later. Nothing is erased — that " +
          "is what keeps a corrected figure explainable a year from now.",
      ),
      Field({
        label: "Why is it being removed?",
        hint: "Shown in the audit log.",
        control: Input({
          value: state.reason,
          placeholder: "e.g. entered twice during the history import",
          oninput: (e) => {
            state.reason = e.target.value;
          },
        }),
      }),
    ),
    footer: [
      Button("Cancel", { variant: "outline", onClick: () => close() }),
      Button("Remove payment", { variant: "danger", onClick: submit }),
    ],
  });

  async function submit() {
    errorHost.replaceChildren();
    if (!state.reason.trim()) {
      errorHost.append(Notice("A reason is required — it goes in the audit log.", "danger"));
      return;
    }
    try {
      await voidPayment(payment.id, payment.amount, {
        targetType: "payment",
        targetId: payment.id,
        changedByMemberId: me?.id || "",
        reason: state.reason.trim(),
      });
      toast("Payment removed.", "success");
      close();
    } catch (e) {
      errorHost.append(Notice(e?.message || "Could not remove the payment.", "danger"));
    }
  }
}

/** Payments are editable, never deletable — a correction keeps the trail. */
function openEditDialog(payment) {
  const me = currentMember();
  const state = { amount: String(payment.amount), reason: "", confirmed: false };
  const bodyHost = el("div.stack");
  const errorHost = el("div");

  function drawBody() {
    const value = Number(state.amount) || 0;
    const changed = value !== payment.amount;

    bodyHost.replaceChildren(
      errorHost,
      Notice(
        "Payments are never deleted. This records a correction and leaves a permanent “edited” " +
          "marker plus an audit entry.",
        "warn",
      ),
      Field({
        label: "Amount",
        control: MoneyInput({
          value: state.amount,
          oninput: (e) => {
            state.amount = e.target.value;
            drawBody();
          },
        }),
      }),
      Field({
        label: "Reason for the change",
        hint: "Shown in the audit log.",
        control: Input({
          value: state.reason,
          oninput: (e) => {
            state.reason = e.target.value;
          },
        }),
      }),
      changed
        ? Notice(
            "This changes what the payer is owed back in his own round — repayment mirrors what " +
              "was actually received. Confirm you have checked who this affects.",
            "danger",
          )
        : null,
      Checkbox("I understand the downstream effect of this correction.", {
        checked: state.confirmed,
        onChange: (v) => {
          state.confirmed = v;
        },
      }),
    );
  }

  drawBody();

  const close = openDialog({
    title: "Edit payment",
    body: bodyHost,
    footer: [
      Button("Cancel", { variant: "outline", onClick: () => close() }),
      Button("Save correction", { variant: "danger", onClick: submit }),
    ],
  });

  async function submit() {
    errorHost.replaceChildren();
    const value = Number(state.amount) || 0;

    if (value === payment.amount) {
      errorHost.append(Notice("Nothing has changed.", "danger"));
      return;
    }
    if (!state.reason.trim()) {
      errorHost.append(Notice("A reason is required — it goes in the audit log.", "danger"));
      return;
    }
    if (!state.confirmed) {
      errorHost.append(Notice("Tick the confirmation before saving.", "danger"));
      return;
    }

    try {
      await editPayment(
        payment.id,
        { amount: value },
        {
          targetType: "payment",
          targetId: payment.id,
          field: "amount",
          oldValue: payment.amount,
          newValue: value,
          changedByMemberId: me?.id || "",
          reason: state.reason.trim(),
        },
      );
      toast("Correction recorded.", "success");
      close();
    } catch (e) {
      errorHost.append(Notice(e?.message || "Could not save the correction.", "danger"));
    }
  }
}
