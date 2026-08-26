import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Badge, Card, EmptyState, Money, Skeleton } from '../components/ui';
import { date } from '../lib/format';

/**
 * The public view reads `publicRounds` — a projection maintained separately
 * from the real collections, containing only round number, groom name and
 * photo, dates and team totals.
 *
 * Nothing else in the database is world-readable, so a rules mistake here
 * cannot leak individual payment records or mobile numbers: the path simply
 * does not contain them.
 */
interface PublicRound {
  id: string;
  kuriNumber: number;
  groomName: string;
  groomPhotoUrl?: string;
  nikahDate: number;
  kuriLastDate: number;
  status: string;
  totalCollected: number;
  byTeam?: Record<string, number>;
}

export default function PublicRounds() {
  const [rounds, setRounds] = useState<PublicRound[] | null>(null);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    // Firestore retries a failed connection quietly and indefinitely, so on a
    // dropped or very slow link this promise simply never settles. Without a
    // deadline the page would sit on a skeleton forever — a realistic outcome
    // on patchy mobile data, and a confusing one for a public visitor.
    const timer = setTimeout(() => setStalled(true), 10_000);

    getDocs(query(collection(db, 'publicRounds'), orderBy('kuriNumber', 'desc')))
      .then((snap) =>
        setRounds(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              kuriNumber: data.kuriNumber ?? 0,
              groomName: data.groomName ?? '',
              groomPhotoUrl: data.groomPhotoUrl,
              nikahDate: data.nikahDate?.toMillis?.() ?? data.nikahDate ?? 0,
              kuriLastDate: data.kuriLastDate?.toMillis?.() ?? data.kuriLastDate ?? 0,
              status: data.status ?? 'upcoming',
              totalCollected: data.totalCollected ?? 0,
              byTeam: data.byTeam,
            };
          }),
        ),
      )
      .catch(() => setRounds([]))
      .finally(() => clearTimeout(timer));

    return () => clearTimeout(timer);
  }, []);

  const current = rounds?.find((r) => r.status === 'active');

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--s5) var(--s4)' }}>
      <header className="row between" style={{ marginBottom: 'var(--s5)' }}>
        <div className="row">
          <span className="brand-mark">N</span>
          <div>
            <div className="brand-name">Nikah Kuri</div>
            <div className="brand-sub">Team ICON</div>
          </div>
        </div>
        <Link to="/" className="btn outline sm">
          Sign in
        </Link>
      </header>

      {rounds === null ? (
        stalled ? (
          <EmptyState
            title="Can’t reach the server"
            body="Check your connection and reload. Round summaries will show once you’re back online."
          />
        ) : (
          <Skeleton rows={3} />
        )
      ) : rounds.length === 0 ? (
        <EmptyState
          title="No rounds published yet"
          body="Round summaries appear here once the admin publishes them."
        />
      ) : (
        <div className="stack">
          {current && (
            <Card>
              <div className="stat-label">Current round</div>
              <h2 style={{ fontSize: 'var(--text-2xl)' }}>{current.groomName}</h2>
              <p className="small muted" style={{ marginTop: 'var(--s1)' }}>
                Kuri {current.kuriNumber} · Nikah {date(current.nikahDate)} · collect by{' '}
                {date(current.kuriLastDate)}
              </p>
              <div style={{ marginTop: 'var(--s4)' }}>
                <Money amount={current.totalCollected} size="hero" tone="paid" />
                <div className="stat-note">collected so far</div>
              </div>
            </Card>
          )}

          <Card title="All rounds" padded={false}>
            <div className="ledger">
              {rounds.map((r) => (
                <div key={r.id} className="ledger-row">
                  <span className="avatar">{r.kuriNumber}</span>
                  <div className="ledger-main">
                    <div className="ledger-title">{r.groomName}</div>
                    <div className="ledger-meta">{date(r.nikahDate)}</div>
                  </div>
                  <Money amount={r.totalCollected} tone="paid" />
                  <Badge tone={r.status === 'completed' ? 'paid' : 'pending'}>{r.status}</Badge>
                </div>
              ))}
            </div>
          </Card>

          <p className="xs muted" style={{ textAlign: 'center' }}>
            Round totals only. Individual contributions are visible to members after signing in.
          </p>
        </div>
      )}
    </div>
  );
}
