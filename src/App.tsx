import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider, useData } from './context/DataContext';
import { isConfigured } from './lib/firebase';
import Layout from './components/Layout';
import { Notice, Skeleton } from './components/ui';
import Login from './pages/Login';
import AccessDenied from './pages/AccessDenied';
import SetupNeeded from './pages/SetupNeeded';
import PublicRounds from './pages/PublicRounds';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import Rounds from './pages/Rounds';
import RoundDetail from './pages/RoundDetail';
import Payments from './pages/Payments';
import MyContributions from './pages/MyContributions';
import Reports from './pages/Reports';
import WhoOwesWhom from './pages/WhoOwesWhom';
import Handover from './pages/Handover';
import AuditLog from './pages/AuditLog';
import Settlement from './pages/Settlement';

function Gate() {
  const { user, member, loading, unrecognised, signOutNow } = useAuth();
  const { error } = useData();
  const [stalled, setStalled] = useState(false);

  // Firestore retries a dropped connection silently and forever, so a first
  // load with no network never resolves. Say so rather than spinning.
  useEffect(() => {
    if (!loading) return setStalled(false);
    const timer = setTimeout(() => setStalled(true), 12_000);
    return () => clearTimeout(timer);
  }, [loading]);

  if (loading) {
    return (
      <div className="centre-page">
        <div className="centre-card stack">
          {stalled ? (
            <>
              <Notice tone="warn">
                Still trying to reach the server. Check your connection — your data is safe, it
                just can’t load right now.
              </Notice>
              <button className="btn outline" onClick={() => window.location.reload()}>
                Retry
              </button>
              <button className="btn ghost" onClick={signOutNow}>
                Sign out
              </button>
            </>
          ) : (
            <Skeleton rows={3} />
          )}
        </div>
      </div>
    );
  }

  if (!user) return <Login />;
  if (unrecognised) return <AccessDenied />;
  if (!member) return <AccessDenied />;

  return (
    <>
      {error && (
        <div style={{ padding: 'var(--s3)' }}>
          <Notice tone="danger">{error}</Notice>
        </div>
      )}
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="rounds" element={<Rounds />} />
          <Route path="rounds/:kuriId" element={<RoundDetail />} />
          <Route path="payments" element={<Payments />} />
          <Route path="mine" element={<MyContributions />} />
          <Route path="members" element={<Members />} />
          <Route path="reports" element={<Reports />} />
          <Route path="pairs" element={<WhoOwesWhom />} />
          <Route path="handover" element={<Handover />} />
          <Route path="settlement" element={<Settlement />} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}

export default function App() {
  if (!isConfigured) return <SetupNeeded />;

  return (
    <BrowserRouter>
      <DataProvider>
        <AuthProvider>
          <Routes>
            {/* Public round view — no login, served from the projection. */}
            <Route path="/public" element={<PublicRounds />} />
            <Route path="/*" element={<Gate />} />
          </Routes>
        </AuthProvider>
      </DataProvider>
    </BrowserRouter>
  );
}
