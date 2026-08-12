'use client';

/**
 * Primary navigation. The active route is derived from the pathname so the
 * highlight stays correct on deep links and refreshes.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { getApiBaseUrl } from '@/lib/api';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: '◧' },
  { href: '/products', label: 'Products', icon: '❑' },
  { href: '/orders', label: 'Orders', icon: '⇄' },
  { href: '/customers', label: 'Customers', icon: '☺' },
  { href: '/analytics', label: 'Analytics', icon: '◔' },
  { href: '/pricing', label: 'Pricing', icon: '%' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__brand-name">Trademart</div>
        <div className="sidebar__brand-sub">E-commerce management</div>
      </div>

      <nav className="sidebar__nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="sidebar__link-icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar__footer">
        <div>API</div>
        <div>{getApiBaseUrl()}</div>
      </div>
    </aside>
  );
}
