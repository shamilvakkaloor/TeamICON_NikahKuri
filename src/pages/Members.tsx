import { useEffect, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { createMember, fetchContacts, setContact, updateMember } from '../lib/db';
import { Avatar, Badge, Card, Dialog, EmptyState, Field, Money, Notice, TeamDot } from '../components/ui';
import { PlusIcon } from '../components/Icons';
import { DEFAULT_AMOUNT, TEAMS, type Member, type Role, type Team } from '../domain/types';

export default function Members() {
  const { members, rounds, payments } = useData();
  const { isAdmin } = useAuth();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [team, setTeam] = useState<Team | 'ALL'>('ALL');
  const [contacts, setContacts] = useState<Map<string, string>>(new Map());

  // Only the admin can read this path; everyone else quietly gets an empty map.
  useEffect(() => {
    if (isAdmin) fetchContacts().then(setContacts);
  }, [isAdmin, adding, editing]);

  const shown = team === 'ALL' ? members : members.filter((m) => m.team === team);
  const pastGrooms = new Set(rounds.filter((r) => r.status === 'completed').map((r) => r.groomMemberId));

  return (
    <div className="stack">
      <div className="row wrap between">
        <span className="small muted">{members.length} members</span>
        {isAdmin && (
          <button className="btn" onClick={() => setAdding(true)}>
            <PlusIcon size={16} /> Add member
          </button>
        )}
      </div>

      <div className="pill-row">
        <button className={`pill${team === 'ALL' ? ' active' : ''}`} onClick={() => setTeam('ALL')}>
          All teams
        </button>
        {TEAMS.map((t) => (
          <button key={t} className={`pill${team === t ? ' active' : ''}`} onClick={() => setTeam(t)}>
            {t}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title="No members yet"
          body="Import the roster from the DATA sheet, or add members one at a time."
        />
      ) : (
        <Card padded={false}>
          <div className="ledger">
            {shown.map((m) => {
              const paidOut = payments
                .filter((p) => p.fromMemberId === m.id)
                .reduce((t, p) => t + p.amount, 0);
              return (
                <div key={m.id} className={`ledger-row${m.status === 'exited' ? ' dim' : ''}`}>
                  <Avatar name={m.name} photoUrl={m.photoUrl} />
                  <div className="ledger-main">
                    <div className="ledger-title">
                      {m.name}{' '}
                      {m.role !== 'member' && <Badge tone="info">{m.role}</Badge>}{' '}
                      {pastGrooms.has(m.id) && <Badge tone="gold">had his round</Badge>}
                    </div>
                    <div className="ledger-meta">
                      <TeamDot team={m.team} /> {m.team}
                      {m.joinedAtKuriNumber > 1 && ` · joined at Kuri ${m.joinedAtKuriNumber}`}
                      {m.standingAmount !== DEFAULT_AMOUNT &&
                        ` · standing ₹${m.standingAmount.toLocaleString('en-IN')}`}
                      {isAdmin && contacts.get(m.id) && ` · ${contacts.get(m.id)}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Money amount={paidOut} size="sm" tone="muted" />
                    <div className="xs muted">paid in total</div>
                  </div>
                  {isAdmin && (
                    <button className="btn ghost sm" onClick={() => setEditing(m)}>
                      Edit
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {!isAdmin && (
        <p className="xs muted">
          Mobile numbers are visible to the admin only — they’re contact details, not payment data.
        </p>
      )}

      {adding && <MemberDialog onClose={() => setAdding(false)} />}
      {editing && (
        <MemberDialog
          member={editing}
          mobile={contacts.get(editing.id) ?? ''}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function MemberDialog({
  member,
  mobile: initialMobile = '',
  onClose,
}: {
  member?: Member;
  mobile?: string;
  onClose: () => void;
}) {
  const { members, rounds } = useData();
  const nextKuri = Math.max(0, ...rounds.map((r) => r.kuriNumber)) + 1;

  const [name, setName] = useState(member?.name ?? '');
  const [team, setTeam] = useState<Team>(member?.team ?? 'KOZHIKODE');
  const [email, setEmail] = useState(member?.email ?? '');
  const [mobile, setMobile] = useState(initialMobile);
  const [role, setRole] = useState<Role>(member?.role ?? 'member');
  const [joinedAt, setJoinedAt] = useState(String(member?.joinedAtKuriNumber ?? nextKuri));
  const [standing, setStanding] = useState(String(member?.standingAmount ?? DEFAULT_AMOUNT));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Exactly one admin at any time. Promoting someone demotes the incumbent.
  const currentAdmin = members.find((m) => m.role === 'admin' && m.id !== member?.id);
  const willReplaceAdmin = role === 'admin' && Boolean(currentAdmin);

  async function save() {
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        team,
        email: email.trim().toLowerCase(),
        role,
        joinedAtKuriNumber: Number(joinedAt) || 1,
        standingAmount: Number(standing) || DEFAULT_AMOUNT,
      };

      if (willReplaceAdmin && currentAdmin) {
        // Handing over the admin role drops the incumbent to ordinary member.
        // Passing `currentAdmin` lets the index be re-synced with the new role,
        // which is what actually removes his access.
        await updateMember(currentAdmin.id, { role: 'member' }, currentAdmin);
      }

      if (member) {
        await updateMember(member.id, payload, member);
        await setContact(member.id, mobile.trim());
      } else {
        const ref = await createMember({
          ...payload,
          photoUrl: '',
          status: 'active',
          hasBeenGroom: false,
          amountHistory: [],
        });
        // Contact details go to their own admin-only path, never the member doc.
        if (mobile.trim()) await setContact(ref.id, mobile.trim());
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setSaving(false);
    }
  }

  return (
    <Dialog
      title={member ? `Edit ${member.name}` : 'Add member'}
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
        {error && <Notice tone="danger">{error}</Notice>}

        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <div className="form-grid two">
          <Field label="Team" hint="Members do not change teams.">
            <select value={team} onChange={(e) => setTeam(e.target.value as Team)}>
              {TEAMS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="member">Member</option>
              <option value="coordinator">Team coordinator</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
        </div>

        <Field label="Google account email" hint="Used to sign in. Must match exactly.">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>

        <Field label="Mobile" hint="Stored separately — only the admin can read it.">
          <input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} />
        </Field>

        <div className="form-grid two">
          <Field
            label="Joined at Kuri"
            hint="He owes nothing to rounds before this, and they owe him nothing back."
          >
            <input
              type="number"
              min={1}
              value={joinedAt}
              onChange={(e) => setJoinedAt(e.target.value)}
              disabled={Boolean(member)}
            />
          </Field>
          <Field label="Standing amount">
            <input
              className="money-input"
              type="number"
              min={0}
              step={100}
              value={standing}
              onChange={(e) => setStanding(e.target.value)}
            />
          </Field>
        </div>

        {willReplaceAdmin && currentAdmin && (
          <Notice tone="warn">
            <span>
              There can only be one admin. Saving this hands the role over — <strong>{currentAdmin.name}</strong>{' '}
              drops to ordinary member immediately.
            </span>
          </Notice>
        )}
      </div>
    </Dialog>
  );
}
