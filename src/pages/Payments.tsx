import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { editPayment, recordPayment } from '../lib/db';
import { useRoundLedger } from '../hooks/useRoundLedger';
import { Badge, Card, Dialog, EmptyState, Field, Money, Notice, TeamDot } from '../components/ui';
import { PlusIcon } from '../components/Icons';
import { date } from '../lib/format';
import type { Payment, Team } from '../domain/types';

export default function Payments() {
  const { payments, memberById, rounds, activeRound } = useData();
  const { isAdmin, isCoordinator, member: me } = useAuth();
  const [recording, setRecording] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [search, setSearch] = useState('');
  const [roundFilter, setRoundFilter] = useState<string>(activeRound?.id ?? 'all');

  const canWrite = isAdmin || isCoordinator;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (roundFilter !== 'all' && p.kuriId !== roundFilter) return false;
      if (!q) return true;
      const from = memberById(p.fromMemberId)?.name.toLowerCase() ?? '';
      const to = memberById(p.toMemberId)?.name.toLowerCase() ?? '';
      return from.includes(q) || to.includes(q);
    });
  }, [payments, roundFilter, search, memberById]);

  const total = filtered.reduce((t, p) => t + p.amount, 0);

  return (
    <div className="stack">
      <div className="row wrap between">
        <input
          type="search"
          placeholder="Search by member…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        {canWrite && (
          <button className="btn" onClick={() => setRecording(true)} disabled={!activeRound}>
            <PlusIcon size={16} /> Record payment
          </button>
        )}
      </div>

      <div className="pill-row">
        <button
          className={`pill${roundFilter === 'all' ? ' active' : ''}`}
          onClick={() => setRoundFilter('all')}
        >
          All rounds
        </button>
        {[...rounds]
          .sort((a, b) => b.kuriNumber - a.kuriNumber)
          .map((r) => (
            <button
              key={r.id}
              className={`pill${roundFilter === r.id ? ' active' : ''}`}
              onClick={() => setRoundFilter(r.id)}
            >
              Kuri {r.kuriNumber}
            </button>
          ))}
      </div>

      <div className="spread small muted">
        <span>{filtered.length} payments</span>
        <Money amount={total} size="sm" tone="paid" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No payments recorded"
          body={
            activeRound
              ? 'Coordinators record money as they collect it from their team.'
              : 'Payments are recorded against an open round.'
          }
        />
      ) : (
        <Card padded={false}>
          <div className="ledger">
            {filtered.map((p) => {
              const from = memberById(p.fromMemberId);
              const to = memberById(p.toMemberId);
              const round = rounds.find((r) => r.id === p.kuriId);
              return (
                <div key={p.id} className="ledger-row">
                  <span className="avatar">
                    <TeamDot team={p.team as Team} />
                  </span>
                  <div className="ledger-main">
                    <div className="ledger-title">
                      {from?.name ?? '?'} → {to?.name ?? '?'}
                      {p.edited && (
                        <>
                          {' '}
                          <Badge tone="pending">edited</Badge>
                        </>
                      )}
                    </div>
                    <div className="ledger-meta">
                      {date(p.date)} · Kuri {round?.kuriNumber ?? '?'} · {p.team}
                      {p.notes ? ` · ${p.notes}` : ''}
                    </div>
                  </div>
                  <Money amount={p.amount} tone="paid" />
                  {isAdmin && (
                    <button className="btn ghost sm" onClick={() => setEditingPayment(p)}>
                      Edit
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {recording && activeRound && me && (
        <RecordDialog onClose={() => setRecording(false)} />
      )}
      {editingPayment && <EditPaymentDialog payment={editingPayment} onClose={() => setEditingPayment(null)} />}
    </div>
  );
}

function RecordDialog({ onClose }: { onClose: () => void }) {
  const { activeRound, members, memberById } = useData();
  const { member: me, isAdmin } = useAuth();
  const { rows } = useRoundLedger(activeRound);

  const [fromMemberId, setFromMemberId] = useState('');
  const [amount, setAmount] = useState('');
  const [when, setWhen] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A coordinator collects only from his own team; the admin sees everyone.
  const collectable = rows.filter(
    (r) => r.dueAmount > 0 && (isAdmin || r.team === me?.team),
  );

  const selected = rows.find((r) => r.memberId === fromMemberId);
  const payer = memberById(fromMemberId);

  async function submit() {
    if (!activeRound || !me || !payer) return;
    const value = Number(amount);
    if (!fromMemberId || !value || value <= 0) {
      setError('Choose a member and enter an amount.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await recordPayment({
        fromMemberId,
        // The groom. This is the field the whole pairwise rule depends on.
        toMemberId: activeRound.groomMemberId,
        kuriId: activeRound.id,
        team: payer.team,
        amount: value,
        date: new Date(when).getTime(),
        recordedByMemberId: me.id,
        notes,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record the payment.');
      setSaving(false);
    }
  }

  const groomName = memberById(activeRound?.groomMemberId ?? '')?.name ?? '';

  return (
    <Dialog
      title="Record a payment"
      onClose={onClose}
      footer={
        <>
          <button className="btn outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Record'}
          </button>
        </>
      }
    >
      <div className="stack">
        {error && <Notice tone="danger">{error}</Notice>}

        <Notice tone="info">
          Goes to <strong>{groomName}</strong> for Kuri {activeRound?.kuriNumber}.
        </Notice>

        <Field label="From">
          <select
            value={fromMemberId}
            onChange={(e) => {
              setFromMemberId(e.target.value);
              const row = rows.find((r) => r.memberId === e.target.value);
              if (row && row.balance > 0) setAmount(String(row.balance));
            }}
          >
            <option value="">Select a member…</option>
            {collectable.map((r) => (
              <option key={r.memberId} value={r.memberId}>
                {r.name} — {r.balance > 0 ? `₹${r.balance.toLocaleString('en-IN')} due` : 'settled'}
              </option>
            ))}
          </select>
        </Field>

        {selected && (
          <div className="notice">
            <span className="small">
              Due <Money amount={selected.dueAmount} size="sm" /> · paid{' '}
              <Money amount={selected.paidSoFar} size="sm" tone="paid" /> · {selected.explanation}
            </span>
          </div>
        )}

        <div className="form-grid two">
          <Field label="Amount" hint="Partial payments are fine — they accumulate.">
            <input
              className="money-input"
              type="number"
              min={1}
              step={100}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Date">
            <input type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
        </div>

        <Field label="Note (optional)">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. handed at masjid" />
        </Field>

        {members.length === 0 && <Notice tone="warn">No members on the roster yet.</Notice>}
      </div>
    </Dialog>
  );
}

/** Payments are editable, never deletable — a correction keeps the trail. */
function EditPaymentDialog({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const { member: me } = useAuth();
  const [amount, setAmount] = useState(String(payment.amount));
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  const value = Number(amount) || 0;
  const changed = value !== payment.amount;

  async function save() {
    if (!me || !reason.trim()) return;
    setSaving(true);
    try {
      await editPayment(
        payment.id,
        { amount: value },
        {
          targetType: 'payment',
          targetId: payment.id,
          field: 'amount',
          oldValue: payment.amount,
          newValue: value,
          changedByMemberId: me.id,
          reason: reason.trim(),
        },
      );
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      title="Edit payment"
      onClose={onClose}
      footer={
        <>
          <button className="btn outline" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn danger"
            onClick={save}
            disabled={saving || !changed || !reason.trim() || !confirmed}
          >
            Save correction
          </button>
        </>
      }
    >
      <div className="stack">
        <Notice tone="warn">
          Payments are never deleted. This records a correction and leaves a permanent “edited”
          marker plus an audit entry.
        </Notice>

        <Field label="Amount">
          <input
            className="money-input"
            type="number"
            min={0}
            step={100}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>

        <Field label="Reason for the change" hint="Shown in the audit log.">
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>

        {changed && (
          <Notice tone="danger">
            <span>
              This changes what the payer is owed back in his own round — repayment mirrors what was
              actually received. Confirm you have checked who this affects.
            </span>
          </Notice>
        )}

        <label className="row" style={{ gap: 'var(--s2)' }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ width: 'auto', minHeight: 0 }}
          />
          <span className="small">I understand the downstream effect of this correction.</span>
        </label>
      </div>
    </Dialog>
  );
}
