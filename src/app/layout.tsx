import type { Metadata } from 'next';

import { AuthGate } from '@/components/AuthGate';
import { ConnectionPill } from '@/components/ConnectionPill';
import { OperatorMenu } from '@/components/OperatorMenu';
import { Sidebar } from '@/components/Sidebar';
import { OperatorProvider } from '@/lib/operator';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trademart',
  description: 'E-commerce management and automation for Shopify stores',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* OperatorProvider must wrap both the topbar (OperatorMenu) and the
            content (AuthGate), since both read the shared auth state. */}
        <OperatorProvider>
          <div className="shell">
            <Sidebar />
            <div className="main">
              <header className="topbar">
                <div className="topbar__title">Trademart</div>
                <div className="topbar__right">
                  <OperatorMenu />
                  <ConnectionPill />
                </div>
              </header>
              <main className="content">
                <AuthGate>{children}</AuthGate>
              </main>
            </div>
          </div>
        </OperatorProvider>
      </body>
    </html>
  );
}
