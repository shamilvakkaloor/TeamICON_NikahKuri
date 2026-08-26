import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useRoundLedger, type LedgerRow } from '../hooks/useRoundLedger';
import {
  logAudit,
  setParticipation,
  setRoundOverride,
  setStandingAmount,
  updateMember,
  updateRound,
  writeRoundDues,
} from '../lib/db';
import { Badge, Card, Dialog, EmptyState, Field, Money, Notice, Progress, TeamDot } from '../components/ui';
import { LockIcon } from '../components/Icons';
import { date } from '../lib/format';
import { DEFAULT_AMOUNT, type DueBasis, type Team } from '../domain/types';

const BASIS_LABEL: Record<DueBasis, string> = {
  mirrors_earlier_receipt: 'Repayment',
  standing_amount: 'Standard',
  round_override: 'This round only',
  exempt_groom: 'Groom',
  opted_out: 'Opted out',
  exited: 'Not applicable',
};

export default function RoundDetail() {
  const { kuriId } = useParams();
  const { rounds, memberById } = useData();
  const { isAdmin, member: me } = useAuth();
  const round = rounds.find((r) => r.id === kuriId) ?? null;
  const { rows, expected, collected } = useRoundLedger(round);
  const [editing, setEditing] = useState<LedgerRow | null>(null);
  const [closing, setClosing] = useState(false);

  if (!round) return <EmptyState title="Round not found" />;

  const groom = memberById(round.groomMemberId);
  const unpaid = rows.filter((r) => r.balance > 0);

  async function publishDues() {
    if (!round) return;
    await writeRoundDues(
      round.id,
      rows.map((r) => ({
        memberId: r.memberId,
        dueAmount: r.dueAmount,
        basis: r.basis,
        mirroredFromPaymentIds: r.mirroredFromPaymentIds,
        paidSoFar: r.paidSoFar,
        balance: r.balance,
        standingChangeSuppressed: r.standingChangeSuppressed,
      })),
    );
  }

  async function closeRound() {
    if (!round || !groom || !me) return;
    await updateRound(round.id, {
      status: 'completed',
      closedShort: collected < expected,
    });
    await updateMember(groom.id, { hasBeenGroom: true }, groom);
    await logAudit({
      targetType: 'round',
      targetId: round.id,
      field: 'status',
      oldValue: round.status,
      newValue: 'completed',
      changedByMemberId: me.id,
      reason:
        collected < expected
          ? `Closed short by ₹${(expected - collected).toLocaleString('en-IN')}`
          : 'Fully collected',
    });
    setClosing(false);
  }

  const suppressed = rows.filter((r) => r.standingChangeSuppressed);

  return (
    <div className="stack">
      <Card>
        <div className="spread">
          <div>
            <div className="stat-label">Kuri {round.kuriNumber}</div>
            <h2>{groom?.name ?? 'Unassigned'}</h2>
            <div className="small muted" style={{ marginTop: 'var(--s1)' }}>
              Nikah {date(round.nikahDate)} · Last date {date(round.kuriLastDate)}
            </div>
          </div>
          <Badge tone={round.status === 'completed' ? 'paid' : 'pending'}>{round.status}</Badge>
        </div>

        <div className="divider" />

        <div className="spread" style={{ marginBottom: 'var(--s2)' }}>
          <Money amount={collected} size="lg" tone="paid" />
          <span className="small muted">
            of <Money amount={expected} size="sm" tone="muted" /> expected
          </span>
        </div>
        <Progress value={collected} total={expected} />

        {round.closedShort && (
          <div style={{ marginTop: 'var(--s3)' }}>
            <Notice tone="warn">
              Closed short. Because every repayment mirrors what was actually received, each member
              is now owed back only what he gave — the ledger corrects itself.
            </Notice>
          </div>
        )}
      </Card>

      {suppressed.length > 0 && (
        <Notice tone="warn">
          <span>
            {suppressed.length} member{suppressed.length > 1 ? 's have' : ' has'} a one-off amount
            set for this round that overrides their standing amount. The one-off wins — it was set
            deliberately for this round.
          </span>
        </Notice>
      )}

      {isAdmin && round.status === 'active' && (
        <div className="row wrap">
          <button className="btn outline" onClick={publishDues}>
            Publish these dues
          </button>
          <button className="btn" onClick={() => setClosing(true)}>
            Close round
          </button>
        </div>
      )}

      <Card
        title={`Dues — ${rows.length} members`}
        padded={false}
        action={
          unpaid.length > 0 ? <Badge tone="owed">{unpaid.length} outstanding</Badge> : <Badge tone="paid">All in</Badge>
        }
      >
        <div className="ledger">
          {rows.map((row) => (
            <div key={row.memberId} className={`ledger-row${row.dueAmount === 0 ? ' dim' : ''}`}>
              <span className="avatar">
                <TeamDot team={row.team as Team} />
              </span>
              <div className="ledger-main">
                <div className="ledger-title">{row.name}</div>
                <div className="ledger-meta">{row.explanation}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Money
                  amount={row.balance}
                  tone={row.balance > 0 ? 'owed' : row.dueAmount === 0 ? 'muted' : 'paid'}
                />
                <div className="row" style={{ justifyContent: 'flex-end', marginTop: 2 }}>
                  <span className="badge">
                    {row.locked && <LockIcon size={11} />}
                    {BASIS_LABEL[row.basis]}
                  </span>
                </div>
              </div>
              {isAdmin && round.status === 'active' && !row.locked && (
                <button className="btn ghost sm" onClick={() => setEditing(row)}>
                  Edit
                </button>
              )}
            </div>
          ))}
        </div>
      </Card>

      {editing && round && (
        <AmountDialog
          row={editing}
          kuriId={round.id}
          kuriNumber={round.kuriNumber}
          onClose={() => setEditing(null)}
        />
      )}

      {closing && (
        <Dialog
          title="Close this round?"
          onClose={() => setClosing(false)}
          footer={
            <>
              <button className="btn outline" onClick={() => setClosing(false)}>
                Cancel
              </button>
              <button className="btn" onClick={closeRound}>
                Close round
              </button>
            </>
          }
        >
          <div className="stack">
            {collected < expected ? (
              <Notice tone="warn">
                <span>
                  <strong>₹{(expected - collected).toLocaleString('en-IN')}</strong> is still
                  outstanding from {unpaid.length} member{unpaid.length > 1 ? 's' : ''}. Closing
                  now marks the reduced figure as final. Each of them will then owe back only what
                  they actually paid in.
                </span>
              </Notice>
            ) : (
              <Notice tone="info">Everything has been collected. Closing marks the round complete.</Notice>
            )}
            <p className="small muted">
              {groom?.name} will be marked as having had his round and will not be eligible again.
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/**
 * Setting an amount always carries a scope. "Only this round" is the default
 * because in practice almost every change is a one-off; adjusting future
 * rounds in advance is the deliberate second choice.
 */
function AmountDialog({
  row,
  kuriId,
  kuriNumber,
  onClose,
}: {
  row: LedgerRow;
  kuriId: string;
  kuriNumber: number;
  onClose: () => void;
}) {
  const { memberById } = useData();
  const { member: me } = useAuth();
  const [amount, setAmount] = useState(String(row.dueAmount));
  const [scope, setScope] = useState<'round' | 'onward'>('round');
  const [optOut, setOptOut] = useState(row.basis === 'opted_out');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const member = memberById(row.memberId);
  const value = Number(amount) || 0;

  async function save() {
    if (!member || !me) return;
    setSaving(true);
    try {
      if (optOut) {
        await setParticipation(kuriId, member.id, false, reason);
      } else {
        await setParticipation(kuriId, member.id, true, '');
        if (scope === 'round') {
          await setRoundOverride(kuriId, member.id, value, me.id);
        } else {
          await setStandingAmount(member, value, kuriNumber, me.id);
        }
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      title={`${member?.name}'s amount`}
      onClose={onClose}
      footer={
        <>
          <button className="btn outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" onClick={save} disabled={saving}>
            Save
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="row" style={{ gap: 'var(--s2)' }}>
          <input type="checkbox" checked={optOut} onChange={(e) => setOptOut(e.target.checked)} style={{ width: 'auto', minHeight: 0 }} />
          <span className="small">Opt out of this round</span>
        </label>

        {optOut ? (
          <Field label="Reason" hint="Recorded on the round so the decision is traceable.">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Hospital expenses" />
          </Field>
        ) : (
          <>
            <Field label="Amount" hint={`Default is ₹${DEFAULT_AMOUNT.toLocaleString('en-IN')}.`}>
              <input
                className="money-input"
                type="number"
                min={0}
                step={100}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>

            <Field label="Scope">
              <div className="stack" style={{ gap: 'var(--s2)' }}>
                <label className="row" style={{ gap: 'var(--s2)' }}>
                  <input
                    type="radio"
                    checked={scope === 'round'}
                    onChange={() => setScope('round')}
                    style={{ width: 'auto', minHeight: 0 }}
                  />
                  <span className="small">
                    <strong>Only for Kuri {kuriNumber}</strong> — does not carry forward
                  </span>
                </label>
                <label className="row" style={{ gap: 'var(--s2)' }}>
                  <input
                    type="radio"
                    checked={scope === 'onward'}
                    onChange={() => setScope('onward')}
                    style={{ width: 'auto', minHeight: 0 }}
                  />
                  <span className="small">
                    <strong>From Kuri {kuriNumber} onward</strong> — becomes his standing amount
                  </span>
                </label>
              </div>
            </Field>

            {value > DEFAULT_AMOUNT && (
              <Notice tone="warn">
                <span>
                  {member?.name} gives <strong>₹{value.toLocaleString('en-IN')}</strong>, so when
                  his own round comes the groom of this round will owe him exactly that back — not
                  ₹{DEFAULT_AMOUNT.toLocaleString('en-IN')}.
                </span>
              </Notice>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
