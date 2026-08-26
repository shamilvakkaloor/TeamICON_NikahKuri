/**
 * Firestore access. Every read converts Timestamps to epoch milliseconds at
 * the boundary so the domain layer never has to know Firebase exists.
 */

import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  DEFAULT_AMOUNT,
  type AuditEntry,
  type Credit,
  type Handover,
  type KuriRound,
  type Member,
  type MemberStatus,
  type Payment,
  type Role,
  type RoundDue,
  type RoundOverride,
  type RoundParticipation,
  type Settlement,
  type Team,
} from '../domain/types';

// --- conversion helpers ----------------------------------------------------

function ms(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'number') return value;
  return 0;
}

function memberFrom(snap: QueryDocumentSnapshot<DocumentData>): Member {
  const d = snap.data();
  return {
    id: snap.id,
    name: d.name ?? '',
    team: d.team ?? 'KOZHIKODE',
    email: (d.email ?? '').toLowerCase(),
    joinedAtKuriNumber: d.joinedAtKuriNumber ?? 1,
    photoUrl: d.photoUrl ?? '',
    role: d.role ?? 'member',
    status: d.status ?? 'active',
    hasBeenGroom: d.hasBeenGroom ?? false,
    standingAmount: d.standingAmount ?? DEFAULT_AMOUNT,
    amountHistory: (d.amountHistory ?? []).map((e: DocumentData) => ({
      amount: e.amount,
      effectiveFromKuriNumber: e.effectiveFromKuriNumber,
      setBy: e.setBy ?? '',
      setAt: ms(e.setAt),
    })),
  };
}

function roundFrom(snap: QueryDocumentSnapshot<DocumentData>): KuriRound {
  const d = snap.data();
  return {
    id: snap.id,
    kuriNumber: d.kuriNumber ?? 0,
    groomMemberId: d.groomMemberId ?? '',
    nikahDate: ms(d.nikahDate),
    kuriLastDate: ms(d.kuriLastDate),
    status: d.status ?? 'upcoming',
    closedShort: d.closedShort ?? false,
    notes: d.notes ?? '',
  };
}

function paymentFrom(snap: QueryDocumentSnapshot<DocumentData>): Payment {
  const d = snap.data();
  return {
    id: snap.id,
    fromMemberId: d.fromMemberId ?? '',
    toMemberId: d.toMemberId ?? '',
    kuriId: d.kuriId ?? '',
    team: d.team ?? 'KOZHIKODE',
    amount: d.amount ?? 0,
    date: ms(d.date),
    recordedByMemberId: d.recordedByMemberId ?? '',
    edited: d.edited ?? false,
    notes: d.notes ?? '',
  };
}

// --- collections -----------------------------------------------------------

export const membersCol = collection(db, 'members');
export const roundsCol = collection(db, 'kuriRounds');
export const paymentsCol = collection(db, 'payments');
export const creditsCol = collection(db, 'credits');
export const auditCol = collection(db, 'auditLog');
export const settlementsCol = collection(db, 'settlements');
export const recalcCol = collection(db, 'pendingRecalculations');

// --- live subscriptions ----------------------------------------------------

