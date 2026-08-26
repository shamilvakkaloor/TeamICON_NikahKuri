import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useRoundLedger } from '../hooks/useRoundLedger';
import { Avatar, Badge, Card, EmptyState, Money, Notice, Progress, Skeleton, TeamDot } from '../components/ui';
import { countdown, date } from '../lib/format';
import { TEAMS, type Team } from '../domain/types';

export default function Dashboard() {
  const { activeRound, rounds, memberById, loading, members } = useData();
  const { member, isAdmin } = useAuth();
  const { rows, expected, collected } = useRoundLedger(activeRound);

  if (loading) return <Skeleton rows={5} />;

  if (!activeRound) {
    const completed = rounds.filter((r) => r.status === 'completed').length;
    return (
      <div className="stack">
        <EmptyState
          title="No round is open"
          body={
            completed > 0
              ? `${completed} of ${members.length} members have had their round. The admin opens the next one when a date is fixed.`
              : 'The admin opens the first round by assigning a groom and setting the dates.'
          }
          action={
            isAdmin ? (
              <Link to="/rounds" className="btn">
                Open a round
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }

  const groom = memberById(activeRound.groomMemberId);
  const clock = countdown(activeRound.kuriLastDate);
  const myRow = rows.find((r) => r.memberId === member?.id);

  const byTeam = TEAMS.map((team) => {
    const teamRows = rows.filter((r) => r.team === team);
    return {
      team,
      expected: teamRows.reduce((t, r) => t + r.dueAmount, 0),
      collected: teamRows.reduce((t, r) => t + r.paidSoFar, 0),
      outstanding: teamRows.filter((r) => r.balance > 0).length,
    };
  });

  return (
    <div className="stack">
      {/* --- the groom of the round --- */}
      <Card padded={false}>
        <div className="card-body" style={{ display: 'flex', gap: 'var(--s4)', alignItems: 'center' }}>
          <Avatar name={groom?.name ?? '?'} photoUrl={groom?.photoUrl} large />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-label">Kuri {activeRound.kuriNumber} · Current groom</div>
            <h2 style={{ fontSize: 'var(--text-xl)' }}>{groom?.name ?? 'Unassigned'}</h2>
            <div className="row wrap" style={{ marginTop: 'var(--s2)' }}>
              {groom && (
                <span className="badge">
                  <TeamDot team={groom.team} /> {groom.team}
                </span>
              )}
              <Badge tone={clock.tone === 'past' ? 'owed' : clock.tone === 'warn' ? 'pending' : 'paid'}>
                {clock.label}
              </Badge>
            </div>
          </div>
        </div>

        <div className="card-body" style={{ borderTop: '1px solid var(--hairline)' }}>
          <div className="spread" style={{ marginBottom: 'var(--s3)' }}>
            <div>
              <div className="stat-label">Collected</div>
              <Money amount={collected} size="hero" tone="paid" />
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="stat-label">Expected pot</div>
              <Money amount={expected} size="lg" tone="muted" />
            </div>
          </div>
          <Progress value={collected} total={expected} />
          <div className="spread small muted" style={{ marginTop: 'var(--s2)' }}>
            <span>
              {expected > collected ? (
                <>
                  <Money amount={expected - collected} size="sm" tone="owed" /> still to come
                </>
              ) : (
                'Fully collected'
              )}
            </span>
            <span>Nikah {date(activeRound.nikahDate)}</span>
          </div>
        </div>
      </Card>

      {/* --- what I personally owe --- */}
      {myRow && (
        <Card title="Your due this round">
          <div className="spread">
            <div>
              <Money
                amount={myRow.balance}
                size="lg"
                tone={myRow.balance > 0 ? 'owed' : 'paid'}
              />
              <div className="stat-note">
                {myRow.balance <= 0
                  ? 'Settled — thank you.'
                  : myRow.paidSoFar > 0
                    ? `Paid ${myRow.paidSoFar.toLocaleString('en-IN')} of ${myRow.dueAmount.toLocaleString('en-IN')}`
                    : myRow.explanation}
              </div>
            </div>
            {myRow.locked && (
              <Badge tone="info">Fixed by history</Badge>
            )}
          </div>
        </Card>
      )}

      {/* --- team progress --- */}
      <Card title="Collection by team">
        <div className="stack">
          {byTeam.map(({ team, expected: exp, collected: got, outstanding }) => (
            <TeamRow
              key={team}
              team={team}
              expected={exp}
              collected={got}
              outstanding={outstanding}
            />
          ))}
        </div>
      </Card>

      {clock.tone === 'past' && expected > collected && (
        <Notice tone="warn">
          The Kuri Last Date has passed with{' '}
          <strong>₹{(expected - collected).toLocaleString('en-IN')}</strong> outstanding. The
          relaxation period is informal — the admin closes the round on the reduced figure when
          it’s clear no more is coming.
        </Notice>
      )}
    </div>
  );
}

function TeamRow({
  team,
  expected,
  collected,
  outstanding,
}: {
  team: Team;
  expected: number;
  collected: number;
  outstanding: number;
}) {
  return (
    <div>
      <div className="spread" style={{ marginBottom: 'var(--s1)' }}>
        <span className="small" style={{ fontWeight: 550 }}>
          <TeamDot team={team} /> {team}
        </span>
        <span className="small">
          <Money amount={collected} size="sm" tone="paid" />
          <span className="muted"> / </span>
          <Money amount={expected} size="sm" tone="muted" />
        </span>
      </div>
      <Progress value={collected} total={expected} />
      {outstanding > 0 && (
        <div className="xs muted" style={{ marginTop: 'var(--s1)' }}>
          {outstanding} still to pay
        </div>
      )}
    </div>
  );
}
