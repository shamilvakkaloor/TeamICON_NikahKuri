/**
 * The pairwise ledger — the heart of the scheme.
 *
 * The spreadsheet models a round's due as one number (₹7,000 × everyone). The
 * real rules make the amount specific to each *pair* of members, so a round
 * cannot carry a flat due. Everything in this file exists to turn a pair
 * (member M, groom G) plus history into a single number and a reason for it.
 *
 * Nothing here imports Firebase. It is plain data in, plain data out, so the
 * rules can be run against `node --test js/domain/ledger.test.js` without a
 * browser, a network or an emulator.
 */

/** The default a member gives when nothing else pins the figure down. */
export const DEFAULT_AMOUNT = 7000;

export const TEAMS = ["KODUVALLY", "KOZHIKODE", "MALAPPURAM", "VADAKARA"];

/**
 * @typedef {"mirrors_earlier_receipt"|"standing_amount"|"round_override"
 *           |"exempt_groom"|"opted_out"|"exited"} DueBasis
 */

/**
 * The member's standing amount as it stood at a given round number.
 *
 * `amountHistory` is append-only, so the effective figure is the latest entry
 * that had come into force by then — not the member's current `standingAmount`,
 * which would silently rewrite history when recomputing an old round.
 */
export function standingAmountAt(member, kuriNumber) {
  const applicable = (member.amountHistory || [])
    .filter((e) => e.effectiveFromKuriNumber <= kuriNumber)
    .sort((a, b) => a.effectiveFromKuriNumber - b.effectiveFromKuriNumber);

  if (applicable.length === 0) {
    return member.standingAmount ?? DEFAULT_AMOUNT;
  }
  return applicable[applicable.length - 1].amount;
}

function effectiveFromFor(member, kuriNumber) {
  const applicable = (member.amountHistory || [])
    .filter((e) => e.effectiveFromKuriNumber <= kuriNumber)
    .sort((a, b) => a.effectiveFromKuriNumber - b.effectiveFromKuriNumber);
  return applicable.length > 0
    ? applicable[applicable.length - 1].effectiveFromKuriNumber
    : 1;
}

/** Did this member serve as groom in a round strictly before `kuriNumber`? */
export function priorGroomRoundOf(memberId, kuriNumber, allRounds) {
  const prior = allRounds
    .filter(
      (r) =>
        r.groomMemberId === memberId &&
        r.kuriNumber < kuriNumber &&
        r.status !== "upcoming",
    )
    .sort((a, b) => a.kuriNumber - b.kuriNumber);
  return prior.length > 0 ? prior[prior.length - 1] : null;
}

/** Everything `from` actually handed to `to`, across all rounds. */
export function paymentsBetween(payments, fromMemberId, toMemberId) {
  return payments.filter(
    (p) => p.fromMemberId === fromMemberId && p.toMemberId === toMemberId,
  );
}

export function sumAmount(payments) {
  return payments.reduce((total, p) => total + (p.amount || 0), 0);
}

function rupees(n) {
  return `₹${n.toLocaleString("en-IN")}`;
}

/**
 * Resolve what one member owes into one round, and why.
 *
 * The order below is the resolution order from the specification, and the
 * order matters at every step:
 *
 *  1. The groom is exempt from his own round (rule 3).
 *  2. An exited member owes nothing.
 *  3. An opt-out zeroes the due and severs the reciprocal claim (rule 4).
 *  4. A member who joined after this round has no obligation to it (rule 7).
 *  5. If M has already been groom, his due is *exactly* what G gave him
 *     (rule 1 — the master rule). Note this can only ever fire for a past
 *     groom: if M has had no round, no money can have flowed G → M, so there
 *     is nothing to mirror. That is why the check is framed around M's own
 *     past round rather than a bare "has any payment flowed" test — it is what
 *     makes a late joiner correctly collect from fewer members (rule 30).
 *  6. A one-off override for this round wins over any standing amount (rule 15).
 *  7. Otherwise: the member's standing amount as of this round.
 *
 * @returns {{memberId: string, dueAmount: number, basis: DueBasis,
 *            mirroredFromPaymentIds: string[], locked: boolean,
 *            standingChangeSuppressed: boolean, explanation: string}}
 */
