import { Notice } from '../components/ui';

/**
 * Shown when no Firebase config has been supplied, so the app renders
 * something useful instead of an opaque SDK error.
 */
export default function SetupNeeded() {
  return (
    <div className="centre-page">
      <div className="centre-card stack" style={{ maxWidth: 520, textAlign: 'left' }}>
        <h1 style={{ fontSize: 'var(--text-xl)' }}>Firebase isn’t configured yet</h1>
        <Notice tone="info">
          Copy <code>.env.example</code> to <code>.env.local</code> and fill in the six values from
          your Firebase project (Project settings → Your apps → SDK setup and configuration).
        </Notice>
        <pre
          style={{
            background: 'var(--surface-sunk)',
            padding: 'var(--s4)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-xs)',
            overflowX: 'auto',
          }}
        >
          {`VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...`}
        </pre>
        <p className="small muted">
          Then restart the dev server. Full walkthrough in <code>SETUP.md</code>.
        </p>
      </div>
    </div>
  );
}
