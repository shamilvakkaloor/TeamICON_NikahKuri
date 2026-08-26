/**
 * The pairwise ledger — the heart of the scheme.
 *
 * The spreadsheet models a round's due as one number (₹7,000 × everyone). The
 * real rules make the amount specific to each *pair* of members, so a round
 * cannot carry a flat due. Everything in this file exists to turn a pair
 * (member M, groom G) plus history into a single number and a reason for it.
 */

import {
  DEFAULT_AMOUNT,
  type DueBasis,
  type KuriRound,
  type Member,
  type Payment,
  type RoundDue,
  type RoundOverride,
  type RoundParticipation,
  type Settlement,
} from './types';

export interface DueContext {
  round: KuriRound;
  groom: Member;
  /** Every round ever, used to work out who had already been groom. */
  allRounds: KuriRound[];
  /** Every payment ever. Filtered internally; callers need not pre-slice. */
  allPayments: Payment[];
  participation: Map<string, RoundParticipation>;
  overrides: Map<string, RoundOverride>;
}

export interface ResolvedDue {
  memberId: string;
  dueAmount: number;
  basis: DueBasis;
  mirroredFromPaymentIds: string[];
  /** Mirrored figures are fixed by history and must not be editable. */
  locked: boolean;
  standingChangeSuppressed: boolean;
  /** Human-readable justification, shown wherever the due appears. */
  explanation: string;
}

/**
 * The member's standing amount as it stood at a given round number.
 *
 * `amountHistory` is append-only, so the effective figure is the latest entry
 * that had come into force by then — not the member's current `standingAmount`,
 * which would silently rewrite history when recomputing an old round.
 */
export function standingAmountAt(member: Member, kuriNumber: number): number {
  const applicable = (member.amountHistory ?? [])
    .filter((e) => e.effectiveFromKuriNumber <= kuriNumber)
    .sort((a, b) => a.effectiveFromKuriNumber - b.effectiveFromKuriNumber);

  if (applicable.length === 0) {
    // No history recorded yet: fall back to the member's standing figure,
    // then to the scheme default.
    return member.standingAmount ?? DEFAULT_AMOUNT;
  }
  return applicable[applicable.length - 1].amount;
}

/** Did this member serve as groom in a round strictly before `kuriNumber`? */
export function priorGroomRoundOf(
  memberId: string,
  kuriNumber: number,
  allRounds: KuriRound[],
): KuriRound | null {
  const prior = allRounds
    .filter(
      (r) =>
        r.groomMemberId === memberId &&
        r.kuriNumber < kuriNumber &&
        r.status !== 'upcoming',
    )
    .sort((a, b) => a.kuriNumber - b.kuriNumber);
  return prior.length > 0 ? prior[prior.length - 1] : null;
}

/** Everything `from` actually handed to `to`, across all rounds. */
export function paymentsBetween(
  payments: Payment[],
  fromMemberId: string,
  toMemberId: string,
): Payment[] {
  return payments.filter(
    (p) => p.fromMemberId === fromMemberId && p.toMemberId === toMemberId,
  );
}

export function sumAmount(payments: Payment[]): number {
  return payments.reduce((total, p) => total + (p.amount || 0), 0);
}

/**
 * Resolve what one member owes into one round, and why.
 *
 * The order below is the resolution order from the specification, and the order
 * matters at every step:
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
 */
export function resolveDue(member: Member, ctx: DueContext): ResolvedDue {
  const { round, groom, allRounds, allPayments, participation, overrides } = ctx;

  const base = {
    memberId: member.id,
    mirroredFromPaymentIds: [] as string[],
    locked: false,
    standingChangeSuppressed: false,
  };

  // 1. The groom pays nothing into his own round.
  if (member.id === groom.id) {
    return {
      ...base,
      dueAmount: 0,
      basis: 'exempt_groom',
      locked: true,
      explanation: 'Groom of this round — pays nothing into it.',
    };
  }

  // 2. An exited member is outside the scheme entirely.
  if (member.status === 'exited') {
    return {
      ...base,
      dueAmount: 0,
      basis: 'exited',
      locked: true,
      explanation: 'Member has exited the scheme.',
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
        basis: 'opted_out',
        locked: true,
        explanation: part.reason
          ? `Opted out of this round — ${part.reason}`
          : 'Opted out of this round. Forfeits this groom’s contribution in his own round.',
      };
    }
    // Falls through: a repayment cannot be opted out of.
  }

  // 4. Joined after this round — owes nothing to it.
  if (member.joinedAtKuriNumber > round.kuriNumber) {
    return {
      ...base,
      dueAmount: 0,
      basis: 'exited',
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
      basis: 'mirrors_earlier_receipt',
      mirroredFromPaymentIds: received.map((p) => p.id),
      locked: true,
      explanation:
        amount > 0
          ? `Repayment — ${groom.name} gave ₹${amount.toLocaleString('en-IN')} into Kuri ${priorRound.kuriNumber}.`
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
      basis: 'round_override',
      standingChangeSuppressed: override.amount !== standing,
      explanation: `Set for this round only. Standing amount is ₹${standing.toLocaleString('en-IN')}.`,
    };
  }

  // 7. The member's standing amount as of this round.
  return {
    ...base,
    dueAmount: standing,
    basis: 'standing_amount',
    explanation:
      standing === DEFAULT_AMOUNT
        ? 'Standard amount.'
        : `Standing amount set from Kuri ${effectiveFromFor(member, round.kuriNumber)} onward.`,
  };
}

