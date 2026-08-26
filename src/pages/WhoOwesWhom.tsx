import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { pairwiseBalances } from '../domain/ledger';
import { Badge, Card, EmptyState, Money } from '../components/ui';

/**
 * The pairwise view the spreadsheet never had: for any member, what he has
 * given each other member and what he has received back.
 *
 * A balance only becomes a *debt* once both members have had their rounds —
 * until then it is an expectation. The screen says which it is rather than
 * presenting an expectation as money owed.
 */
export default function WhoOwesWhom() {
  const { members, payments, rounds, memberById } = useData();
  const { member: me } = useAuth();
  const [focusId, setFocusId] = useState(me?.id ?? '');

  const balances = useMemo(
    () => pairwiseBalances(members, payments, rounds),
    [members, payments, rounds],
  );

  const mine = balances.filter((b) => b.memberId === focusId);
  const focus = memberById(focusId);

  const owedToMe = mine.filter((b) => b.net > 0);
  const iOwe = mine.filter((b) => b.net < 0);

  return (
    <div className="stack">
      <Card>
        <label className="field">
          <span className="small" style={{ fontWeight: 550 }}>
            Show balances for
          </span>
          <select value={focusId} onChange={(e) => setFocusId(e.target.value)}>
            <option value="">Select a member…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </Card>

      {!focus ? (
        <EmptyState title="Pick a member" body="Choose someone to see every pair they’re part of." />
      ) : mine.length === 0 ? (
        <EmptyState
          title={`No money has moved through ${focus.name} yet`}
          body="Balances appear once payments are recorded."
        />
      ) : (
        <>
          <PairList
            title={`Owed to ${focus.name}`}
            emptyText="Nobody owes him anything."
            rows={owedToMe}
            memberById={memberById}
            tone="paid"
          />
          <PairList
            title={`${focus.name} owes`}
            emptyText="He owes nobody."
            rows={iOwe}
            memberById={memberById}
            tone="owed"
          />
        </>
      )}
    </div>
  );
}

function PairList({
  title,
  emptyText,
  rows,
  memberById,
  tone,
}: {
  title: string;
  emptyText: string;
  rows: ReturnType<typeof pairwiseBalances>;
  memberById: (id: string) => { name: string } | undefined;
  tone: 'paid' | 'owed';
}) {
  return (
    <Card title={title} padded={rows.length === 0}>
      {rows.length === 0 ? (
        <p className="small muted">{emptyText}</p>
      ) : (
        <div className="ledger">
          {rows.map((b) => (
            <div key={b.counterpartyId} className="ledger-row">
              <div className="ledger-main">
                <div className="ledger-title">{memberById(b.counterpartyId)?.name ?? '?'}</div>
                <div className="ledger-meta">
                  gave ₹{b.gave.toLocaleString('en-IN')} · received ₹
                  {b.received.toLocaleString('en-IN')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Money amount={Math.abs(b.net)} tone={tone} />
                <div style={{ marginTop: 2 }}>
                  {b.bothSettled ? (
                    <Badge tone="paid">both settled</Badge>
                  ) : (
                    <Badge tone="pending">expected</Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
