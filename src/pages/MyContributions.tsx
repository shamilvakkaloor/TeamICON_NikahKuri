import { useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { generateRoundDues, priorGroomRoundOf } from '../domain/ledger';
import { Badge, Card, EmptyState, Money, Stat } from '../components/ui';
import { LockIcon } from '../components/Icons';
import { date } from '../lib/format';

/**
 * The member's own view: what he has paid, what he is owed, and — crucially —
 * *why* each figure is what it is. The basis is shown on every row because
 * "why do I owe ₹7,000 and he owes ₹3,500?" is the question that starts
 * arguments in a real group.
 */
export default function MyContributions() {
  const { rounds, payments, members, memberById } = useData();
  const { member } = useAuth();

  const view = useMemo(() => {
    if (!member) return null;

    const paidOut = payments.filter((p) => p.fromMemberId === member.id);
    const received = payments.filter((p) => p.toMemberId === member.id);

    const perRound = [...rounds]
      .filter((r) => r.status !== 'upcoming' && r.groomMemberId !== member.id)
      .sort((a, b) => b.kuriNumber - a.kuriNumber)
      .map((round) => {
        const groom = memberById(round.groomMemberId);
        if (!groom) return null;
        const dues = generateRoundDues(members, {
          round,
          groom,
          allRounds: rounds,
          allPayments: payments,
          participation: new Map(),
          overrides: new Map(),
        });
        const mine = dues.find((d) => d.memberId === member.id);
        if (!mine) return null;
        const paid = paidOut
          .filter((p) => p.kuriId === round.id)
          .reduce((t, p) => t + p.amount, 0);
        return { round, groom, due: mine, paid };
      })
      .filter(Boolean) as {
      round: (typeof rounds)[number];
      groom: NonNullable<ReturnType<typeof memberById>>;
      due: ReturnType<typeof generateRoundDues>[number];
      paid: number;
    }[];

    return {
      totalPaid: paidOut.reduce((t, p) => t + p.amount, 0),
      totalReceived: received.reduce((t, p) => t + p.amount, 0),
      outstanding: perRound.reduce((t, r) => t + Math.max(0, r.due.dueAmount - r.paid), 0),
      perRound,
      hadRound: priorGroomRoundOf(member.id, Number.MAX_SAFE_INTEGER, rounds) !== null,
    };
  }, [member, rounds, payments, members, memberById]);

  if (!member || !view) return <EmptyState title="Not signed in" />;

  return (
    <div className="stack">
      <div className="grid">
        <Stat label="Paid in, lifetime" amount={view.totalPaid} tone="paid" />
        <Stat label="Received" amount={view.totalReceived} tone="muted" />
        <Stat
          label="Outstanding now"
          amount={view.outstanding}
          tone={view.outstanding > 0 ? 'owed' : 'paid'}
          note={view.outstanding === 0 ? 'Nothing due.' : undefined}
        />
      </div>

      {!view.hadRound && (
        <Card>
          <div className="spread">
            <span className="small">
              You haven’t had your round yet. When it comes, everyone who received from you repays
              exactly what you gave.
            </span>
            <Money amount={view.totalPaid} tone="paid" />
          </div>
        </Card>
      )}

      <Card title="Round by round" padded={false}>
        {view.perRound.length === 0 ? (
          <div className="card-body">
            <EmptyState title="No rounds yet" />
          </div>
        ) : (
          <div className="ledger">
            {view.perRound.map(({ round, groom, due, paid }) => {
              const balance = due.dueAmount - paid;
              return (
                <div key={round.id} className={`ledger-row${due.dueAmount === 0 ? ' dim' : ''}`}>
                  <span className="avatar">{round.kuriNumber}</span>
                  <div className="ledger-main">
                    <div className="ledger-title">{groom.name}</div>
                    <div className="ledger-meta">
                      {date(round.nikahDate)} · {due.explanation}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Money
                      amount={balance > 0 ? balance : due.dueAmount}
                      tone={balance > 0 ? 'owed' : due.dueAmount === 0 ? 'muted' : 'paid'}
                    />
                    <div style={{ marginTop: 2 }}>
                      {balance > 0 ? (
                        <Badge tone="owed">due</Badge>
                      ) : due.dueAmount === 0 ? (
                        <Badge>n/a</Badge>
                      ) : (
                        <Badge tone="paid">paid</Badge>
                      )}
                      {due.locked && (
                        <>
                          {' '}
                          <Badge tone="info">
                            <LockIcon size={11} /> fixed
                          </Badge>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
