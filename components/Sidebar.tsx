'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SyncStatus from './SyncStatus';
import {
  CartIcon,
  BoxIcon,
  HistoryIcon,
  CashIcon,
  ChartIcon,
  SettingsIcon,
} from './icons';

const NAV = [
  { href: '/pos', label: 'Verkauf', Icon: CartIcon },
  { href: '/inventory', label: 'Lager', Icon: BoxIcon },
  { href: '/history', label: 'Verlauf', Icon: HistoryIcon },
  { href: '/closing', label: 'Tagesabschluss', Icon: CashIcon },
  { href: '/analytics', label: 'Analyse', Icon: ChartIcon },
  { href: '/settings', label: 'Einstellungen', Icon: SettingsIcon },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-gray-200">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent font-bold text-white">
          P
        </div>
        <div>
          <div className="font-semibold text-white">PointOS</div>
          <div className="text-[11px] text-gray-400">Kasse & Lager</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-accent text-white'
                  : 'text-gray-300 hover:bg-sidebar-hover hover:text-white'
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-4 pt-2">
        <SyncStatus />
        <p className="mt-3 px-1 text-[10px] leading-tight text-gray-500">
          Kein zertifiziertes Kassensystem (Phase 1). Kleinunternehmer §19 UStG.
        </p>
      </div>
    </aside>
  );
}
