'use client';

/**
 * Blocks the console when the backend requires a signed-in operator for reads
 * (OPERATOR_PROTECT_READS=true) and nobody is signed in.
 *
 * When reads are NOT protected - the default - this renders its children
 * untouched, so an existing dashboard is never blacked out by deploying auth.
 * Individual write actions still fail with UNAUTHORIZED and are handled where
 * they are triggered; this gate is only about whole-console read protection.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { EmptyState } from '@/components/ui';
import { useOperator } from '@/lib/operator';

/** Routes that must render even when reads are protected and nobody is in. */
const PUBLIC_PATHS = new Set(['/login']);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { me, loading } = useOperator();
  const pathname = usePathname();

  // The login page must never be gated - otherwise protecting reads creates a
  // dead end where the only way in is itself blocked.
  if (pathname !== null && PUBLIC_PATHS.has(pathname)) return <>{children}</>;

  // While auth state is unknown, render nothing rather than flashing the
  // console and then yanking it away.
  if (loading) return null;

  const mustSignIn = me !== null && me.readsProtected && !me.authenticated;
  if (!mustSignIn) return <>{children}</>;

  return (
    <EmptyState
      icon="🔒"
      title="Sign in required"
      description="This Trademart console requires an authenticated operator."
      action={
        <Link className="btn btn--primary" href="/login">
          Go to sign in
        </Link>
      }
    />
  );
}
