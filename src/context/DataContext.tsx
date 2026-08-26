import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { watchMembers, watchPayments, watchRounds } from '../lib/db';
import { isConfigured } from '../lib/firebase';
import type { KuriRound, Member, Payment } from '../domain/types';

interface DataValue {
  members: Member[];
  rounds: KuriRound[];
  payments: Payment[];
  loading: boolean;
  error: string | null;
  /** Rounds are strictly sequential, so there is at most one active round. */
  activeRound: KuriRound | null;
  memberById: (id: string) => Member | undefined;
}

const DataContext = createContext<DataValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [rounds, setRounds] = useState<KuriRound[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [ready, setReady] = useState({ members: false, rounds: false, payments: false });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured) {
      setReady({ members: true, rounds: true, payments: true });
      return;
    }
    const fail = (e: Error) => setError(e.message);
    const unsubs = [
      watchMembers((m) => {
        setMembers(m);
        setReady((r) => ({ ...r, members: true }));
      }, fail),
      watchRounds((r) => {
        setRounds(r);
        setReady((s) => ({ ...s, rounds: true }));
      }, fail),
      watchPayments((p) => {
        setPayments(p);
        setReady((r) => ({ ...r, payments: true }));
      }, fail),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const value = useMemo<DataValue>(() => {
    const byId = new Map(members.map((m) => [m.id, m]));
    return {
      members,
      rounds,
      payments,
      loading: !(ready.members && ready.rounds && ready.payments),
      error,
      activeRound: rounds.find((r) => r.status === 'active') ?? null,
      memberById: (id: string) => byId.get(id),
    };
  }, [members, rounds, payments, ready, error]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}
