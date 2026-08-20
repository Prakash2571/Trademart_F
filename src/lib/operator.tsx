'use client';

/**
 * Operator auth state for the whole app.
 *
 * Loads GET /api/operator/me once and shares it. `me` is the single source of
 * truth for "is someone signed in" and "does this server even have auth
 * configured". Components read it to show a login prompt, an operator pill, or
 * to disable write actions.
 *
 * The session itself lives in an HttpOnly cookie the browser manages - this
 * context never holds a token, only the boolean/username summary the backend
 * reports.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { apiGet, apiPost, ApiError } from '@/lib/api';
import type { OperatorLogin, OperatorMe } from '@/lib/types';

interface OperatorContextValue {
  me: OperatorMe | null;
  loading: boolean;
  /** Re-reads /me, e.g. after login or logout. */
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const OperatorContext = createContext<OperatorContextValue | null>(null);

export function OperatorProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<OperatorMe | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await apiGet<OperatorMe>('/operator/me');
      setMe(result.data);
    } catch {
      // /me is designed to always answer 200; a failure here means the backend
      // is unreachable. Treat as "not authenticated, auth unknown" rather than
      // crashing the shell.
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      // Throws ApiError('LOGIN_FAILED') on bad credentials; the caller shows it.
      await apiPost<OperatorLogin>('/operator/login', { username, password });
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    try {
      await apiPost('/operator/logout', {});
    } catch (error) {
      // Logout must not get stuck: a CSRF/expiry error still means "sign me out".
      if (!(error instanceof ApiError)) throw error;
    }
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <OperatorContext.Provider value={{ me, loading, refresh, login, logout }}>
      {children}
    </OperatorContext.Provider>
  );
}

export function useOperator(): OperatorContextValue {
  const value = useContext(OperatorContext);
  if (value === null) {
    throw new Error('useOperator must be used within an OperatorProvider.');
  }
  return value;
}