export function watchMembers(cb: (members: Member[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    query(membersCol, orderBy('name')),
    (snap) => cb(snap.docs.map(memberFrom)),
    onError,
  );
}

export function watchRounds(cb: (rounds: KuriRound[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    query(roundsCol, orderBy('kuriNumber')),
    (snap) => cb(snap.docs.map(roundFrom)),
    onError,
  );
}

export function watchPayments(cb: (payments: Payment[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    query(paymentsCol, orderBy('date', 'desc')),
    (snap) => cb(snap.docs.map(paymentFrom)),
    onError,
  );
}

export function watchRoundDues(
  kuriId: string,
  cb: (dues: RoundDue[]) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(
    collection(db, 'roundDues', kuriId, 'members'),
    (snap) =>
      cb(
        snap.docs.map((s) => {
          const d = s.data();
          return {
            memberId: s.id,
            dueAmount: d.dueAmount ?? 0,
            basis: d.basis ?? 'standing_amount',
            mirroredFromPaymentIds: d.mirroredFromPaymentIds ?? [],
            paidSoFar: d.paidSoFar ?? 0,
            balance: d.balance ?? 0,
            standingChangeSuppressed: d.standingChangeSuppressed ?? false,
          } as RoundDue;
        }),
      ),
    onError,
  );
}

export function watchHandovers(
  kuriId: string,
  cb: (handovers: Handover[]) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(
    collection(db, 'handovers', kuriId, 'teams'),
    (snap) =>
      cb(
        snap.docs.map((s) => {
          const d = s.data();
          return {
            team: s.id as Team,
            collectedAmount: d.collectedAmount ?? 0,
            coordinatorMemberId: d.coordinatorMemberId ?? '',
            handedOverAt: d.handedOverAt ? ms(d.handedOverAt) : null,
            status: d.status ?? 'collecting',
          } as Handover;
        }),
      ),
    onError,
  );
}

export function watchAuditLog(cb: (entries: AuditEntry[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    query(auditCol, orderBy('changedAt', 'desc')),
    (snap) =>
      cb(
        snap.docs.map((s) => {
          const d = s.data();
          return {
            id: s.id,
            targetType: d.targetType,
            targetId: d.targetId,
            field: d.field,
            oldValue: d.oldValue,
            newValue: d.newValue,
            changedByMemberId: d.changedByMemberId,
            changedAt: ms(d.changedAt),
            reason: d.reason ?? '',
          } as AuditEntry;
        }),
      ),
    onError,
  );
}

// --- one-off reads ---------------------------------------------------------

export async function fetchParticipation(kuriId: string): Promise<RoundParticipation[]> {
  const snap = await getDocs(collection(db, 'roundParticipation', kuriId, 'members'));
  return snap.docs.map((s) => ({
    memberId: s.id,
    participating: s.data().participating ?? true,
    reason: s.data().reason ?? '',
  }));
}

export async function fetchOverrides(kuriId: string): Promise<RoundOverride[]> {
  const snap = await getDocs(collection(db, 'roundOverrides', kuriId, 'members'));
  return snap.docs.map((s) => ({
    memberId: s.id,
    amount: s.data().amount ?? 0,
    setBy: s.data().setBy ?? '',
    setAt: ms(s.data().setAt),
  }));
}

export async function fetchSettlements(memberId: string): Promise<Settlement[]> {
  const snap = await getDocs(query(settlementsCol, where('exitingMemberId', '==', memberId)));
  return snap.docs.map((s) => ({ id: s.id, ...s.data() }) as Settlement);
}

export async function fetchOpenCredits(memberId: string): Promise<Credit[]> {
  const snap = await getDocs(
    query(creditsCol, where('memberId', '==', memberId), where('status', '==', 'open')),
  );
  return snap.docs.map((s) => ({ id: s.id, ...s.data() }) as Credit);
}

// --- writes ----------------------------------------------------------------

/**
 * `memberIndex/{email}` is what the security rules read to resolve the
 * caller's role — rules cannot query, and member documents are created with
 * auto-IDs before anyone signs in, so a uid-keyed lookup is impossible.
 *
 * Every write that touches a member's email, role, team or status has to keep
 * this in step, or that member silently loses access.
 */
export async function syncMemberIndex(
  email: string,
  data: { memberId: string; role: Role; team: Team; status: MemberStatus },
) {
  return setDoc(doc(db, 'memberIndex', email.toLowerCase()), data);
}

export async function removeMemberIndex(email: string) {
  return deleteDoc(doc(db, 'memberIndex', email.toLowerCase()));
}

export async function createMember(data: Omit<Member, 'id'>) {
  const email = data.email.toLowerCase();
  const ref = await addDoc(membersCol, { ...data, email });
  await syncMemberIndex(email, {
    memberId: ref.id,
    role: data.role,
    team: data.team,
    status: data.status,
  });
  return ref;
}

/**
 * Contact details live at `memberContacts/{memberId}`, which only the admin
 * can read. Ordinary members get a permission error here — that is expected,
 * and callers treat it as "no number to show" rather than a failure.
 */
export async function fetchContacts(): Promise<Map<string, string>> {
  try {
    const snap = await getDocs(collection(db, 'memberContacts'));
    return new Map(snap.docs.map((s) => [s.id, (s.data().mobile as string) ?? '']));
  } catch {
    return new Map();
  }
}

export async function setContact(memberId: string, mobile: string) {
  return setDoc(doc(db, 'memberContacts', memberId), { mobile });
}

/**
 * Updates the member, then re-syncs the role index. `previous` is needed so an
 * email change can drop the stale index entry — leaving it behind would let
 * the old address keep its access.
 */
export async function updateMember(id: string, patch: Partial<Member>, previous?: Member) {
  const out: DocumentData = { ...patch };
  if (patch.email) out.email = patch.email.toLowerCase();
  await updateDoc(doc(db, 'members', id), out);

  if (!previous) return;

  const merged = { ...previous, ...patch };
  const newEmail = (patch.email ?? previous.email).toLowerCase();
  if (previous.email && previous.email.toLowerCase() !== newEmail) {
    await removeMemberIndex(previous.email);
  }
  await syncMemberIndex(newEmail, {
    memberId: id,
    role: merged.role,
    team: merged.team,
    status: merged.status,
  });
}

export async function createRound(data: Omit<KuriRound, 'id'>) {
  return addDoc(roundsCol, {
    ...data,
    nikahDate: Timestamp.fromMillis(data.nikahDate),
    kuriLastDate: Timestamp.fromMillis(data.kuriLastDate),
  });
}

export async function updateRound(id: string, patch: Partial<KuriRound>) {
  const out: DocumentData = { ...patch };
  if (patch.nikahDate) out.nikahDate = Timestamp.fromMillis(patch.nikahDate);
  if (patch.kuriLastDate) out.kuriLastDate = Timestamp.fromMillis(patch.kuriLastDate);
  return updateDoc(doc(db, 'kuriRounds', id), out);
}

/** Payments are editable, never deletable (rule 24). */
export async function recordPayment(data: Omit<Payment, 'id' | 'edited'>) {
  return addDoc(paymentsCol, {
    ...data,
    date: Timestamp.fromMillis(data.date),
    edited: false,
    createdAt: serverTimestamp(),
  });
}

export async function editPayment(
  id: string,
  patch: Partial<Payment>,
  audit: Omit<AuditEntry, 'id' | 'changedAt'>,
) {
  const batch = writeBatch(db);
  const out: DocumentData = { ...patch, edited: true };
  if (patch.date) out.date = Timestamp.fromMillis(patch.date);
  batch.update(doc(db, 'payments', id), out);
  batch.set(doc(auditCol), { ...audit, changedAt: serverTimestamp() });
  await batch.commit();
}

export async function writeRoundDues(kuriId: string, dues: RoundDue[]) {
  const batch = writeBatch(db);
  for (const due of dues) {
    batch.set(doc(db, 'roundDues', kuriId, 'members', due.memberId), {
      dueAmount: due.dueAmount,
      basis: due.basis,
      mirroredFromPaymentIds: due.mirroredFromPaymentIds,
      paidSoFar: due.paidSoFar,
      balance: due.balance,
      standingChangeSuppressed: due.standingChangeSuppressed ?? false,
    });
  }
  await batch.commit();
}

export async function setParticipation(
  kuriId: string,
  memberId: string,
  participating: boolean,
  reason: string,
) {
  return setDoc(doc(db, 'roundParticipation', kuriId, 'members', memberId), {
    participating,
    reason,
  });
}

/** A one-off amount for a single round — does not carry forward (rule 2). */
export async function setRoundOverride(
  kuriId: string,
  memberId: string,
  amount: number,
  setBy: string,
) {
  return setDoc(doc(db, 'roundOverrides', kuriId, 'members', memberId), {
    amount,
    setBy,
    setAt: serverTimestamp(),
  });
}

/** A standing change: updates the member and appends to amountHistory. */
export async function setStandingAmount(
  member: Member,
  amount: number,
  effectiveFromKuriNumber: number,
  setBy: string,
) {
  return updateDoc(doc(db, 'members', member.id), {
    standingAmount: amount,
    amountHistory: [
      ...member.amountHistory,
      { amount, effectiveFromKuriNumber, setBy, setAt: Timestamp.now() },
    ],
  });
}

export async function setHandover(
  kuriId: string,
  team: Team,
  data: Partial<Omit<Handover, 'team'>>,
) {
  const out: DocumentData = { ...data };
  if (data.handedOverAt) out.handedOverAt = Timestamp.fromMillis(data.handedOverAt);
  return setDoc(doc(db, 'handovers', kuriId, 'teams', team), out, { merge: true });
}

export async function writeSettlements(lines: Omit<Settlement, 'id'>[]) {
  const batch = writeBatch(db);
  for (const line of lines) batch.set(doc(settlementsCol), line);
  await batch.commit();
}

export async function markSettlementSettled(id: string) {
  return updateDoc(doc(db, 'settlements', id), { status: 'settled' });
}

export async function logAudit(entry: Omit<AuditEntry, 'id' | 'changedAt'>) {
  return addDoc(auditCol, { ...entry, changedAt: serverTimestamp() });
}
