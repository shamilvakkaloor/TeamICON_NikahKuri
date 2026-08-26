import { describe, expect, it } from 'vitest';
import {
  computeSettlement,
  expectedPot,
  generateRoundDues,
  resolveDue,
  standingAmountAt,
  type DueContext,
} from './ledger';
import {
  DEFAULT_AMOUNT,
  type KuriRound,
  type Member,
  type Payment,
  type RoundOverride,
  type RoundParticipation,
} from './types';

// --- fixtures --------------------------------------------------------------

function member(id: string, over: Partial<Member> = {}): Member {
  return {
    id,
    name: id.toUpperCase(),
    team: 'KOZHIKODE',
    email: `${id}@example.com`,
    joinedAtKuriNumber: 1,
    photoUrl: '',
    role: 'member',
    status: 'active',
    hasBeenGroom: false,
    standingAmount: DEFAULT_AMOUNT,
    amountHistory: [],
    ...over,
  };
}

function round(kuriNumber: number, groomMemberId: string, over: Partial<KuriRound> = {}): KuriRound {
  return {
    id: `k${kuriNumber}`,
    kuriNumber,
    groomMemberId,
    nikahDate: 0,
    kuriLastDate: 0,
    status: 'completed',
    ...over,
  };
}

function payment(from: string, to: string, kuriId: string, amount: number, id = `${from}->${to}:${kuriId}`): Payment {
  return {
    id,
    fromMemberId: from,
    toMemberId: to,
    kuriId,
    team: 'KOZHIKODE',
    amount,
    date: 0,
    recordedByMemberId: 'admin',
    edited: false,
  };
}

function ctx(over: Partial<DueContext> & Pick<DueContext, 'round' | 'groom'>): DueContext {
  return {
    allRounds: [over.round],
    allPayments: [],
    participation: new Map<string, RoundParticipation>(),
    overrides: new Map<string, RoundOverride>(),
    ...over,
  };
}

// --- rule 3: the groom is exempt from his own round ------------------------

describe('rule 3 — groom exemption', () => {
  it('the groom owes nothing into his own round', () => {
    const g = member('g');
    const r = round(1, 'g', { status: 'active' });
    const due = resolveDue(g, ctx({ round: r, groom: g }));
    expect(due.dueAmount).toBe(0);
    expect(due.basis).toBe('exempt_groom');
  });
});

// --- rule 1/2: repayment mirrors receipt exactly ---------------------------

describe('rule 1 — repayment mirrors receipt exactly', () => {
  it('a past groom repays the exact figure he received, not the default', () => {
    // A was groom at Kuri 1 and received ₹10,000 from B.
    // B is groom at Kuri 2, so A owes B exactly ₹10,000.
    const a = member('a', { hasBeenGroom: true });
    const b = member('b');
    const rounds = [round(1, 'a'), round(2, 'b', { status: 'active' })];
    const payments = [payment('b', 'a', 'k1', 10000)];

    const due = resolveDue(
      a,
      ctx({ round: rounds[1], groom: b, allRounds: rounds, allPayments: payments }),
    );

    expect(due.dueAmount).toBe(10000);
    expect(due.basis).toBe('mirrors_earlier_receipt');
    expect(due.locked).toBe(true);
    expect(due.mirroredFromPaymentIds).toHaveLength(1);
  });

  it('mirrors a reduced figure just as faithfully (rule 9 shortfall)', () => {
    // B could only manage ₹5,000 into A's round, so A owes back ₹5,000.
    const a = member('a', { hasBeenGroom: true });
    const b = member('b');
    const rounds = [round(1, 'a'), round(2, 'b', { status: 'active' })];
    const payments = [payment('b', 'a', 'k1', 5000)];

    const due = resolveDue(
      a,
      ctx({ round: rounds[1], groom: b, allRounds: rounds, allPayments: payments }),
    );
    expect(due.dueAmount).toBe(5000);
  });

  it('sums installments — a pair settles on the total actually paid', () => {
    const a = member('a', { hasBeenGroom: true });
    const b = member('b');
    const rounds = [round(1, 'a'), round(2, 'b', { status: 'active' })];
    const payments = [
      payment('b', 'a', 'k1', 4000, 'p1'),
      payment('b', 'a', 'k1', 3000, 'p2'),
    ];

    const due = resolveDue(
      a,
      ctx({ round: rounds[1], groom: b, allRounds: rounds, allPayments: payments }),
    );
    expect(due.dueAmount).toBe(7000);
    expect(due.mirroredFromPaymentIds).toEqual(['p1', 'p2']);
  });

  it('a past groom cannot shrink his debt by lowering his standing amount', () => {
    // A received ₹7,000 from B, then dropped his standing amount to ₹3,500.
    // The mirrored debt is untouched — this falls out of the model.
    const a = member('a', {
      hasBeenGroom: true,
      standingAmount: 3500,
      amountHistory: [{ amount: 3500, effectiveFromKuriNumber: 2, setBy: 'admin', setAt: 0 }],
    });
    const b = member('b');
    const rounds = [round(1, 'a'), round(2, 'b', { status: 'active' })];
    const payments = [payment('b', 'a', 'k1', 7000)];

    const due = resolveDue(
      a,
      ctx({ round: rounds[1], groom: b, allRounds: rounds, allPayments: payments }),
    );
    expect(due.dueAmount).toBe(7000);
  });
});

