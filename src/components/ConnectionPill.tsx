'use client';

/**
 * Live Shopify connection indicator in the top bar.
 *
 * Uses /shopify/status, which always answers 200 with a diagnosis rather than
 * throwing, so this pill can distinguish "not configured" from "token rejected"
 * from "backend down".
 */

import { useApi } from '@/hooks/useApi';
import type { ShopifyStatus } from '@/lib/types';
import { Badge } from './ui';

export function ConnectionPill() {
  const { data, loading, error } = useApi<ShopifyStatus>('/shopify/status');

  if (loading) {
    return (
      <Badge tone="neutral" dot>
        Checking…
      </Badge>
    );
  }

  if (error) {
    return (
      <Badge tone="danger" dot>
        {error.code === 'BACKEND_UNREACHABLE' ? 'Backend offline' : 'Status unavailable'}
      </Badge>
    );
  }

  if (!data) return null;

  if (!data.configured) {
    return (
      <Badge tone="warning" dot>
        Shopify not configured
      </Badge>
    );
  }

  if (!data.connected) {
    return (
      <Badge tone="danger" dot>
        Shopify error
      </Badge>
    );
  }

  return (
    <Badge tone="success" dot>
      {data.shop?.myshopifyDomain ?? 'Shopify connected'}
    </Badge>
  );
}
