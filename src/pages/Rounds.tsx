import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { createRound } from '../lib/db';
import { Badge, Card, Dialog, EmptyState, Field, Money, Notice } from '../components/ui';
import { PlusIcon } from '../components/Icons';
import { date } from '../lib/format';
import type { RoundStatus } from '../domain/types';

const STATUS_TONE: Record<RoundStatus, 'paid' | 'pending' | 'neutral'> = {
  completed: 'paid',
  active: 'pending',
  upcoming: 'neutral',
};

export default function Rounds() {
  const { rounds, members, memberById, payments } = useData();
  const { isAdmin } = useAuth();
  const [creating, setCreating] = useState(false);

  const sorted = [...rounds].sort((a, b) => b.kuriNumber - a.kuriNumber);
  const hasOpenRound = rounds.some((r) => r.status === 'active');

  return (
    <div className="stack">
      {isAdmin && (
        <div className="row between">
          <span className="small muted">
            {rounds.filter((r) => r.status === 'completed').length} of {members.length} members have
            had their round
          </span>
          <button className="btn" onClick={() => setCreating(true)} disabled={hasOpenRound}>
            <PlusIcon size={16} /> Open a round
          </button>
        </div>
      )}

      {hasOpenRound && isAdmin && (
        <Notice>
          One round runs at a time. Close the open round before opening the next.
        </Notice>
      )}

      {sorted.length === 0 ? (
        <EmptyState title="No rounds yet" body="The first round starts when the admin assigns a groom." />
      ) : (
        <Card padded={false}>
          <div className="ledger">
            {sorted.map((r) => {
              const groom = memberById(r.groomMemberId);
              const collected = payments
                .filter((p) => p.kuriId === r.id)
                .reduce((t, p) => t + p.amount, 0);
              return (
                <Link
                  key={r.id}
                  to={`/rounds/${r.id}`}
                  className="ledger-row"
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  <span className="avatar">{r.kuriNumber}</span>
                  <div className="ledger-main">
                    <div className="ledger-title">{groom?.name ?? 'Unassigned'}</div>
                    <div className="ledger-meta">
                      Nikah {date(r.nikahDate)} · Last date {date(r.kuriLastDate)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Money amount={collected} tone="paid" />
                    <div style={{ marginTop: 2 }}>
                      <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      {creating && <CreateRoundDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateRoundDialog({ onClose }: { onClose: () => void }) {
  const { members, rounds } = useData();
  const nextNumber = Math.max(0, ...rounds.map((r) => r.kuriNumber)) + 1;

  // Rule 8: one round per member. Anyone who has already been groom is out.
  const pastGrooms = new Set(rounds.map((r) => r.groomMemberId));
  const eligible = members.filter((m) => !pastGrooms.has(m.id) && m.status === 'active');

  const [groomMemberId, setGroomMemberId] = useState('');
  const [nikahDate, setNikahDate] = useState('');
  const [kuriLastDate, setKuriLastDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groom = members.find((m) => m.id === groomMemberId);
  // Rule 30: a late joiner collects from fewer members. Show it up front so
  // nobody is surprised on the day.
  const contributorCount = groom
    ? members.filter((m) => m.id !== groom.id && m.status === 'active').length
    : 0;

  async function submit() {
    if (!groomMemberId || !nikahDate || !kuriLastDate) {
      setError('Groom and both dates are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createRound({
        kuriNumber: nextNumber,
        groomMemberId,
        nikahDate: new Date(nikahDate).getTime(),
        kuriLastDate: new Date(kuriLastDate).getTime(),
        status: 'active',
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the round.');
      setSaving(false);
    }
  }

  return (
    <Dialog
      title={`Open Kuri ${nextNumber}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" onClick={submit} disabled={saving}>
            {saving ? 'Opening…' : 'Open round'}
          </button>
        </>
      }
    >
      <div className="stack">
        {error && <Notice tone="danger">{error}</Notice>}

        <Field label="Groom" hint="Only members who have not yet had a round appear here.">
          <select value={groomMemberId} onChange={(e) => setGroomMemberId(e.target.value)}>
            <option value="">Select a member…</option>
            {eligible.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.team}
                {m.joinedAtKuriNumber > 1 ? ` (joined at Kuri ${m.joinedAtKuriNumber})` : ''}
              </option>
            ))}
          </select>
        </Field>

        <div className="form-grid two">
          <Field label="Nikah date">
            <input type="date" value={nikahDate} onChange={(e) => setNikahDate(e.target.value)} />
          </Field>
          <Field label="Kuri last date" hint="Money must be in before this.">
            <input
              type="date"
              value={kuriLastDate}
              onChange={(e) => setKuriLastDate(e.target.value)}
            />
          </Field>
        </div>

        {groom && (
          <Notice tone={groom.joinedAtKuriNumber > 1 ? 'warn' : 'info'}>
            <span>
              {groom.name} collects from up to <strong>{contributorCount}</strong> members.
              {groom.joinedAtKuriNumber > 1 && (
                <>
                  {' '}
                  He joined at Kuri {groom.joinedAtKuriNumber}, so grooms of earlier rounds owe him
                  nothing — his pot is smaller by design.
                </>
              )}{' '}
              Review the generated dues on the round page before telling anyone the figure.
            </span>
          </Notice>
        )}
      </div>
    </Dialog>
  );
}