// --- rule 30: a late joiner collects from fewer members --------------------

describe('rule 30 — late joiner collects from fewer members', () => {
  it('past grooms owe nothing to a groom who joined after their round', () => {
    // A was groom at Kuri 1. J joined at Kuri 10 and never paid into it.
    // When J becomes groom at Kuri 11, A owes him nothing.
    const a = member('a', { hasBeenGroom: true });
    const j = member('j', { joinedAtKuriNumber: 10 });
    const rounds = [round(1, 'a'), round(11, 'j', { status: 'active' })];

    const due = resolveDue(
      a,
      ctx({ round: rounds[1], groom: j, allRounds: rounds, allPayments: [] }),
    );
    expect(due.dueAmount).toBe(0);
    expect(due.basis).toBe('mirrors_earlier_receipt');
  });

  it('members who have not yet had a round still pay the joiner normally', () => {
    const c = member('c'); // never been groom
    const j = member('j', { joinedAtKuriNumber: 10 });
    const rounds = [round(11, 'j', { status: 'active' })];

    const due = resolveDue(c, ctx({ round: rounds[0], groom: j, allRounds: rounds }));
    expect(due.dueAmount).toBe(DEFAULT_AMOUNT);
    expect(due.basis).toBe('standing_amount');
  });

  it('a joiner owes nothing to rounds that predate his entry', () => {
    const j = member('j', { joinedAtKuriNumber: 10 });
    const g = member('g');
    const r = round(5, 'g', { status: 'active' });

    const dues = generateRoundDues([j, g], ctx({ round: r, groom: g, allRounds: [r] }));
    // Excluded outright rather than listed at zero.
    expect(dues.find((d) => d.memberId === 'j')).toBeUndefined();
  });
});

// --- rule 15: a one-off override wins over a standing change ---------------

describe('rule 15 — override precedence', () => {
  it('a one-off override beats a later standing amount', () => {
    const m = member('m', {
      standingAmount: 5000,
      amountHistory: [{ amount: 5000, effectiveFromKuriNumber: 3, setBy: 'admin', setAt: 0 }],
    });
    const g = member('g');
    const r = round(3, 'g', { status: 'active' });
    const overrides = new Map<string, RoundOverride>([
      ['m', { memberId: 'm', amount: 2000, setBy: 'admin', setAt: 0 }],
    ]);

    const due = resolveDue(m, ctx({ round: r, groom: g, allRounds: [r], overrides }));
    expect(due.dueAmount).toBe(2000);
    expect(due.basis).toBe('round_override');
    // Flagged so the admin can see the standing change did not take effect.
    expect(due.standingChangeSuppressed).toBe(true);
  });

  it('an override does not carry forward to the next round', () => {
    const m = member('m');
    const g2 = member('g2');
    const r2 = round(4, 'g2', { status: 'active' });

    const due = resolveDue(m, ctx({ round: r2, groom: g2, allRounds: [r2] }));
    expect(due.dueAmount).toBe(DEFAULT_AMOUNT);
    expect(due.basis).toBe('standing_amount');
  });
});

