'use client';

/**
 * Small data-fetching hook: loading / error / data / refetch.
 *
 * Deliberately hand-rolled rather than pulling in a data-fetching library for
 * seven read-only pages.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, apiGet } from '@/lib/api';
import type { PageMeta } from '@/lib/types';

export interface UseApiState<T> {
  data: T | null;
  meta: (PageMeta & Record<string, unknown>) | undefined;
  loading: boolean;
  error: ApiError | null;
  refetch: () => void;
}

export function useApi<T>(path: string | null, deps: unknown[] = []): UseApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [meta, setMeta] = useState<(PageMeta & Record<string, unknown>) | undefined>();
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Guards against a slow response from a previous path overwriting newer data.
  const requestIdRef = useRef(0);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (path === null) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setLoading(true);
    setError(null);

    apiGet<T>(path, controller.signal)
      .then((result) => {
        if (requestIdRef.current !== requestId) return;
        setData(result.data);
        setMeta(result.meta);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        if (requestIdRef.current !== requestId) return;
        setError(
          caught instanceof ApiError
            ? caught
            : new ApiError('UNKNOWN', 'An unexpected error occurred.', 0),
        );
        setData(null);
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return;
        setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, reloadToken, ...deps]);

  return { data, meta, loading, error, refetch };
}
