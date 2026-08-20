'use client';

/**
 * Operator sign-in.
 *
 * Posts to the backend, which sets an HttpOnly session cookie the browser
 * manages. No token is ever stored in JavaScript. On success it refreshes the
 * shared operator state and returns to the console.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { Callout, Card, PageHeader } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useOperator } from '@/lib/operator';

/**
 * useSearchParams() must sit inside a Suspense boundary, or `next build` fails
 * during static generation. The page shell provides that boundary and the form
 * itself reads the params.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { me, loading, login } = useOperator();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/dashboard';

  const [username, setUsername] = useState('operator');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in? Don't show the form - bounce to where they were going.
  useEffect(() => {
    if (!loading && me?.authenticated) router.replace(next);
  }, [loading, me, next, router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      router.replace(next);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError('UNKNOWN', 'Sign-in failed.', 0),
      );
    } finally {
      setBusy(false);
    }
  };

  const loginUnavailable = me !== null && !me.loginConfigured;

  return (
    <>
      <PageHeader
        title="Sign in"
        description="Operator access to the Trademart control console."
      />
      <div style={{ maxWidth: 420 }}>
        <Card title="Operator sign in">
          {loginUnavailable ? (
            <Callout tone="warning" title="Password login is not configured">
              The backend has no <span className="mono">OPERATOR_PASSWORD_HASH</span> and{' '}
              <span className="mono">SESSION_SECRET</span> set. Generate them with{' '}
              <span className="mono">npm run operator:hash</span> and restart the backend.
            </Callout>
          ) : (
            <form onSubmit={submit}>
              <div className="stack">
                <div className="field">
                  <label className="field__label" htmlFor="operator-username">
                    Username
                  </label>
                  <input
                    id="operator-username"
                    className="input"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    disabled={busy}
                  />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="operator-password">
                    Password
                  </label>
                  <input
                    id="operator-password"
                    className="input"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={busy}
                  />
                </div>

                {error !== null && (
                  <Callout tone="danger" title="Could not sign in">
                    {error.message}
                  </Callout>
                )}

                <div>
                  <button
                    className="btn btn--primary"
                    type="submit"
                    disabled={busy || password.length === 0}
                  >
                    {busy ? 'Signing in…' : 'Sign in'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
