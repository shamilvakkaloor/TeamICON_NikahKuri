/**
 * The live view of the ledger.
 *
 * Three real-time listeners — members, rounds, payments — feed one store that
 * every page reads from. Everything else in the app (dues, balances, reports)
 * is derived from these three by the domain layer rather than stored, so a
 * screen can never drift out of step with the ledger.
 */

import { createStore } from "./store.js";
import { col, memberFrom, paymentFrom, roundFrom } from "./collections.js";
import { onSnapshot, orderBy, query } from "./fs.js";

export const dataStore = createStore({
  members: [],
  rounds: [],
  payments: [],
  loading: true,
  error: null,
});

let started = false;
const unsubs = [];

export function startDataListeners() {
  if (started) return;
  started = true;

  const ready = { members: false, rounds: false, payments: false };
  const settle = (key) => {
    ready[key] = true;
    if (ready.members && ready.rounds && ready.payments) {
      dataStore.set({ loading: false });
    }
  };
  const fail = (e) => dataStore.set({ error: e.message, loading: false });

  unsubs.push(
    onSnapshot(
      query(col("members"), orderBy("name")),
      (snap) => {
        dataStore.set({ members: snap.docs.map(memberFrom) });
        settle("members");
      },
      fail,
    ),
    onSnapshot(
      query(col("kuriRounds"), orderBy("kuriNumber")),
      (snap) => {
        dataStore.set({ rounds: snap.docs.map(roundFrom) });
        settle("rounds");
      },
      fail,
    ),
    onSnapshot(
      query(col("payments"), orderBy("date", "desc")),
      (snap) => {
        dataStore.set({ payments: snap.docs.map(paymentFrom) });
        settle("payments");
      },
      fail,
    ),
  );
}

export function stopDataListeners() {
  while (unsubs.length) unsubs.pop()();
  started = false;
  dataStore.set({ members: [], rounds: [], payments: [], loading: true, error: null });
}

// --- derived helpers, used all over the pages -----------------------------

export const data = () => dataStore.get();

export function memberById(id) {
  return dataStore.get().members.find((m) => m.id === id);
}

export function memberName(id) {
  return memberById(id)?.name || "Unknown";
}

/** Rounds are strictly sequential, so there is at most one active round. */
export function activeRound() {
  return dataStore.get().rounds.find((r) => r.status === "active") || null;
}

export function roundById(id) {
  return dataStore.get().rounds.find((r) => r.id === id) || null;
}

export function nextKuriNumber() {
  return Math.max(0, ...dataStore.get().rounds.map((r) => r.kuriNumber)) + 1;
}
