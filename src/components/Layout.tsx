import { useState, type ComponentType } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Avatar } from './ui';
import {
  AuditIcon,
  HandoverIcon,
  HomeIcon,
  MoreIcon,
  PaymentIcon,
  ReportIcon,
  RoundsIcon,
  ScaleIcon,
  SettingsIcon,
  UsersIcon,
  WalletIcon,
} from './Icons';

interface NavItem {
  to: string;
  label: string;
  Icon: ComponentType<{ size?: number }>;
  adminOnly?: boolean;
  coordinatorOnly?: boolean;
}

const PRIMARY: NavItem[] = [
  { to: '/', label: 'Home', Icon: HomeIcon },
  { to: '/rounds', label: 'Rounds', Icon: RoundsIcon },
  { to: '/payments', label: 'Payments', Icon: PaymentIcon },
  { to: '/mine', label: 'Mine', Icon: WalletIcon },
];

const SECONDARY: NavItem[] = [
  { to: '/members', label: 'Members', Icon: UsersIcon },
  { to: '/reports', label: 'Reports', Icon: ReportIcon },
  { to: '/pairs', label: 'Who owes whom', Icon: ScaleIcon },
  { to: '/handover', label: 'Handover', Icon: HandoverIcon, coordinatorOnly: true },
  { to: '/settlement', label: 'Settlement', Icon: SettingsIcon, adminOnly: true },
  { to: '/audit', label: 'Audit log', Icon: AuditIcon, adminOnly: true },
];

const TITLES: Record<string, string> = {
  '/': 'Nikah Kuri',
  '/rounds': 'Kuri rounds',
  '/payments': 'Payments',
  '/mine': 'My contributions',
  '/members': 'Members',
  '/reports': 'Reports',
  '/pairs': 'Who owes whom',
  '/handover': 'Team handover',
  '/settlement': 'Settlement',
  '/audit': 'Audit log',
};

export default function Layout() {
  const { member, isAdmin, isCoordinator, signOutNow, user } = useAuth();
  const { pathname } = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  const visible = (item: NavItem) =>
    (!item.adminOnly || isAdmin) && (!item.coordinatorOnly || isCoordinator);

  const secondary = SECONDARY.filter(visible);
  const title = TITLES[pathname] ?? 'Nikah Kuri';

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">
          <span className="brand-mark">N</span>
          <span>
            <span className="brand-name">Nikah Kuri</span>
            <br />
            <span className="brand-sub">Team ICON</span>
          </span>
        </div>

        {PRIMARY.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className="nav-link">
            <Icon size={18} />
            {label}
          </NavLink>
        ))}

        <div className="nav-section">Group</div>
        {secondary.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className="nav-link">
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="main">
        <header className="topbar">
          <h1>{title}</h1>
          {member && (
            <>
              <span className="badge">{member.role}</span>
              <Avatar name={member.name} photoUrl={member.photoUrl} />
            </>
          )}
          <button className="btn ghost sm" onClick={signOutNow} title={user?.email ?? ''}>
            Sign out
          </button>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>

      <nav className="bottom-nav">
        {PRIMARY.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
        <button onClick={() => setSheetOpen(true)}>
          <MoreIcon size={20} />
          More
        </button>
      </nav>

      {sheetOpen && (
        <div
          className="dialog-backdrop"
          onClick={(e) => e.target === e.currentTarget && setSheetOpen(false)}
        >
          <div className="dialog">
            <div className="dialog-head">
              <h2>More</h2>
            </div>
            <div className="dialog-body">
              <div className="stack">
                {secondary.map(({ to, label, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className="nav-link"
                    onClick={() => setSheetOpen(false)}
                  >
                    <Icon size={18} />
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
