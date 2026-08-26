import type { ReactNode } from 'react';
import { money as fmtMoney } from '../lib/format';
import { CloseIcon } from './Icons';
import type { Team } from '../domain/types';

// --- money ----------------------------------------------------------------

type MoneySize = 'hero' | 'lg' | 'row' | 'sm';
type MoneyTone = 'default' | 'paid' | 'owed' | 'muted';

export function Money({
  amount,
  size = 'row',
  tone = 'default',
}: {
  amount: number | null | undefined;
  size?: MoneySize;
  tone?: MoneyTone;
}) {
  const sizeClass = size === 'row' ? 'row-size' : size;
  const toneClass = tone === 'default' ? '' : ` ${tone}`;
  return <span className={`money ${sizeClass}${toneClass}`}>{fmtMoney(amount)}</span>;
}

// --- layout ---------------------------------------------------------------

export function Card({
  title,
  action,
  children,
  tight,
  padded = true,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  tight?: boolean;
  padded?: boolean;
}) {
  return (
    <section className="card">
      {title && (
        <header className="card-head">
          <h2>{title}</h2>
          {action}
        </header>
      )}
      {padded ? <div className={`card-body${tight ? ' tight' : ''}`}>{children}</div> : children}
    </section>
  );
}

export function Stat({
  label,
  amount,
  note,
  tone = 'default',
}: {
  label: string;
  amount: number;
  note?: ReactNode;
  tone?: MoneyTone;
}) {
  return (
    <section className="card stat">
      <div className="stat-label">{label}</div>
      <Money amount={amount} size="lg" tone={tone} />
      {note && <div className="stat-note">{note}</div>}
    </section>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'paid' | 'owed' | 'pending' | 'info' | 'gold';
}) {
  return <span className={`badge${tone === 'neutral' ? '' : ` ${tone}`}`}>{children}</span>;
}

export function Progress({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  const tone = pct >= 100 ? '' : pct >= 60 ? ' warn' : ' short';
  return (
    <div className={`progress${tone}`} role="progressbar" aria-valuenow={Math.round(pct)}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {body && <p className="small">{body}</p>}
      {action && <div style={{ marginTop: 'var(--s4)' }}>{action}</div>}
    </div>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'neutral';
  children: ReactNode;
}) {
  return <div className={`notice${tone === 'neutral' ? '' : ` ${tone}`}`}>{children}</div>;
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="stack" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}

// --- identity -------------------------------------------------------------

export function Avatar({
  name,
  photoUrl,
  large,
}: {
  name: string;
  photoUrl?: string;
  large?: boolean;
}) {
  const cls = `avatar${large ? ' lg' : ''}`;
  if (photoUrl) return <img className={cls} src={photoUrl} alt="" />;
  const label = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <span className={cls} aria-hidden="true">
      {label}
    </span>
  );
}

export function TeamDot({ team }: { team: Team }) {
  return <span className="team-dot" style={{ background: `var(--team-${team})` }} />;
}

// --- dialog ---------------------------------------------------------------

export function Dialog({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`dialog${wide ? ' lg' : ''}`}>
        <header className="dialog-head">
          <h2>{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </div>
  );
}

// --- forms ----------------------------------------------------------------

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {error ? <span className="error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