// --- rule 4: opt-out, and the repayment that cannot be skipped -------------

describe('rule 4 — opt-out', () => {
  it('zeroes the due when no repayment is owed', () => {
    const m = member('m');
    const g = member('g');
    const r = round(2, 'g', { status: 'active' });
    const participation = new Map<string, RoundParticipation>([
      ['m', { memberId: 'm', participating: false, reason: 'Hospital expenses' }],
    ]);

    const due = resolveDue(m, ctx({ round: r, groom: g, allRounds: [r], participation }));
    expect(due.dueAmount).toBe(0);
    expect(due.basis).toBe('opted_out');
  });

  it('cannot be used to skip a repayment', () => {
    // M already took G's money in M's own round — that debt stands.
    const m = member('m', { hasBeenGroom: true });
    const g = member('g');
    const rounds = [round(1, 'm'), round(2, 'g', { status: 'active' })];
    const payments = [payment('g', 'm', 'k1', 7000)];
    const participation = new Map<string, RoundParticipation>([
      ['m', { memberId: 'm', participating: false, reason: 'Tight month' }],
    ]);

    const due = resolveDue(
      m,
      ctx({ round: rounds[1], groom: g, allRounds: rounds, allPayments: payments, participation }),
    );
    expect(due.dueAmount).toBe(7000);
    expect(due.basis).toBe('mirrors_earlier_receipt');
  });
});

// --- standing amount history ----------------------------------------------

describe('standingAmountAt', () => {
  it('uses the figure in force at that round, not the current one', () => {
    const m = member('m', {
      standingAmount: 3000,
      amountHistory: [
        { amount: 7000, effectiveFromKuriNumber: 1, setBy: 'admin', setAt: 0 },
        { amount: 3000, effectiveFromKuriNumber: 8, setBy: 'admin', setAt: 0 },
      ],
    });
    expect(standingAmountAt(m, 5)).toBe(7000);
    expect(standingAmountAt(m, 8)).toBe(3000);
    expect(standingAmountAt(m, 12)).toBe(3000);
  });

  it('defaults to ₹7,000 with no history', () => {
    expect(standingAmountAt(member('m'), 1)).toBe(DEFAULT_AMOUNT);
  });
});

// --- the pot ---------------------------------------------------------------

describe('expectedPot', () => {
  it('excludes the groom and sums everyone else', () => {
    const members = [member('a'), member('b'), member('c'), member('g')];
    const r = round(1, 'g', { status: 'active' });
    const dues = generateRoundDues(members, ctx({ round: r, groom: members[3], allRounds: [r] }));
    expect(expectedPot(dues)).toBe(3 * DEFAULT_AMOUNT);
  });
});

// --- rules 5 & 6: settlement ----------------------------------------------

describe('settlement', () => {
  it('a past groom owes back what each member gave him, net of his own payments', () => {
    // A collected ₹7,000 from B and ₹7,000 from C at Kuri 1.
    // He has since paid ₹7,000 into B's round at Kuri 2. Only C is outstanding.
    const a = member('a', { hasBeenGroom: true });
    const b = member('b');
    const c = member('c');
    const rounds = [round(1, 'a'), round(2, 'b')];
    const payments = [
      payment('b', 'a', 'k1', 7000, 'p1'),
      payment('c', 'a', 'k1', 7000, 'p2'),
      payment('a', 'b', 'k2', 7000, 'p3'),
    ];

    const lines = computeSettlement(a, [a, b, c], payments, rounds);
    expect(lines).toEqual([
      { counterpartyMemberId: 'c', direction: 'owed_by_exiting', amount: 7000 },
    ]);
  });

  it('a member who never had his round is refunded in full', () => {
    const x = member('x');
    const a = member('a', { hasBeenGroom: true });
    const rounds = [round(1, 'a')];
    const payments = [payment('x', 'a', 'k1', 7000)];

    const lines = computeSettlement(x, [x, a], payments, rounds);
    expect(lines).toEqual([
      { counterpartyMemberId: 'a', direction: 'owed_to_exiting', amount: 7000 },
    ]);
  });
});
