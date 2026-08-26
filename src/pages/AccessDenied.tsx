import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Notice } from '../components/ui';

export default function AccessDenied() {
  const { user, signOutNow } = useAuth();

  return (
    <div className="centre-page">
      <div className="centre-card stack">
        <h1 style={{ fontSize: 'var(--text-xl)' }}>Not on the member list</h1>
        <Notice tone="warn">
          <span>
            <strong>{user?.email}</strong> isn’t registered against any member of the kuri. Ask the
            admin to add this email to your member record, then sign in again.
          </span>
        </Notice>
        <button className="btn outline block" onClick={signOutNow}>
          Sign out
        </button>
        <Link to="/public" className="small">
          View public round summaries →
        </Link>
      </div>
    </div>
  );
}
