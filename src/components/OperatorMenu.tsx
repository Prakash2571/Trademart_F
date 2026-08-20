'use client';

/**
 * Topbar operator control: shows who is signed in and offers sign in / out.
 *
 * Mirrors ConnectionPill's role (a small status control in the topbar) and
 * reuses the same Badge vocabulary so it fits the existing visual language.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Badge } from '@/components/ui';
import { useOperator } from '@/lib/operator';

export function OperatorMenu() {
  const { me, loading, logout } = useOperator();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (loading || me === null) {
    return <Badge tone="neutral" dot>operator</Badge>;
  }

  // No credentials configured on the server at all: writes are locked and the
  // operator should know why an action might refuse.
  if (!me.operatorConfigured) {
    return (
      <Badge tone="warning" dot>
        auth not configured
      </Badge>
    );
  }

  if (me.authenticated) {
    const onLogout = async () => {
      setBusy(true);
      try {
        await logout();
        router.push('/login');
      } finally {
        setBusy(false);
      }
    };
    return (
      <span className="row" style={{ gap: 8, alignItems: 'center' }}>
        <Badge tone="success" dot>
          {me.username ?? 'operator'}
        </Badge>
        <button className="btn btn--sm" onClick={onLogout} disabled={busy}>
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </span>
    );
  }

  // Configured but not signed in.
  return (
    <Link className="btn btn--sm btn--primary" href="/login">
      Sign in
    </Link>
  );
}
