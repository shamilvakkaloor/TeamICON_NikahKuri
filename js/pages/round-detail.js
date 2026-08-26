import {
  el,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  MoneyInput,
  Money,
  Notice,
  Progress,
  Radio,
  TeamDot,
  openDialog,
  toast,
} from "../lib/ui.js";
import { icon } from "../lib/icons.js";
import { fmtDate, money } from "../lib/format.js";
import { data, dataStore, memberById, roundById } from "../lib/data.js";
import { buildRoundLedger, loadRoundContext, teamTotals } from "../lib/roundLedger.js";
import { currentMember, isAdmin } from "../lib/auth.js";
import { DEFAULT_AMOUNT, TEAMS } from "../domain/ledger.js";
import {
  logAudit,
  publishRound,
  setParticipation,
  setRoundOverride,
  clearRoundOverride,
  setStandingAmount,
  updateMember,
  updateRound,
  writeRoundDues,
} from "../lib/crud.js";

const BASIS_LABEL = {
  mirrors_earlier_receipt: "Repayment",
  standing_amount: "Standard",
  round_override: "This round only",
  exempt_groom: "Groom",
  opted_out: "Opted out",
  exited: "Not applicable",
};

export function renderRoundDetail(host, { kuriId }) {
  let extra = { participation: new Map(), overrides: new Map() };

  const reload = () =>
    loadRoundContext(kuriId).then((ctx) => {
      extra = ctx;
      draw();
    });

  const unsub = dataStore.subscribe(draw);
  reload();

  function draw() {
    const round = roundById(kuriId);
    if (!round) return host.replaceChildren(EmptyState({ title: "Round not found" }));

    const { rows, expected, collected, groom } = buildRoundLedger(round, extra);
    const unpaid = rows.filter((r) => r.balance > 0);
    const suppressed = rows.filter((r) => r.standingChangeSuppressed);
    const admin = isAdmin();
    const open = round.status === "active";

    host.replaceChildren(
      el(
        "div.stack",
        headerCard({ round, groom, expected, collected }),
        suppressed.length > 0
          ? Notice(
              `${suppressed.length} member${suppressed.length > 1 ? "s have" : " has"} a one-off amount set for this round that overrides their standing amount. ` +
                "The one-off wins — it was set deliberately for this round.",
              "warn",
            )
          : null,
        admin
          ? el(
              "div.row.wrap",
              open
                ? Button("Publish these dues", {
                    variant: "outline",
                    onClick: () => publishDues(round, rows),
                  })
                : null,
              Button("Publish to public page", {
                variant: "outline",
                onClick: () => pushPublic(round, groom, rows, collected),
              }),
              open
                ? Button("Close round", {
                    onClick: () => confirmClose({ round, groom, rows, expected, collected, unpaid }),
                  })
                : null,
            )
          : null,
        duesCard({ rows, unpaid, admin, open, round, onChanged: reload }),
      ),
    );
  }

  return unsub;
}

function headerCard({ round, groom, expected, collected }) {
  return el(
    "section.card.card-body",
    el(
      "div.spread",
      el(
        "div",
        el("div.stat-label", `Kuri ${round.kuriNumber}`),
        el("h2", groom?.name || "Unassigned"),
        el(
          "div.small.muted",
          { style: { marginTop: "var(--s1)" } },
          `Nikah ${fmtDate(round.nikahDate)} · Last date ${fmtDate(round.kuriLastDate)}`,
        ),
      ),
      Badge(round.status, round.status === "completed" ? "paid" : "pending"),
    ),
    el("div.divider"),
    el(
      "div.spread",
      { style: { marginBottom: "var(--s2)" } },
      Money(collected, { size: "lg", tone: "paid" }),
      el("span.small.muted", `of ${money(expected)} expected`),
    ),
    Progress(collected, expected),
    round.closedShort
      ? el(
          "div",
          { style: { marginTop: "var(--s3)" } },
          Notice(
            "Closed short. Because every repayment mirrors what was actually received, each member " +
              "is now owed back only what he gave — the ledger corrects itself.",
            "warn",
          ),
        )
      : null,
  );
}

function duesCard({ rows, unpaid, admin, open, round, onChanged }) {
  return Card({
    title: `Dues — ${rows.length} members`,
    action:
      unpaid.length > 0 ? Badge(`${unpaid.length} outstanding`, "owed") : Badge("All in", "paid"),
    padded: false,
    body: el(
      "div.ledger",
      rows.map((row) =>
        el(
          `div.ledger-row${row.dueAmount === 0 ? ".dim" : ""}`,
          el("span.avatar", TeamDot(row.team)),
          el(
            "div.ledger-main",
            el("div.ledger-title", row.name),
            el("div.ledger-meta", row.explanation),
          ),
          el(
            "div",
            { style: { textAlign: "right" } },
            Money(row.balance, {
              tone: row.balance > 0 ? "owed" : row.dueAmount === 0 ? "muted" : "paid",
            }),
            el(
              "div.row.end",
              { style: { marginTop: "2px" } },
              (() => {
                const b = el("span.badge", BASIS_LABEL[row.basis]);
                if (row.locked) b.prepend(icon("lock", 11));
                return b;
              })(),
            ),
          ),
          admin && open && !row.locked
            ? Button("Edit", {
                variant: "ghost",
                size: "sm",
                onClick: () => openAmountDialog({ row, round, onChanged }),
              })
            : null,
        ),
      ),
    ),
  });
}

