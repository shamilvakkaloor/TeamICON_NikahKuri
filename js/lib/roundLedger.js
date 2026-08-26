/**
 * The live due sheet for a round.
 *
 * Dues are recomputed from source data rather than read back from the
 * `roundDues` collection, so the screen can never drift from the ledger. The
 * stored collection remains the durable record the admin publishes; this is
 * the view of it.
 */

import { generateRoundDues } from "../domain/ledger.js";
import { data, memberById } from "./data.js";
import { fetchOverrides, fetchParticipation } from "./crud.js";

/** Opt-outs and one-off overrides live outside the three live listeners. */
export async function loadRoundContext(kuriId) {
  const [participation, overrides] = await Promise.all([
    fetchParticipation(kuriId).catch(() => []),
    fetchOverrides(kuriId).catch(() => []),
  ]);
  return {
    participation: new Map(participation.map((p) => [p.memberId, p])),
    overrides: new Map(overrides.map((o) => [o.memberId, o])),
  };
}

/**
 * @param round the round to compute
 * @param extra the result of loadRoundContext, or empty maps
 * @returns {{rows: object[], expected: number, collected: number}}
 */
export function buildRoundLedger(round, extra = {}) {
  const { members, rounds, payments } = data();
  const groom = round ? memberById(round.groomMemberId) : null;

  if (!round || !groom) return { rows: [], expected: 0, collected: 0, groom: null };

  const dues = generateRoundDues(members, {
    round,
    groom,
    allRounds: rounds,
    allPayments: payments,
    participation: extra.participation || new Map(),
    overrides: extra.overrides || new Map(),
  });

  const paidByMember = new Map();
  for (const p of payments) {
    if (p.kuriId !== round.id) continue;
    paidByMember.set(p.fromMemberId, (paidByMember.get(p.fromMemberId) || 0) + p.amount);
  }

  const rows = dues.map((due) => {
    const m = memberById(due.memberId);
    const paidSoFar = paidByMember.get(due.memberId) || 0;
    return {
      ...due,
      name: m?.name || "Unknown",
      team: m?.team || "",
      photoUrl: m?.photoUrl || "",
      paidSoFar,
      balance: due.dueAmount - paidSoFar,
    };
  });

  return {
    rows,
    groom,
    expected: rows.reduce((t, r) => t + r.dueAmount, 0),
    collected: rows.reduce((t, r) => t + r.paidSoFar, 0),
  };
}

/** Per-team collection totals, used by the dashboard and the handover screen. */
export function teamTotals(rows, teams) {
  return teams.map((team) => {
    const teamRows = rows.filter((r) => r.team === team);
    return {
      team,
      expected: teamRows.reduce((t, r) => t + r.dueAmount, 0),
      collected: teamRows.reduce((t, r) => t + r.paidSoFar, 0),
      outstanding: teamRows.filter((r) => r.balance > 0).length,
    };
  });
}
