/**
 * Every Firestore path in one file, plus the converters that turn a document
 * into plain data at the boundary — Timestamps become epoch milliseconds, so
 * the domain layer never has to know Firebase exists.
 */

import { Timestamp, collection, doc } from "./fs.js";
import { getDb } from "./firebase.js";
import { DEFAULT_AMOUNT } from "../domain/ledger.js";

export const col = (name) => collection(getDb(), name);
export const ref = (name, id) => doc(getDb(), name, id);
export const subcol = (...parts) => collection(getDb(), ...parts);
export const subref = (...parts) => doc(getDb(), ...parts);

export function ms(value) {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "number") return value;
  return 0;
}

export const toTimestamp = (millis) => Timestamp.fromMillis(millis);

// --- converters ------------------------------------------------------------

export function memberFrom(snap) {
  const d = snap.data() || {};
  return {
    id: snap.id,
    name: d.name || "",
    team: d.team || "KOZHIKODE",
    email: (d.email || "").toLowerCase(),
    joinedAtKuriNumber: d.joinedAtKuriNumber ?? 1,
    photoUrl: d.photoUrl || "",
    role: d.role || "member",
    status: d.status || "active",
    hasBeenGroom: d.hasBeenGroom ?? false,
    standingAmount: d.standingAmount ?? DEFAULT_AMOUNT,
    amountHistory: (d.amountHistory || []).map((e) => ({
      amount: e.amount,
      effectiveFromKuriNumber: e.effectiveFromKuriNumber,
      setBy: e.setBy || "",
      setAt: ms(e.setAt),
    })),
  };
}

export function roundFrom(snap) {
  const d = snap.data() || {};
  return {
    id: snap.id,
    kuriNumber: d.kuriNumber ?? 0,
    groomMemberId: d.groomMemberId || "",
    nikahDate: ms(d.nikahDate),
    kuriLastDate: ms(d.kuriLastDate),
    status: d.status || "upcoming",
    closedShort: d.closedShort ?? false,
    notes: d.notes || "",
  };
}

export function paymentFrom(snap) {
  const d = snap.data() || {};
  return {
    id: snap.id,
    fromMemberId: d.fromMemberId || "",
    toMemberId: d.toMemberId || "",
    kuriId: d.kuriId || "",
    team: d.team || "KOZHIKODE",
    amount: d.amount ?? 0,
    date: ms(d.date),
    recordedByMemberId: d.recordedByMemberId || "",
    edited: d.edited ?? false,
    /** Removed from the ledger but kept in the journal (rule 24). */
    voided: d.voided ?? false,
    notes: d.notes || "",
  };
}

export function auditFrom(snap) {
  const d = snap.data() || {};
  return {
    id: snap.id,
    targetType: d.targetType || "",
    targetId: d.targetId || "",
    field: d.field || "",
    oldValue: d.oldValue,
    newValue: d.newValue,
    changedByMemberId: d.changedByMemberId || "",
    changedAt: ms(d.changedAt),
    reason: d.reason || "",
  };
}
