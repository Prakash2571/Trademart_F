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
  // Sits directly under Products: it is a product queue, and the draft/review
  // gate is worthless if nobody can find the queue it feeds.
  { href: '/products/review', label: 'Review queue', icon: '⚑' },
  { href: '/orders', label: 'Orders', icon: '⇄' },
  { href: '/customers', label: 'Customers', icon: '☺' },
  { href: '/analytics', label: 'Analytics', icon: '◔' },
  { href: '/pricing', label: 'Pricing', icon: '%' },
  { href: '/automation', label: 'Automation', icon: '⚡' },
  { href: '/suppliers', label: 'Suppliers', icon: '⛃' },
  { href: '/storefront', label: 'Storefront', icon: '◫' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
];

export function Sidebar() {
  const pathname = usePathname();

  // The most specific nav item matching the current path, so nested routes
  // (/products/review, /products/new, /products/<id>) resolve to exactly one
  // entry. /products/<id> has no nav item of its own and correctly falls back
  // to Products.
  const activeHref =
    NAV_ITEMS.filter(
      (item) => pathname === item.href || pathname?.startsWith(`${item.href}/`),
    ).sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__brand-name">Trademart</div>
        <div className="sidebar__brand-sub">E-commerce management</div>
      </div>

      <nav className="sidebar__nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          // Only the LONGEST matching href is active. A plain prefix test would
          // light up both "Products" and "Review queue" on /products/review,
          // and aria-current would be on two links at once.
          const isActive = activeHref === item.href;
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
