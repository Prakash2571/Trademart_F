import type { Metadata } from 'next';

import { ConnectionPill } from '@/components/ConnectionPill';
import { Sidebar } from '@/components/Sidebar';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trademart',
  description: 'E-commerce management and automation for Shopify stores',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Sidebar />
          <div className="main">
            <header className="topbar">
              <div className="topbar__title">Trademart</div>
              <div className="topbar__right">
                <ConnectionPill />
              </div>
            </header>
            <main className="content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