function effectiveFromFor(member: Member, kuriNumber: number): number {
  const applicable = (member.amountHistory ?? [])
    .filter((e) => e.effectiveFromKuriNumber <= kuriNumber)
    .sort((a, b) => a.effectiveFromKuriNumber - b.effectiveFromKuriNumber);
  return applicable.length > 0
    ? applicable[applicable.length - 1].effectiveFromKuriNumber
    : 1;
}

/**
 * Build the full due sheet for a round — one row per member who could
 * conceivably owe into it. Members who joined later are excluded outright
 * rather than listed at zero, to keep the admin's review screen honest.
 */
export function generateRoundDues(members: Member[], ctx: DueContext): ResolvedDue[] {
  return members
    .filter((m) => m.joinedAtKuriNumber <= ctx.round.kuriNumber)
    .filter((m) => m.status !== 'exited' || m.id === ctx.groom.id)
    .map((m) => resolveDue(m, ctx))
    .sort((a, b) => b.dueAmount - a.dueAmount);
}

/** What the groom can actually expect to collect. */
export function expectedPot(dues: ResolvedDue[]): number {
  return dues.reduce((total, d) => total + d.dueAmount, 0);
}

/** Merge resolved dues with what has actually come in. */
export function applyPayments(
  dues: ResolvedDue[],
  payments: Payment[],
  kuriId: string,
): RoundDue[] {
  const paidByMember = new Map<string, number>();
  for (const p of payments) {
    if (p.kuriId !== kuriId) continue;
    paidByMember.set(
      p.fromMemberId,
      (paidByMember.get(p.fromMemberId) ?? 0) + p.amount,
    );
  }

  return dues.map((d) => {
    const paidSoFar = paidByMember.get(d.memberId) ?? 0;
    return {
      memberId: d.memberId,
      dueAmount: d.dueAmount,
      basis: d.basis,
      mirroredFromPaymentIds: d.mirroredFromPaymentIds,
      paidSoFar,
      balance: d.dueAmount - paidSoFar,
      standingChangeSuppressed: d.standingChangeSuppressed,
    };
  });
}

// ---------------------------------------------------------------------------
// Pairwise balances — the "who owes whom" view the spreadsheet never had
// ---------------------------------------------------------------------------

export interface PairBalance {
  memberId: string;
  counterpartyId: string;
  /** What the counterparty received from this member, across all rounds. */
  gave: number;
  /** What this member received from the counterparty. */
  received: number;
  /**
   * Positive: the counterparty still owes this member (the member gave more).
   * Negative: this member owes the counterparty.
   *
   * Only meaningful once *both* have had their rounds; until then the balance
   * is an expectation, not a debt.
   */
  net: number;
  bothSettled: boolean;
}

export function pairwiseBalances(
  members: Member[],
  payments: Payment[],
  rounds: KuriRound[],
): PairBalance[] {
  const hadRound = new Set(
    rounds.filter((r) => r.status === 'completed').map((r) => r.groomMemberId),
  );

  const result: PairBalance[] = [];
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

export interface SettlementLine {
  counterpartyMemberId: string;
  direction: 'owed_to_exiting' | 'owed_by_exiting';
  amount: number;
}

/**
 * Compute the itemised settlement list for a member leaving the scheme.
 *
 * A past groom is net-positive and must be brought to zero before he can go:
 * he owes back exactly what each member gave him. A member who has not yet had
 * his round is net-negative and is refunded in full by the grooms who took his
 * money.
 */
export function computeSettlement(
  exiting: Member,
  members: Member[],
  payments: Payment[],
  rounds: KuriRound[],
): SettlementLine[] {
  const wasGroom = priorGroomRoundOf(exiting.id, Number.MAX_SAFE_INTEGER, rounds) !== null;
  const lines: SettlementLine[] = [];

  for (const other of members) {
    if (other.id === exiting.id || other.status === 'exited') continue;

    const gaveToExiting = sumAmount(paymentsBetween(payments, other.id, exiting.id));
    const exitingGave = sumAmount(paymentsBetween(payments, exiting.id, other.id));

    if (wasGroom) {
      // He has collected. Whatever this member handed him comes back, less
      // anything he has already paid into that member's own round.
      const outstanding = gaveToExiting - exitingGave;
      if (outstanding > 0) {
        lines.push({
          counterpartyMemberId: other.id,
          direction: 'owed_by_exiting',
          amount: outstanding,
        });
      }
    } else {
      // He never collected. Every rupee he paid out is refunded.
      if (exitingGave > 0) {
        lines.push({
          counterpartyMemberId: other.id,
          direction: 'owed_to_exiting',
          amount: exitingGave,
        });
      }
    }
  }

  return lines.sort((a, b) => b.amount - a.amount);
}

/** Exit is gated: every settlement record must be settled first (rule 5). */
export function canExit(settlements: Settlement[]): boolean {
  return settlements.every((s) => s.status === 'settled');
}
