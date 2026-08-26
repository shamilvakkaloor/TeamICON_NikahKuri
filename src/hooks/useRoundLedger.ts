import { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { fetchOverrides, fetchParticipation } from '../lib/db';
import { generateRoundDues, type ResolvedDue } from '../domain/ledger';
import type { KuriRound, RoundOverride, RoundParticipation } from '../domain/types';

export interface LedgerRow extends ResolvedDue {
  name: string;
  team: string;
  photoUrl: string;
  paidSoFar: number;
  balance: number;
}

/**
 * The live due sheet for a round.
 *
 * Dues are recomputed from source data rather than read back from the
 * `roundDues` collection, so the screen can never drift from the ledger. The
 * stored collection remains the durable record the admin publishes; this is
 * the view of it.
 */
export function useRoundLedger(round: KuriRound | null) {
  const { members, rounds, payments, memberById } = useData();
  const [participation, setParticipation] = useState<RoundParticipation[]>([]);
  const [overrides, setOverrides] = useState<RoundOverride[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!round) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchParticipation(round.id), fetchOverrides(round.id)])
      .then(([p, o]) => {
        if (cancelled) return;
        setParticipation(p);
        setOverrides(o);
      })
      .catch(() => {
        // Missing subcollections are the normal case for a fresh round.
        if (!cancelled) {
          setParticipation([]);
          setOverrides([]);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [round?.id]);

  return useMemo(() => {
    if (!round) return { rows: [] as LedgerRow[], expected: 0, collected: 0, loading };

    const groom = memberById(round.groomMemberId);
    if (!groom) return { rows: [] as LedgerRow[], expected: 0, collected: 0, loading };

    const dues = generateRoundDues(members, {
      round,
      groom,
      allRounds: rounds,
      allPayments: payments,
      participation: new Map(participation.map((p) => [p.memberId, p])),
      overrides: new Map(overrides.map((o) => [o.memberId, o])),
    });

    const paidByMember = new Map<string, number>();
    for (const p of payments) {
      if (p.kuriId !== round.id) continue;
      paidByMember.set(p.fromMemberId, (paidByMember.get(p.fromMemberId) ?? 0) + p.amount);
    }

    const rows: LedgerRow[] = dues.map((d) => {
      const m = memberById(d.memberId);
      const paidSoFar = paidByMember.get(d.memberId) ?? 0;
      return {
        ...d,
        name: m?.name ?? 'Unknown',
        team: m?.team ?? '',
        photoUrl: m?.photoUrl ?? '',
        paidSoFar,
        balance: d.dueAmount - paidSoFar,
      };
    });

    return {
      rows,
      expected: rows.reduce((t, r) => t + r.dueAmount, 0),
      collected: rows.reduce((t, r) => t + r.paidSoFar, 0),
      loading,
    };
  }, [round, members, rounds, payments, participation, overrides, loading, memberById]);
}
