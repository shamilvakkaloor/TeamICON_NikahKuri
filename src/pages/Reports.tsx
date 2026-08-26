import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { Card, EmptyState, Money, Stat, TeamDot } from '../components/ui';
import { TEAMS, type Team } from '../domain/types';
import { date } from '../lib/format';

type View = 'round' | 'team' | 'member';

export default function Reports() {
  const { rounds, payments, members, memberById } = useData();
  const [view, setView] = useState<View>('round');

  const totals = useMemo(() => {
    const collected = payments.reduce((t, p) => t + p.amount, 0);
    return {
      collected,
      rounds: rounds.filter((r) => r.status === 'completed').length,
      remaining: members.filter((m) => !m.hasBeenGroom && m.status === 'active').length,
    };
  }, [payments, rounds, members]);

  function exportCsv() {
    const header = ['Date', 'From', 'To (groom)', 'Kuri', 'Team', 'Amount', 'Edited', 'Notes'];
    const lines = payments.map((p) =>
      [
        new Date(p.date).toISOString().slice(0, 10),
        memberById(p.fromMemberId)?.name ?? p.fromMemberId,
        memberById(p.toMemberId)?.name ?? p.toMemberId,
        rounds.find((r) => r.id === p.kuriId)?.kuriNumber ?? '',
        p.team,
        p.amount,
        p.edited ? 'yes' : '',
        (p.notes ?? '').replace(/"/g, '""'),
      ]
        .map((cell) => `"${String(cell)}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nikah-kuri-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="stack">
      <div className="grid">
        <Stat label="Collected, all time" amount={totals.collected} tone="paid" />
        <Stat label="Rounds completed" amount={totals.rounds} />
        <Stat label="Members still to receive" amount={totals.remaining} tone="muted" />
      </div>

      <div className="row wrap between">
        <div className="pill-row">
          {(['round', 'team', 'member'] as View[]).map((v) => (
            <button
              key={v}
              className={`pill${view === v ? ' active' : ''}`}
              onClick={() => setView(v)}
            >
              By {v}
            </button>
          ))}
        </div>
        <button className="btn outline sm" onClick={exportCsv} disabled={payments.length === 0}>
          Export CSV
        </button>
      </div>

      {payments.length === 0 ? (
        <EmptyState title="Nothing to report yet" body="Reports fill in as payments are recorded." />
      ) : view === 'round' ? (
        <ByRound />
      ) : view === 'team' ? (
        <ByTeam />
      ) : (
        <ByMember />
      )}
    </div>
  );
}

function ByRound() {
  const { rounds, payments, memberById } = useData();
  return (
    <Card title="By round" padded={false}>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Kuri</th>
              <th>Groom</th>
              <th>Nikah</th>
              <th className="num">Contributors</th>
              <th className="num">Collected</th>
            </tr>
          </thead>
          <tbody>
            {[...rounds]
              .sort((a, b) => b.kuriNumber - a.kuriNumber)
              .map((r) => {
                const ps = payments.filter((p) => p.kuriId === r.id);
                return (
                  <tr key={r.id}>
                    <td>{r.kuriNumber}</td>
                    <td>{memberById(r.groomMemberId)?.name ?? '—'}</td>
                    <td>{date(r.nikahDate)}</td>
                    <td className="num">{new Set(ps.map((p) => p.fromMemberId)).size}</td>
                    <td className="num">
                      <Money amount={ps.reduce((t, p) => t + p.amount, 0)} size="sm" tone="paid" />
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ByTeam() {
  const { payments, members } = useData();
  return (
    <Card title="By team" padded={false}>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Team</th>
              <th className="num">Members</th>
              <th className="num">Paid in</th>
              <th className="num">Received</th>
            </tr>
          </thead>
          <tbody>
            {TEAMS.map((team: Team) => {
              const ids = new Set(members.filter((m) => m.team === team).map((m) => m.id));
              const paidIn = payments
                .filter((p) => ids.has(p.fromMemberId))
                .reduce((t, p) => t + p.amount, 0);
              const received = payments
                .filter((p) => ids.has(p.toMemberId))
                .reduce((t, p) => t + p.amount, 0);
              return (
                <tr key={team}>
                  <td>
                    <TeamDot team={team} /> {team}
                  </td>
                  <td className="num">{ids.size}</td>
                  <td className="num">
                    <Money amount={paidIn} size="sm" tone="paid" />
                  </td>
                  <td className="num">
                    <Money amount={received} size="sm" tone="muted" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ByMember() {
  const { payments, members } = useData();
  return (
    <Card title="By member" padded={false}>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Member</th>
              <th>Team</th>
              <th className="num">Paid in</th>
              <th className="num">Received</th>
              <th className="num">Net</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const paidIn = payments
                .filter((p) => p.fromMemberId === m.id)
                .reduce((t, p) => t + p.amount, 0);
              const received = payments
                .filter((p) => p.toMemberId === m.id)
                .reduce((t, p) => t + p.amount, 0);
              const net = paidIn - received;
              return (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td className="xs muted">{m.team}</td>
                  <td className="num">
                    <Money amount={paidIn} size="sm" />
                  </td>
                  <td className="num">
                    <Money amount={received} size="sm" />
                  </td>
                  <td className="num">
                    <Money amount={net} size="sm" tone={net > 0 ? 'paid' : net < 0 ? 'owed' : 'muted'} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