export function resolveDue(member, ctx) {
  const { round, groom, allRounds, allPayments, participation, overrides } = ctx;

  const base = {
    memberId: member.id,
    mirroredFromPaymentIds: [],
    locked: false,
    standingChangeSuppressed: false,
  };

  // 1. The groom pays nothing into his own round.
  if (member.id === groom.id) {
    return {
      ...base,
      dueAmount: 0,
      basis: "exempt_groom",
      locked: true,
      explanation: "Groom of this round — pays nothing into it.",
    };
  }

  // 2. An exited member is outside the scheme entirely.
  if (member.status === "exited") {
    return {
      ...base,
      dueAmount: 0,
      basis: "exited",
      locked: true,
      explanation: "Member has exited the scheme.",
    };
  }

  const priorRound = priorGroomRoundOf(member.id, round.kuriNumber, allRounds);
  const received = priorRound
    ? paymentsBetween(allPayments, groom.id, member.id)
    : [];

  // 3. Opt-out — but a repayment can never be skipped (rule 4). If the groom
  //    has already given to this member, the mirrored debt stands regardless.
  const part = participation.get(member.id);
  if (part && part.participating === false) {
    if (received.length === 0) {
      return {
        ...base,
        dueAmount: 0,
        basis: "opted_out",
        locked: true,
        explanation: part.reason
          ? `Opted out of this round — ${part.reason}`
          : "Opted out of this round. Forfeits this groom’s contribution in his own round.",
      };
    }
    // Falls through: a repayment cannot be opted out of.
  }

  // 4. Joined after this round — owes nothing to it.
  if (member.joinedAtKuriNumber > round.kuriNumber) {
    return {
      ...base,
      dueAmount: 0,
      basis: "exited",
      locked: true,
      explanation: `Joined at Kuri ${member.joinedAtKuriNumber} — no obligation to earlier rounds.`,
    };
  }

  // 5. Past groom: repay exactly what this groom gave him. Nothing else.
  if (priorRound) {
    const amount = sumAmount(received);
    return {
      ...base,
      dueAmount: amount,
      basis: "mirrors_earlier_receipt",
      mirroredFromPaymentIds: received.map((p) => p.id),
      locked: true,
      explanation:
        amount > 0
          ? `Repayment — ${groom.name} gave ${rupees(amount)} into Kuri ${priorRound.kuriNumber}.`
          : `${groom.name} contributed nothing to Kuri ${priorRound.kuriNumber}, so nothing is owed back.`,
    };
  }

  // 6. One-off override for this round.
  const override = overrides.get(member.id);
  const standing = standingAmountAt(member, round.kuriNumber);
  if (override) {
    return {
      ...base,
      dueAmount: override.amount,
      basis: "round_override",
      standingChangeSuppressed: override.amount !== standing,
      explanation: `Set for this round only. Standing amount is ${rupees(standing)}.`,
    };
  }

  // 7. The member's standing amount as of this round.
  return {
    ...base,
    dueAmount: standing,
    basis: "standing_amount",
    explanation:
      standing === DEFAULT_AMOUNT
        ? "Standard amount."
        : `Standing amount set from Kuri ${effectiveFromFor(member, round.kuriNumber)} onward.`,
  };
}

/**
 * Build the full due sheet for a round — one row per member who could
 * conceivably owe into it. Members who joined later are excluded outright
 * rather than listed at zero, to keep the admin's review screen honest.
 */
export function generateRoundDues(members, ctx) {
  return members
    .filter((m) => m.joinedAtKuriNumber <= ctx.round.kuriNumber)
    .filter((m) => m.status !== "exited" || m.id === ctx.groom.id)
    .map((m) => resolveDue(m, ctx))
    .sort((a, b) => b.dueAmount - a.dueAmount);
}

/** What the groom can actually expect to collect. */
export function expectedPot(dues) {
  return dues.reduce((total, d) => total + d.dueAmount, 0);
}

// ---------------------------------------------------------------------------
// Pairwise balances — the "who owes whom" view the spreadsheet never had
// ---------------------------------------------------------------------------

/**
 * For every pair through which money has moved: what each gave the other.
 *
 * `net` is only a *debt* once both have had their rounds; until then it is an
 * expectation, which is why `bothSettled` travels with it.
 */
export function pairwiseBalances(members, payments, rounds) {
  const hadRound = new Set(
    rounds.filter((r) => r.status === "completed").map((r) => r.groomMemberId),
  );

  const result = [];
  for (const a of members) {
    for (const b of members) {
      if (a.id === b.id) continue;
      const gave = sumAmount(paymentsBetween(payments, a.id, b.id));
      const received = sumAmount(paymentsBetween(payments, b.id, a.id));
      if (gave === 0 && received === 0) continue;
      result.push({
        memberId: a.id,
        counterpartyId: b.id,
        gave,
        received,
        net: gave - received,
        bothSettled: hadRound.has(a.id) && hadRound.has(b.id),
      });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Settlement — closing out a member's pairwise balances on exit
// ---------------------------------------------------------------------------

/**
 * Compute the itemised settlement list for a member leaving the scheme.
 *
 * A past groom is net-positive and must be brought to zero before he can go:
 * he owes back exactly what each member gave him. A member who has not yet had
 * his round is net-negative and is refunded in full by the grooms who took his
 * money.
 */
export function computeSettlement(exiting, members, payments, rounds) {
  const wasGroom =
    priorGroomRoundOf(exiting.id, Number.MAX_SAFE_INTEGER, rounds) !== null;
  const lines = [];

  for (const other of members) {
    if (other.id === exiting.id || other.status === "exited") continue;

    const gaveToExiting = sumAmount(paymentsBetween(payments, other.id, exiting.id));
    const exitingGave = sumAmount(paymentsBetween(payments, exiting.id, other.id));

    if (wasGroom) {
      // He has collected. Whatever this member handed him comes back, less
      // anything he has already paid into that member's own round.
      const outstanding = gaveToExiting - exitingGave;
      if (outstanding > 0) {
        lines.push({
          counterpartyMemberId: other.id,
          direction: "owed_by_exiting",
          amount: outstanding,
        });
      }
    } else if (exitingGave > 0) {
      // He never collected. Every rupee he paid out is refunded.
      lines.push({
        counterpartyMemberId: other.id,
        direction: "owed_to_exiting",
        amount: exitingGave,
      });
    }
  }

  return lines.sort((a, b) => b.amount - a.amount);
}

/** Exit is gated: every settlement record must be settled first (rule 5). */
export function canExit(settlements) {
  return settlements.every((s) => s.status === "settled");
}
