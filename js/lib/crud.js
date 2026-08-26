/**
 * Every write the app makes.
 *
 * Two invariants are enforced here rather than at the call sites, because
 * forgetting either one breaks things silently:
 *
 *   1. `memberIndex/{email}` must stay in step with the member document. It is
 *      what the security rules read to resolve a caller's role, so a member
 *      whose index entry drifts simply loses access with no visible cause.
 *   2. Payments are editable but never deletable, and an edit must set the
 *      permanent `edited` marker and write an audit entry in the same batch.
 */

import {
  addDoc,
  deleteDoc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  query,
  writeBatch,
} from "./fs.js";
import { getDb } from "./firebase.js";
import { col, ms, ref, subcol, subref, toTimestamp } from "./collections.js";

// --- the role index -------------------------------------------------------

/**
 * Firestore rules cannot run queries, and member documents are created with
 * auto-IDs long before that person first signs in — so the document ID is
 * never the Firebase Auth uid and rules cannot look a member up by uid or
 * search by email. This small document, keyed by lowercased email, is what
 * they read instead.
 */
export function syncMemberIndex(email, { memberId, role, team, status }) {
  return setDoc(ref("memberIndex", email.toLowerCase()), { memberId, role, team, status });
}

export function removeMemberIndex(email) {
  return deleteDoc(ref("memberIndex", email.toLowerCase()));
}

// --- setup ----------------------------------------------------------------

export async function isSetupComplete() {
  const snap = await getDoc(ref("settings", "app"));
  return snap.exists();
}

/**
 * First run. The person doing the setup becomes the admin, and this is the one
 * moment the rules allow a non-admin to write — guarded by `settings/app` not
 * existing yet, so it can happen exactly once.
 */
export async function completeSetup({ groupName, name, email, team }) {
  const batch = writeBatch(getDb());
  const memberRef = ref("members", crypto.randomUUID());
  const lower = email.toLowerCase();

  batch.set(memberRef, {
    name,
    team,
    email: lower,
    role: "admin",
    status: "active",
    hasBeenGroom: false,
    joinedAtKuriNumber: 1,
    standingAmount: 7000,
    amountHistory: [],
    photoUrl: "",
  });
  batch.set(ref("memberIndex", lower), {
    memberId: memberRef.id,
    role: "admin",
    team,
    status: "active",
  });
  batch.set(ref("settings", "app"), {
    groupName,
    createdAt: serverTimestamp(),
    createdByEmail: lower,
  });

  await batch.commit();
}

export async function getSettings() {
  const snap = await getDoc(ref("settings", "app"));
  return snap.exists() ? snap.data() : null;
}

// --- members --------------------------------------------------------------

export async function createMember(data) {
  const email = data.email.toLowerCase();
  const docRef = await addDoc(col("members"), { ...data, email });
  await syncMemberIndex(email, {
    memberId: docRef.id,
    role: data.role,
    team: data.team,
    status: data.status,
  });
  return docRef;
}

/**
 * `previous` is required whenever role, team, status or email may change —
 * without it the index cannot be re-synced, and an email change would leave
 * the old address holding its access.
 */
