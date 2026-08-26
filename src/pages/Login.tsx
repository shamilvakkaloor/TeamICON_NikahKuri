import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Notice } from '../components/ui';

export default function Login() {
  const { signIn, error } = useAuth();

  return (
    <div className="centre-page">
      <div className="centre-card stack">
        <div>
          <svg
            width="64"
            height="64"
            viewBox="0 0 64 64"
            fill="none"
            stroke="var(--green)"
            strokeWidth="1.5"
            aria-hidden="true"
            style={{ margin: '0 auto var(--s4)' }}
          >
            <circle cx="32" cy="32" r="22" />
            <circle cx="32" cy="32" r="13" strokeDasharray="3 4" />
            <path d="M32 10v44M10 32h44" strokeOpacity="0.35" />
            <circle cx="32" cy="32" r="4" fill="var(--gold)" stroke="none" />
          </svg>
          <h1 style={{ fontSize: 'var(--text-2xl)' }}>Nikah Kuri</h1>
          <p className="muted small" style={{ marginTop: 'var(--s2)' }}>
            Team ICON — a rotating wedding fund kept honestly, in one ledger.
          </p>
        </div>

        {error && <Notice tone="danger">{error}</Notice>}

        <button className="btn block" onClick={signIn}>
          Sign in with Google
        </button>

        <p className="xs muted">
          Sign in with the Google account registered against your name in the group.
        </p>

        <Link to="/public" className="small">
          View round summaries without signing in →
        </Link>
      </div>
    </div>
  );
}
