import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { computeSettlement, priorGroomRoundOf } from '../domain/ledger';
import { markSettlementSettled, updateMember, writeSettlements, fetchSettlements } from '../lib/db';
import { Badge, Card, EmptyState, Money, Notice } from '../components/ui';
import type { Settlement as SettlementRecord } from '../domain/types';

/**
 * Exit reconciliation. A past groom is net-positive and must be brought to
 * zero before he can leave; a member who never had his round is refunded in
 * full. Exit is gated — status cannot become `exited` until every line is
 * settled, so the window is auditable rather than a WhatsApp argument.
 */
export default function Settlement() {
  const { members, payments, rounds, memberById } = useData();
  const { isAdmin } = useAuth();
  const [selectedId, setSelectedId] = useState('');
  const [existing, setExisting] = useState<SettlementRecord[]>([]);
  const [busy, setBusy] = useState(false);

  const exiting = memberById(selectedId);

  const lines = useMemo(() => {
    if (!exiting) return [];
    return computeSettlement(exiting, members, payments, rounds);
  }, [exiting, members, payments, rounds]);

  const wasGroom = exiting
    ? priorGroomRoundOf(exiting.id, Number.MAX_SAFE_INTEGER, rounds) !== null
    : false;

  const allSettled = existing.length > 0 && existing.every((s) => s.status === 'settled');
  const total = lines.reduce((t, l) => t + l.amount, 0);

  async function loadExisting(memberId: string) {
    setSelectedId(memberId);
    if (!memberId) return setExisting([]);
    setExisting(await fetchSettlements(memberId));
  }

  async function startSettlement() {
    if (!exiting) return;
    setBusy(true);
    try {
      await writeSettlements(
        lines.map((l) => ({
          exitingMemberId: exiting.id,
          counterpartyMemberId: l.counterpartyMemberId,
          direction: l.direction,
          amount: l.amount,
          status: 'pending' as const,
        })),
      );
      await updateMember(exiting.id, { status: 'exiting' }, exiting);
      setExisting(await fetchSettlements(exiting.id));
    } finally {
      setBusy(false);
    }
  }

  async function settle(id: string) {
    await markSettlementSettled(id);
    if (selectedId) setExisting(await fetchSettlements(selectedId));
  }

  async function completeExit() {
    if (!exiting) return;
    // Re-syncing the index is what actually revokes access — the rules read
    // status from there, not from the member document.
    await updateMember(exiting.id, { status: 'exited' }, exiting);
    setExisting(await fetchSettlements(exiting.id));
  }

  if (!isAdmin) return <EmptyState title="Admin only" body="Settlement is run by the admin." />;

  return (
    <div className="stack">
      <Card>
        <label className="field">
          <span className="small" style={{ fontWeight: 550 }}>
            Member leaving the scheme
          </span>
          <select value={selectedId} onChange={(e) => loadExisting(e.target.value)}>
            <option value="">Select a member…</option>
            {members
              .filter((m) => m.status !== 'exited')
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {m.team}
                </option>
              ))}
          </select>
        </label>
      </Card>

      {!exiting ? (
        <EmptyState
          title="Nobody selected"
          body="Pick a member to compute what he owes, or is owed, before he can leave."
        />
      ) : (
        <>
          <Notice tone={wasGroom ? 'warn' : 'info'}>
            {wasGroom ? (
              <span>
                <strong>{exiting.name}</strong> has already had his round, so he is net-positive. He
                must repay everyone below before he can leave — <strong>₹{total.toLocaleString('en-IN')}</strong> in
                total.
              </span>
            ) : (
              <span>
                <strong>{exiting.name}</strong> has not had his round, so he is refunded in full.
                The past grooms below return <strong>₹{total.toLocaleString('en-IN')}</strong> between them.
              </span>
            )}
          </Notice>

          {existing.length === 0 ? (
            <>
              <Card title={`${lines.length} obligations`} padded={false}>
                {lines.length === 0 ? (
                  <div className="card-body">
                    <p className="small muted">
                      Nothing to settle — no money has moved between {exiting.name} and anyone else.
                    </p>
                  </div>
                ) : (
                  <div className="ledger">
                    {lines.map((l) => (
                      <div key={l.counterpartyMemberId} className="ledger-row">
                        <div className="ledger-main">
                          <div className="ledger-title">
                            {memberById(l.counterpartyMemberId)?.name ?? '?'}
                          </div>
                          <div className="ledger-meta">
                            {l.direction === 'owed_by_exiting'
                              ? `${exiting.name} repays him`
                              : `He refunds ${exiting.name}`}
                          </div>
                        </div>
                        <Money amount={l.amount} tone={l.direction === 'owed_by_exiting' ? 'owed' : 'paid'} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <button className="btn" onClick={startSettlement} disabled={busy || lines.length === 0}>
                Start settlement
              </button>
            </>
          ) : (
            <>
              <Card title="Settlement in progress" padded={false}>
                <div className="ledger">
                  {existing.map((s) => (
                    <div key={s.id} className={`ledger-row${s.status === 'settled' ? ' dim' : ''}`}>
                      <div className="ledger-main">
                        <div className="ledger-title">
                          {memberById(s.counterpartyMemberId)?.name ?? '?'}
                        </div>
                        <div className="ledger-meta">
                          {s.direction === 'owed_by_exiting' ? 'repay' : 'refund'}
                        </div>
                      </div>
                      <Money amount={s.amount} tone={s.status === 'settled' ? 'muted' : 'owed'} />
                      {s.status === 'settled' ? (
                        <Badge tone="paid">settled</Badge>
                      ) : (
                        <button className="btn outline sm" onClick={() => settle(s.id)}>
                          Mark settled
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </Card>

              <button className="btn" onClick={completeExit} disabled={!allSettled || exiting.status === 'exited'}>
                {exiting.status === 'exited'
                  ? 'Exited'
                  : allSettled
                    ? 'Complete exit'
                    : 'Exit blocked until every line is settled'}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
