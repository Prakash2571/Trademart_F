'use client';

/**
 * The app shell: sidebar + topbar + content, with a slide in/out sidebar.
 *
 * A client component because the collapse state lives here and must survive route changes
 * (the root layout does not remount between navigations, so this state persists). The
 * preference is also mirrored to localStorage so a reload keeps the sidebar where the
 * operator left it.
 *
 * The slide is CSS-only (a transition on the sidebar's margin), toggled by a class on the
 * shell — see .shell--nav-collapsed in globals.css.
 */

import { useCallback, useEffect, useState } from 'react';

import { AuthGate } from './AuthGate';
import { ConnectionPill } from './ConnectionPill';
import { LiveStoreBanner } from './LiveStoreBanner';
import { OperatorMenu } from './OperatorMenu';
import { Sidebar } from './Sidebar';

const STORAGE_KEY = 'trademart:nav-collapsed';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  // Restore the saved preference after mount (localStorage is client-only, so this cannot
  // run during SSR without a hydration mismatch).
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      /* localStorage unavailable (private mode etc.) - default to expanded. */
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <div className={`shell${collapsed ? ' shell--nav-collapsed' : ''}`}>
      <Sidebar />
      <div className="main">
        <header className="topbar">
          <div className="topbar__left">
            <button
              type="button"
              className="nav-toggle"
              onClick={toggle}
              aria-label={collapsed ? 'Show navigation' : 'Hide navigation'}
              aria-expanded={!collapsed}
              title={collapsed ? 'Show navigation' : 'Hide navigation'}
            >
              <span aria-hidden="true">☰</span>
            </button>
            <div className="topbar__title">Trademart</div>
          </div>
          <div className="topbar__right">
            <OperatorMenu />
            <ConnectionPill />
          </div>
        </header>
        <main className="content">
          {/* Inside AuthGate: the banner queries the API, which requires a session when
              OPERATOR_PROTECT_READS=true, and an unsigned-in visitor has nothing to be
              warned about yet. */}
          <AuthGate>
            <LiveStoreBanner />
            {children}
          </AuthGate>
        </main>
      </div>
    </div>
  );
}
