import { useEffect, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { setHandover, watchHandovers } from '../lib/db';
import { useRoundLedger } from '../hooks/useRoundLedger';
import { Badge, Card, EmptyState, Money, Notice, TeamDot } from '../components/ui';
import { CheckIcon } from '../components/Icons';
import { date } from '../lib/format';
import { TEAMS, type Handover as HandoverRecord, type Team } from '../domain/types';

/**
 * Each of the four coordinators hands his own team's total directly to the
 * groom — four separate handovers per round, not one pooled payment. The
 * admin sees at a glance which teams have settled and which are still
 * holding cash.
 */
export default function Handover() {
  const { activeRound, memberById } = useData();
  const { member: me, isAdmin } = useAuth();
  const { rows } = useRoundLedger(activeRound);
  const [handovers, setHandovers] = useState<HandoverRecord[]>([]);

  useEffect(() => {
    if (!activeRound) return;
    return watchHandovers(activeRound.id, setHandovers, () => setHandovers([]));
  }, [activeRound?.id]);

  if (!activeRound) return <EmptyState title="No round is open" />;

  const groom = memberById(activeRound.groomMemberId);

  async function markHandedOver(team: Team, amount: number) {
    if (!activeRound || !me) return;
    await setHandover(activeRound.id, team, {
      collectedAmount: amount,
      coordinatorMemberId: me.id,
      handedOverAt: Date.now(),
      status: 'handed_over',
    });
  }

  const teamViews = TEAMS.map((team) => {
    const teamRows = rows.filter((r) => r.team === team);
    const collected = teamRows.reduce((t, r) => t + r.paidSoFar, 0);
    const expected = teamRows.reduce((t, r) => t + r.dueAmount, 0);
    const record = handovers.find((h) => h.team === team);
    return { team, collected, expected, record, outstanding: teamRows.filter((r) => r.balance > 0).length };
  });

  const done = teamViews.filter((t) => t.record?.status === 'handed_over').length;

  return (
    <div className="stack">
      <Notice tone="info">
        Kuri {activeRound.kuriNumber} — {groom?.name}. {done} of {TEAMS.length} teams have handed
        over.
      </Notice>

      {teamViews.map(({ team, collected, expected, record, outstanding }) => {
        const isMyTeam = me?.team === team;
        const canAct = (isMyTeam && me?.role === 'coordinator') || isAdmin;
        const handedOver = record?.status === 'handed_over';

        return (
          <Card key={team}>
            <div className="spread">
              <div>
                <div className="row" style={{ gap: 'var(--s2)' }}>
                  <TeamDot team={team} />
                  <strong>{team}</strong>
                  {handedOver ? (
                    <Badge tone="paid">
                      <CheckIcon size={11} /> handed over
                    </Badge>
                  ) : (
                    <Badge tone="pending">collecting</Badge>
                  )}
                </div>
                <div className="small muted" style={{ marginTop: 'var(--s1)' }}>
                  {handedOver && record?.handedOverAt
                    ? `Given to ${groom?.name} on ${date(record.handedOverAt)}`
                    : outstanding > 0
                      ? `${outstanding} member${outstanding > 1 ? 's' : ''} still to pay`
                      : 'All collected — ready to hand over'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Money amount={handedOver ? (record?.collectedAmount ?? collected) : collected} tone="paid" />
                <div className="xs muted">
                  of <Money amount={expected} size="sm" tone="muted" />
                </div>
              </div>
            </div>

            {canAct && !handedOver && (
              <div style={{ marginTop: 'var(--s3)' }}>
                <button
                  className="btn sm"
                  onClick={() => markHandedOver(team, collected)}
                  disabled={collected === 0}
                >
                  Mark handed to {groom?.name?.split(' ')[0] ?? 'groom'}
                </button>
                {outstanding > 0 && (
                  <span className="xs muted" style={{ marginLeft: 'var(--s3)' }}>
                    You can hand over a partial total — the rest follows later.
                  </span>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
