/** 1.5px-stroke line icons, Lucide-style. Kept inline to avoid a dependency. */

type Props = { size?: number; className?: string };

function Svg({ size = 18, className, children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </Svg>
);

export const UsersIcon = (p: Props) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    <path d="M16 5.2a3.2 3.2 0 0 1 0 6.1" />
    <path d="M18 14.9c2 .7 3 2.6 3 5.1" />
  </Svg>
);

export const RoundsIcon = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7v5l3.2 2" />
  </Svg>
);

export const PaymentIcon = (p: Props) => (
  <Svg {...p}>
    <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
    <path d="M2.5 10h19" />
    <path d="M6.5 14.5h4" />
  </Svg>
);

export const ReportIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M5 21V10" />
    <path d="M12 21V4" />
    <path d="M19 21v-7" />
    <path d="M3 21h18" />
  </Svg>
);

export const WalletIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3" />
    <rect x="3" y="7.5" width="18" height="11.5" rx="2.5" />
    <circle cx="16.5" cy="13.2" r="1.2" />
  </Svg>
);

export const ScaleIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M12 4v16" />
    <path d="M7 20h10" />
    <path d="M4 8h16" />
    <path d="M4 8 1.5 14h5L4 8Z" />
    <path d="M20 8l-2.5 6h5L20 8Z" />
  </Svg>
);

export const HandoverIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M3 12.5 7.5 8l4 3.5" />
    <path d="M11.5 11.5h6a2 2 0 0 1 0 4h-4" />
    <path d="M21 11.5 16.5 16l-4-3.5" />
  </Svg>
);

export const AuditIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M15 3v4h4" />
    <path d="M9 12h6" />
    <path d="M9 16h4" />
  </Svg>
);

export const AlertIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M12 4 2.8 20h18.4L12 4Z" />
    <path d="M12 10v4" />
    <path d="M12 17.2h.01" />
  </Svg>
);

export const CheckIcon = (p: Props) => (
  <Svg {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Svg>
);

export const PlusIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Svg>
);

export const CloseIcon = (p: Props) => (
  <Svg {...p}>
    <path d="m6 6 12 12" />
    <path d="m18 6-12 12" />
  </Svg>
);

export const LockIcon = (p: Props) => (
  <Svg {...p}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
  </Svg>
);

export const MoreIcon = (p: Props) => (
  <Svg {...p}>
    <circle cx="5" cy="12" r="1.4" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="19" cy="12" r="1.4" />
  </Svg>
);

export const SettingsIcon = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" />
  </Svg>
);

export const GlobeIcon = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3c2.5 2.7 3.8 5.7 3.8 9S14.5 18.3 12 21c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z" />
  </Svg>
);
