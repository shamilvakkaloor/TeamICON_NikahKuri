import { useEffect, useState } from 'react';
import { useData } from '../context/DataContext';
import { watchAuditLog } from '../lib/db';
import { Card, EmptyState, Skeleton } from '../components/ui';
import type { AuditEntry } from '../domain/types';

export default function AuditLog() {
  const { memberById } = useData();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);

  useEffect(() => watchAuditLog(setEntries, () => setEntries([])), []);

  if (entries === null) return <Skeleton rows={4} />;
  if (entries.length === 0)
    return (
      <EmptyState
        title="Nothing has been changed"
        body="Every correction to a closed round is recorded here, permanently."
      />
    );

  return (
    <Card title={`${entries.length} changes`} padded={false}>
      <div className="ledger">
        {entries.map((e) => (
          <div key={e.id} className="ledger-row">
            <div className="ledger-main">
              <div className="ledger-title">
                {e.targetType} · {e.field}
              </div>
              <div className="ledger-meta">
                {memberById(e.changedByMemberId)?.name ?? 'Unknown'} ·{' '}
                {new Date(e.changedAt).toLocaleString('en-IN')} · {e.reason}
              </div>
            </div>
            <div className="small" style={{ textAlign: 'right' }}>
              <span className="money sm muted">{String(e.oldValue)}</span>
              <span className="muted"> → </span>
              <span className="money sm">{String(e.newValue)}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
