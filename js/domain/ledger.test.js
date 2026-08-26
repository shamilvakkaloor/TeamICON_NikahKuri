/**
 * Rules tests for the pairwise ledger.
 *
 * No test framework and nothing to install — this uses Node's built-in runner.
 * If you have Node on your machine:
 *
 *     node --test js/domain/ledger.test.js
 *
 * If you don't, you never need to run this. The app itself needs no Node at
 * all; these exist so the rules that cause arguments in a real group stay
 * pinned down when the code changes.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_AMOUNT,
  computeSettlement,
  expectedPot,
  generateRoundDues,
  resolveDue,
  standingAmountAt,
} from "./ledger.js";

// --- fixtures --------------------------------------------------------------

function member(id, over = {}) {
  return {
    id,
    name: id.toUpperCase(),
    team: "KOZHIKODE",
    email: `${id}@example.com`,
    joinedAtKuriNumber: 1,
    photoUrl: "",
    role: "member",
    status: "active",
    hasBeenGroom: false,
    standingAmount: DEFAULT_AMOUNT,
    amountHistory: [],
    ...over,
  };
}

function round(kuriNumber, groomMemberId, over = {}) {
  return {
    id: `k${kuriNumber}`,
    kuriNumber,
    groomMemberId,
    nikahDate: 0,
    kuriLastDate: 0,
    status: "completed",
    ...over,
  };
}

function payment(from, to, kuriId, amount, id = `${from}->${to}:${kuriId}`) {
  return {
    id,
    fromMemberId: from,
    toMemberId: to,
    kuriId,
    team: "KOZHIKODE",
    amount,
    date: 0,
    recordedByMemberId: "admin",
    edited: false,
  };
}

function ctx(over) {
  return {
    allRounds: [over.round],
    allPayments: [],
    participation: new Map(),
    overrides: new Map(),
    ...over,
  };
}

// --- rule 3: the groom is exempt from his own round ------------------------

describe("rule 3 — groom exemption", () => {
  test("the groom owes nothing into his own round", () => {
    const g = member("g");
    const r = round(1, "g", { status: "active" });
    const due = resolveDue(g, ctx({ round: r, groom: g }));
    assert.equal(due.dueAmount, 0);
    assert.equal(due.basis, "exempt_groom");
  });
});

// --- rule 1/2: repayment mirrors receipt exactly ---------------------------

describe("rule 1 — repayment mirrors receipt exactly", () => {
  test("a past groom repays the exact figure he received, not the default", () => {
    // A was groom at Kuri 1 and received ₹10,000 from B.
    // B is groom at Kuri 2, so A owes B exactly ₹10,000.
    const a = member("a", { hasBeenGroom: true });
    const b = member("b");
    const rounds = [round(1, "a"), round(2, "b", { status: "active" })];
    const payments = [payment("b", "a", "k1", 10000)];

    const due = resolveDue(
      a,
      ctx({ round: rounds[1], groom: b, allRounds: rounds, allPayments: payments }),
    );

    assert.equal(due.dueAmount, 10000);
    assert.equal(due.basis, "mirrors_earlier_receipt");
    assert.equal(due.locked, true);
    assert.equal(due.mirroredFromPaymentIds.length, 1);
  });

  test("mirrors a reduced figure just as faithfully (rule 9 shortfall)", () => {
    // B could only manage ₹5,000 into A's round, so A owes back ₹5,000.
    const a = member("a", { hasBeenGroom: true });
    const b = member("b");
    const rounds = [round(1, "a"), round(2, "b", { status: "active" })];
    const payments = [payment("b", "a", "k1", 5000)];

    const due = resolveDue(
      a,
      ctx({ round: rounds[1], groom: b, allRounds: rounds, allPayments: payments }),
    );
    assert.equal(due.dueAmount, 5000);
  });

  test("sums installments — a pair settles on the total actually paid", () => {
    const a = member("a", { hasBeenGroom: true });
    const b = member("b");
    const rounds = [round(1, "a"), round(2, "b", { status: "active" })];
    const payments = [
      payment("b", "a", "k1", 4000, "p1"),
      payment("b", "a", "k1", 3000, "p2"),
    ];

    const due = resolveDue(
      a,
      ctx({ round: rounds[1], groom: b, allRounds: rounds, allPayments: payments }),
    );
    assert.equal(due.dueAmount, 7000);
    assert.deepEqual(due.mirroredFromPaymentIds, ["p1", "p2"]);
  });

  test("a past groom cannot shrink his debt by lowering his standing amount", () => {
    // A received ₹7,000 from B, then dropped his standing amount to ₹3,500.
    // The mirrored debt is untouched — this falls out of the model.
    const a = member("a", {
      hasBeenGroom: true,
      standingAmount: 3500,
      amountHistory: [
        { amount: 3500, effectiveFromKuriNumber: 2, setBy: "admin", setAt: 0 },
      ],
    });
    const b = member("b");
    const rounds = [round(1, "a"), round(2, "b", { status: "active" })];
    const payments = [payment("b", "a", "k1", 7000)];

    const due = resolveDue(
      a,
      ctx({ round: rounds[1], groom: b, allRounds: rounds, allPayments: payments }),
    );
    assert.equal(due.dueAmount, 7000);
  });
});

// --- rule 30: a late joiner collects from fewer members --------------------

describe("rule 30 — late joiner collects from fewer members", () => {
  test("past grooms owe nothing to a groom who joined after their round", () => {
    // A was groom at Kuri 1. J joined at Kuri 10 and never paid into it.
    // When J becomes groom at Kuri 11, A owes him nothing.
    const a = member("a", { hasBeenGroom: true });
    const j = member("j", { joinedAtKuriNumber: 10 });
    const rounds = [round(1, "a"), round(11, "j", { status: "active" })];

    const due = resolveDue(
      a,
      ctx({ round: rounds[1], groom: j, allRounds: rounds, allPayments: [] }),
    );
    assert.equal(due.dueAmount, 0);
    assert.equal(due.basis, "mirrors_earlier_receipt");
  });

  test("members who have not yet had a round still pay the joiner normally", () => {
    const c = member("c"); // never been groom
    const j = member("j", { joinedAtKuriNumber: 10 });
    const rounds = [round(11, "j", { status: "active" })];

    const due = resolveDue(c, ctx({ round: rounds[0], groom: j, allRounds: rounds }));
    assert.equal(due.dueAmount, DEFAULT_AMOUNT);
    assert.equal(due.basis, "standing_amount");
  });

  test("a joiner owes nothing to rounds that predate his entry", () => {
    const j = member("j", { joinedAtKuriNumber: 10 });
    const g = member("g");
    const r = round(5, "g", { status: "active" });

    const dues = generateRoundDues([j, g], ctx({ round: r, groom: g, allRounds: [r] }));
    // Excluded outright rather than listed at zero.
    assert.equal(
      dues.find((d) => d.memberId === "j"),
      undefined,
    );
  });
});

// --- rule 15: a one-off override wins over a standing change ---------------

describe("rule 15 — override precedence", () => {
  test("a one-off override beats a later standing amount", () => {
    const m = member("m", {
      standingAmount: 5000,
      amountHistory: [
        { amount: 5000, effectiveFromKuriNumber: 3, setBy: "admin", setAt: 0 },
      ],
    });
    const g = member("g");
    const r = round(3, "g", { status: "active" });
    const overrides = new Map([
      ["m", { memberId: "m", amount: 2000, setBy: "admin", setAt: 0 }],
    ]);

    const due = resolveDue(m, ctx({ round: r, groom: g, allRounds: [r], overrides }));
    assert.equal(due.dueAmount, 2000);
    assert.equal(due.basis, "round_override");
    // Flagged so the admin can see the standing change did not take effect.
    assert.equal(due.standingChangeSuppressed, true);
  });

  test("an override does not carry forward to the next round", () => {
    const m = member("m");
    const g2 = member("g2");
    const r2 = round(4, "g2", { status: "active" });

    const due = resolveDue(m, ctx({ round: r2, groom: g2, allRounds: [r2] }));
    assert.equal(due.dueAmount, DEFAULT_AMOUNT);
    assert.equal(due.basis, "standing_amount");
  });
});

// --- rule 4: opt-out, and the repayment that cannot be skipped -------------

describe("rule 4 — opt-out", () => {
  test("zeroes the due when no repayment is owed", () => {
    const m = member("m");
    const g = member("g");
    const r = round(2, "g", { status: "active" });
    const participation = new Map([
      ["m", { memberId: "m", participating: false, reason: "Hospital expenses" }],
    ]);

    const due = resolveDue(m, ctx({ round: r, groom: g, allRounds: [r], participation }));
    assert.equal(due.dueAmount, 0);
    assert.equal(due.basis, "opted_out");
  });

  test("cannot be used to skip a repayment", () => {
    // M already took G's money in M's own round — that debt stands.
    const m = member("m", { hasBeenGroom: true });
    const g = member("g");
    const rounds = [round(1, "m"), round(2, "g", { status: "active" })];
    const payments = [payment("g", "m", "k1", 7000)];
    const participation = new Map([
      ["m", { memberId: "m", participating: false, reason: "Tight month" }],
    ]);

    const due = resolveDue(
      m,
      ctx({
        round: rounds[1],
        groom: g,
        allRounds: rounds,
        allPayments: payments,
        participation,
      }),
    );
    assert.equal(due.dueAmount, 7000);
    assert.equal(due.basis, "mirrors_earlier_receipt");
  });
});

// --- standing amount history ----------------------------------------------

describe("standingAmountAt", () => {
  test("uses the figure in force at that round, not the current one", () => {
    const m = member("m", {
      standingAmount: 3000,
      amountHistory: [
        { amount: 7000, effectiveFromKuriNumber: 1, setBy: "admin", setAt: 0 },
        { amount: 3000, effectiveFromKuriNumber: 8, setBy: "admin", setAt: 0 },
      ],
    });
    assert.equal(standingAmountAt(m, 5), 7000);
    assert.equal(standingAmountAt(m, 8), 3000);
    assert.equal(standingAmountAt(m, 12), 3000);
  });

  test("defaults to ₹7,000 with no history", () => {
    assert.equal(standingAmountAt(member("m"), 1), DEFAULT_AMOUNT);
  });
});

// --- the pot ---------------------------------------------------------------

describe("expectedPot", () => {
  test("excludes the groom and sums everyone else", () => {
    const members = [member("a"), member("b"), member("c"), member("g")];
    const r = round(1, "g", { status: "active" });
    const dues = generateRoundDues(
      members,
      ctx({ round: r, groom: members[3], allRounds: [r] }),
    );
    assert.equal(expectedPot(dues), 3 * DEFAULT_AMOUNT);
  });
});

// --- rules 5 & 6: settlement ----------------------------------------------

describe("settlement", () => {
  test("a past groom owes back what each member gave him, net of his own payments", () => {
    // A collected ₹7,000 from B and ₹7,000 from C at Kuri 1.
    // He has since paid ₹7,000 into B's round at Kuri 2. Only C is outstanding.
    const a = member("a", { hasBeenGroom: true });
    const b = member("b");
    const c = member("c");
    const rounds = [round(1, "a"), round(2, "b")];
    const payments = [
      payment("b", "a", "k1", 7000, "p1"),
      payment("c", "a", "k1", 7000, "p2"),
      payment("a", "b", "k2", 7000, "p3"),
    ];

    const lines = computeSettlement(a, [a, b, c], payments, rounds);
    assert.deepEqual(lines, [
      { counterpartyMemberId: "c", direction: "owed_by_exiting", amount: 7000 },
    ]);
  });

  test("a member who never had his round is refunded in full", () => {
    const x = member("x");
    const a = member("a", { hasBeenGroom: true });
    const rounds = [round(1, "a")];
    const payments = [payment("x", "a", "k1", 7000)];

    const lines = computeSettlement(x, [x, a], payments, rounds);
    assert.deepEqual(lines, [
      { counterpartyMemberId: "a", direction: "owed_to_exiting", amount: 7000 },
    ]);
  });
});
