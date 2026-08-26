/**
 * Domain types for the Nikah Kuri scheme.
 *
 * These mirror the Firestore collections described in the architecture doc,
 * but they are deliberately free of any Firebase imports so the ledger rules
 * can be unit-tested (and later reused inside Cloud Functions) without a
 * network or an emulator.
 */

export const TEAMS = ['KODUVALLY', 'KOZHIKODE', 'MALAPPURAM', 'VADAKARA'] as const;
export type Team = (typeof TEAMS)[number];

export type Role = 'admin' | 'coordinator' | 'member';
export type MemberStatus = 'active' | 'exiting' | 'exited';
export type RoundStatus = 'upcoming' | 'active' | 'completed';

/** The default a member gives when nothing else pins the figure down. */
export const DEFAULT_AMOUNT = 7000;

export interface AmountHistoryEntry {
  amount: number;
  effectiveFromKuriNumber: number;
  setBy: string;
  setAt: number; // epoch ms
}

export interface Member {
  id: string;
  name: string;
  team: Team;
  email: string;
  /** Rounds before this number carry no obligation in either direction. */
  joinedAtKuriNumber: number;
  photoUrl: string;
  role: Role;
  status: MemberStatus;
  hasBeenGroom: boolean;
  standingAmount: number;
  amountHistory: AmountHistoryEntry[];
}

/**
 * Mobile numbers live in their own collection, not on the member document.
 *
 * Firestore rules are document-level: a `mobile` field on `members` would be
 * readable by every signed-in member via the raw API no matter what the UI
 * chose to render. Contact details are not payment data, so they get a path
 * only the admin can read.
 */
export interface MemberContact {
  memberId: string;
  mobile: string;
}

export interface KuriRound {
  id: string;
  kuriNumber: number;
  groomMemberId: string;
  nikahDate: number; // epoch ms
  kuriLastDate: number; // epoch ms
  status: RoundStatus;
  /** Set when the admin closes a round that came up short (rule 9). */
  closedShort?: boolean;
  /** Free-text note shown on the round, e.g. why it closed short. */
  notes?: string;
}

/**
 * Why a member owes what he owes. Storing the reason is what lets the app
 * answer "why ₹7,000 and not ₹3,500?" a year later without re-deriving it.
 */
export type DueBasis =
  | 'mirrors_earlier_receipt'
  | 'standing_amount'
  | 'round_override'
  | 'exempt_groom'
  | 'opted_out'
  | 'exited';

export interface RoundDue {
  memberId: string;
  dueAmount: number;
  basis: DueBasis;
  /** Audit trail for `mirrors_earlier_receipt` — the payments being mirrored. */
  mirroredFromPaymentIds: string[];
  paidSoFar: number;
  balance: number;
  /**
   * True when a "from this round onward" standing change was overridden by an
   * earlier one-off for this round (rule 15). Surfaced so the admin can see
   * where a standing change did not take effect.
   */
  standingChangeSuppressed?: boolean;
}

export interface Payment {
  id: string;
  fromMemberId: string;
  /** The groom. Without this the pairwise rule cannot be evaluated at all. */
  toMemberId: string;
  kuriId: string;
  team: Team;
  amount: number;
  date: number; // epoch ms
  recordedByMemberId: string;
  edited: boolean;
  notes?: string;
}

export interface RoundParticipation {
  memberId: string;
  participating: boolean;
  reason: string;
}

/** A one-off amount set for a single round, which does not carry forward. */
export interface RoundOverride {
  memberId: string;
  amount: number;
  setBy: string;
  setAt: number;
}

export type HandoverStatus = 'collecting' | 'handed_over';

export interface Handover {
  team: Team;
  collectedAmount: number;
  coordinatorMemberId: string;
  handedOverAt: number | null;
  status: HandoverStatus;
}

export interface Credit {
  id: string;
  memberId: string;
  amount: number;
  originKuriId: string;
  originAuditEntryId: string;
  status: 'open' | 'applied';
  appliedToKuriId?: string;
}

export interface AuditEntry {
  id: string;
  targetType: 'payment' | 'roundDue' | 'member' | 'handover' | 'round';
  targetId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changedByMemberId: string;
  changedAt: number;
  reason: string;
}

export interface ProposedChange {
  kuriId: string;
  memberId: string;
  oldDue: number;
  newDue: number;
  reason: string;
}

export interface PendingRecalculation {
  id: string;
  triggeredByAuditEntryId: string;
  proposedChanges: ProposedChange[];
  status: 'awaiting_review' | 'applied' | 'reset';
  reviewedByMemberId?: string;
}

export interface Settlement {
  id: string;
  exitingMemberId: string;
  counterpartyMemberId: string;
  direction: 'owed_to_exiting' | 'owed_by_exiting';
  amount: number;
  status: 'pending' | 'settled';
}