export async function updateMember(id, patch, previous) {
  const out = { ...patch };
  if (patch.email) out.email = patch.email.toLowerCase();
  await updateDoc(ref("members", id), out);

  if (!previous) return;

  const merged = { ...previous, ...patch };
  const newEmail = (patch.email || previous.email).toLowerCase();
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

// --- contact details ------------------------------------------------------

/**
 * Mobile numbers live at `memberContacts/{memberId}`, which only the admin can
 * read. A `mobile` field on the member document would be readable by every
 * signed-in member through the raw API no matter what the UI chose to render.
 */
export async function fetchContacts() {
  try {
    const snap = await getDocs(col("memberContacts"));
    return new Map(snap.docs.map((s) => [s.id, s.data().mobile || ""]));
  } catch {
    // Ordinary members get a permission error here. That is expected.
    return new Map();
  }
}

export function setContact(memberId, mobile) {
  return setDoc(ref("memberContacts", memberId), { mobile });
}

// --- rounds ---------------------------------------------------------------

export function createRound(data) {
  return addDoc(col("kuriRounds"), {
    ...data,
    nikahDate: toTimestamp(data.nikahDate),
    kuriLastDate: toTimestamp(data.kuriLastDate),
  });
}

export function updateRound(id, patch) {
  const out = { ...patch };
  if (patch.nikahDate) out.nikahDate = toTimestamp(patch.nikahDate);
  if (patch.kuriLastDate) out.kuriLastDate = toTimestamp(patch.kuriLastDate);
  return updateDoc(ref("kuriRounds", id), out);
}

// --- dues, overrides, opt-outs -------------------------------------------

export async function fetchParticipation(kuriId) {
  const snap = await getDocs(subcol("roundParticipation", kuriId, "members"));
  return snap.docs.map((s) => ({
    memberId: s.id,
    participating: s.data().participating ?? true,
    reason: s.data().reason || "",
  }));
}

export async function fetchOverrides(kuriId) {
  const snap = await getDocs(subcol("roundOverrides", kuriId, "members"));
  return snap.docs.map((s) => ({
    memberId: s.id,
    amount: s.data().amount ?? 0,
    setBy: s.data().setBy || "",
    setAt: ms(s.data().setAt),
  }));
}

export function setParticipation(kuriId, memberId, participating, reason) {
  return setDoc(subref("roundParticipation", kuriId, "members", memberId), {
    participating,
    reason,
  });
}

/** A one-off amount for a single round — does not carry forward (rule 2). */
export function setRoundOverride(kuriId, memberId, amount, setBy) {
  return setDoc(subref("roundOverrides", kuriId, "members", memberId), {
    amount,
    setBy,
    setAt: serverTimestamp(),
  });
}

export function clearRoundOverride(kuriId, memberId) {
  return deleteDoc(subref("roundOverrides", kuriId, "members", memberId));
}

/** A standing change: updates the member and appends to amountHistory. */
export function setStandingAmount(member, amount, effectiveFromKuriNumber, setBy) {
  return updateDoc(ref("members", member.id), {
    standingAmount: amount,
    amountHistory: [
      ...member.amountHistory,
      { amount, effectiveFromKuriNumber, setBy, setAt: new Date() },
    ],
  });
}

/** Publishes the reviewed due sheet as the durable record for the round. */
export async function writeRoundDues(kuriId, dues) {
  const batch = writeBatch(getDb());
  for (const due of dues) {
    batch.set(subref("roundDues", kuriId, "members", due.memberId), {
      dueAmount: due.dueAmount,
      basis: due.basis,
      mirroredFromPaymentIds: due.mirroredFromPaymentIds,
      paidSoFar: due.paidSoFar ?? 0,
      balance: due.balance ?? due.dueAmount,
      standingChangeSuppressed: due.standingChangeSuppressed ?? false,
    });
  }
  await batch.commit();
}

// --- payments -------------------------------------------------------------

export function recordPayment(data) {
  return addDoc(col("payments"), {
    ...data,
    date: toTimestamp(data.date),
    edited: false,
    createdAt: serverTimestamp(),
  });
}

/**
 * Remove a payment from the ledger without erasing it.
 *
 * Payments are never deleted (rule 24) — a correction to zero leaves the trail
 * intact. The row keeps its place in the journal, marked as removed, and stops
 * counting towards anything because its amount is zero. That matters because
 * repayment mirrors what was actually received: a hard delete would silently
 * change what a past groom owes, with nothing left to explain why.
 *
 * Reversible — editing the amount back above zero un-removes it.
 */
export async function voidPayment(id, previousAmount, audit) {
  const batch = writeBatch(getDb());
  batch.update(ref("payments", id), { amount: 0, voided: true, edited: true });
  batch.set(ref("auditLog", crypto.randomUUID()), {
    ...audit,
    field: "removed",
    oldValue: previousAmount,
    newValue: 0,
    changedAt: serverTimestamp(),
  });
  await batch.commit();
}

/** A correction. The old value survives in the audit entry (rule 24). */
export async function editPayment(id, patch, audit) {
  const batch = writeBatch(getDb());
  const out = { ...patch, edited: true };
  if (patch.date) out.date = toTimestamp(patch.date);
  // Correcting a removed payment back to a real figure restores it.
  if (typeof patch.amount === "number") out.voided = patch.amount === 0;
  batch.update(ref("payments", id), out);
  batch.set(subref("auditLog", crypto.randomUUID()), {
    ...audit,
    changedAt: serverTimestamp(),
  });
  await batch.commit();
}

// --- handover -------------------------------------------------------------

export function setHandover(kuriId, team, data) {
  const out = { ...data };
  if (data.handedOverAt) out.handedOverAt = toTimestamp(data.handedOverAt);
  return setDoc(subref("handovers", kuriId, "teams", team), out, { merge: true });
}

export async function fetchHandovers(kuriId) {
  const snap = await getDocs(subcol("handovers", kuriId, "teams"));
  return snap.docs.map((s) => ({
    team: s.id,
    collectedAmount: s.data().collectedAmount ?? 0,
    coordinatorMemberId: s.data().coordinatorMemberId || "",
    handedOverAt: s.data().handedOverAt ? ms(s.data().handedOverAt) : null,
    status: s.data().status || "collecting",
  }));
}

// --- settlement -----------------------------------------------------------

export async function fetchSettlements(memberId) {
  const snap = await getDocs(
    query(col("settlements"), where("exitingMemberId", "==", memberId)),
  );
  return snap.docs.map((s) => ({ id: s.id, ...s.data() }));
}

export async function writeSettlements(lines) {
  const batch = writeBatch(getDb());
  for (const line of lines) batch.set(ref("settlements", crypto.randomUUID()), line);
  await batch.commit();
}

export function markSettlementSettled(id) {
  return updateDoc(ref("settlements", id), { status: "settled" });
}

// --- audit ----------------------------------------------------------------

export function logAudit(entry) {
  return addDoc(col("auditLog"), { ...entry, changedAt: serverTimestamp() });
}

// --- public projection ----------------------------------------------------

/**
 * The public page reads only this. It is a separate collection holding round
 * number, groom name and photo, dates and totals — so a rules mistake on the
 * world-readable path cannot leak payment records or phone numbers, because
 * the path simply does not contain them.
 */
export function publishRound(round, { groomName, groomPhotoUrl, totalCollected, byTeam }) {
  return setDoc(ref("publicRounds", round.id), {
    kuriNumber: round.kuriNumber,
    groomName,
    groomPhotoUrl: groomPhotoUrl || "",
    nikahDate: toTimestamp(round.nikahDate),
    kuriLastDate: toTimestamp(round.kuriLastDate),
    status: round.status,
    totalCollected,
    byTeam,
  });
}
