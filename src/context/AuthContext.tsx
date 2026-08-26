import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider, isConfigured } from '../lib/firebase';
import { useData } from './DataContext';
import type { Member } from '../domain/types';

interface AuthValue {
  user: User | null;
  /** The kuri member this Google account maps to, matched on email. */
  member: Member | null;
  loading: boolean;
  /** Signed in with Google but not on the member roster. */
  unrecognised: boolean;
  isAdmin: boolean;
  isCoordinator: boolean;
  signIn: () => Promise<void>;
  signOutNow: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { members, loading: membersLoading } = useData();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured) {
      setAuthLoading(false);
      return;
    }
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
  }, []);

  const value = useMemo<AuthValue>(() => {
    const email = user?.email?.toLowerCase() ?? null;
    const member = email ? (members.find((m) => m.email === email) ?? null) : null;
    // Only decide someone is unrecognised once the roster has actually loaded,
    // otherwise a slow first snapshot flashes the "access denied" screen.
    const rosterReady = !membersLoading;

    return {
      user,
      member,
      loading: authLoading || (Boolean(user) && membersLoading),
      unrecognised: Boolean(user) && rosterReady && !member,
      isAdmin: member?.role === 'admin',
      isCoordinator: member?.role === 'coordinator' || member?.role === 'admin',
      error,
      signIn: async () => {
        setError(null);
        try {
          await signInWithPopup(auth, googleProvider);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Sign-in failed');
        }
      },
      signOutNow: async () => {
        await signOut(auth);
      },
    };
  }, [user, members, membersLoading, authLoading, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
