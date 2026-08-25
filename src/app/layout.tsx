import type { Metadata } from 'next';

import { AppShell } from '@/components/AppShell';
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
            content (AuthGate), since both read the shared auth state. AppShell holds
            the slide in/out sidebar state and renders the topbar + content. */}
        <OperatorProvider>
          <AppShell>{children}</AppShell>
        </OperatorProvider>
      </body>
    </html>
  );
}