async function publishDues(round, rows) {
  await writeRoundDues(round.id, rows);
  toast("Dues published for this round.", "success");
}

async function pushPublic(round, groom, rows, collected) {
  const byTeam = {};
  for (const { team, collected: got } of teamTotals(rows, TEAMS)) byTeam[team] = got;

  await publishRound(round, {
    groomName: groom?.name || "",
    groomPhotoUrl: groom?.photoUrl || "",
    totalCollected: collected,
    byTeam,
  });
  toast("Public page updated.", "success");
}

function confirmClose({ round, groom, expected, collected, unpaid }) {
  const short = collected < expected;

  const close = openDialog({
    title: "Close this round?",
    body: el(
      "div.stack",
      short
        ? Notice(
            `${money(expected - collected)} is still outstanding from ${unpaid.length} member${unpaid.length > 1 ? "s" : ""}. ` +
              "Closing now marks the reduced figure as final. Each of them will then owe back only " +
              "what they actually paid in.",
            "warn",
          )
        : Notice("Everything has been collected. Closing marks the round complete.", "info"),
      el(
        "p.small.muted",
        `${groom?.name} will be marked as having had his round and will not be eligible again.`,
      ),
    ),
    footer: [
      Button("Cancel", { variant: "outline", onClick: () => close() }),
      Button("Close round", {
        onClick: async () => {
          const me = currentMember();
          await updateRound(round.id, { status: "completed", closedShort: short });
          if (groom) await updateMember(groom.id, { hasBeenGroom: true }, groom);
          await logAudit({
            targetType: "round",
            targetId: round.id,
            field: "status",
            oldValue: round.status,
            newValue: "completed",
            changedByMemberId: me?.id || "",
            reason: short ? `Closed short by ${money(expected - collected)}` : "Fully collected",
          });
          toast(`Kuri ${round.kuriNumber} closed.`, "success");
          close();
        },
      }),
    ],
  });
}

/**
 * Setting an amount always carries a scope. "Only this round" is the default
 * because in practice almost every change is a one-off; adjusting future
 * rounds in advance is the deliberate second choice (rule 2).
 */
function openAmountDialog({ row, round, onChanged }) {
  const member = memberById(row.memberId);
  const me = currentMember();
  const state = {
    amount: String(row.dueAmount),
    scope: "round",
    optOut: row.basis === "opted_out",
    reason: "",
  };

  const bodyHost = el("div.stack");

  function drawBody() {
    const value = Number(state.amount) || 0;
    const standing = member?.standingAmount ?? DEFAULT_AMOUNT;

    bodyHost.replaceChildren(
      Checkbox("Opt out of this round", {
        checked: state.optOut,
        onChange: (v) => {
          state.optOut = v;
          drawBody();
        },
      }),
      ...(state.optOut
        ? [
            Field({
              label: "Reason",
              hint: "Recorded on the round so the decision is traceable.",
              control: Input({
                value: state.reason,
                placeholder: "e.g. Hospital expenses",
                oninput: (e) => {
                  state.reason = e.target.value;
                },
              }),
            }),
          ]
        : [
            Field({
              label: "Amount",
              hint: `Default is ${money(DEFAULT_AMOUNT)}. Standing amount is ${money(standing)}.`,
              control: MoneyInput({
                value: state.amount,
                oninput: (e) => {
                  state.amount = e.target.value;
                  drawWarning();
                },
              }),
            }),
            Field({
              label: "Scope",
              control: el(
                "div.stack",
                { style: { gap: "var(--s2)" } },
                Radio(`Only for Kuri ${round.kuriNumber} — does not carry forward`, {
                  name: "scope",
                  checked: state.scope === "round",
                  onChange: () => {
                    state.scope = "round";
                  },
                }),
                Radio(`From Kuri ${round.kuriNumber} onward — becomes his standing amount`, {
                  name: "scope",
                  checked: state.scope === "onward",
                  onChange: () => {
                    state.scope = "onward";
                  },
                }),
              ),
            }),
            warningHost,
          ]),
    );
    drawWarning();
  }

  const warningHost = el("div");

  function drawWarning() {
    const value = Number(state.amount) || 0;
    warningHost.replaceChildren(
      value > DEFAULT_AMOUNT
        ? Notice(
            `${member?.name} gives ${money(value)}, so when his own round comes the groom of this ` +
              `round will owe him exactly that back — not ${money(DEFAULT_AMOUNT)}.`,
            "warn",
          )
        : null,
    );
  }

  drawBody();

  const close = openDialog({
    title: `${member?.name}'s amount`,
    body: bodyHost,
    footer: [
      Button("Cancel", { variant: "outline", onClick: () => close() }),
      Button("Save", {
        onClick: async () => {
          if (!member || !me) return;
          const value = Number(state.amount) || 0;

          if (state.optOut) {
            await setParticipation(round.id, member.id, false, state.reason);
          } else {
            await setParticipation(round.id, member.id, true, "");
            if (state.scope === "round") {
              await setRoundOverride(round.id, member.id, value, me.id);
            } else {
              // A standing change must not silently override a one-off already
              // set for this round, so clear it deliberately (rule 15).
              await clearRoundOverride(round.id, member.id).catch(() => {});
              await setStandingAmount(member, value, round.kuriNumber, me.id);
            }
          }
          toast("Amount updated.", "success");
          close();
          onChanged();
        },
      }),
    ],
  });
}
