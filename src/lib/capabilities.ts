'use client';

/**
 * Capability-driven UI helpers.
 *
 * The backend's GET /api/shopify/capabilities is the authority on what this
 * deployment can actually do against the connected store. The UI reads it so a
 * control is never offered for something the backend cannot perform - and, just
 * as importantly, so a disabled control explains WHY.
 *
 * The verdict logic itself lives in capabilityVerdict.ts, which imports nothing
 * at runtime and is therefore unit-testable; this module is the React binding.
 * `describeCapability` is re-exported so existing imports from '@/lib/capabilities'
 * keep working.
 *
 * The backend still enforces everything; this is UX, not security.
 */

import { useApi } from '@/hooks/useApi';
import type { ShopifyCapabilities } from '@/lib/types';

export { describeCapability } from '@/lib/capabilityVerdict';
export type { CapabilityUiStatus, CapabilityVerdict } from '@/lib/capabilityVerdict';

/** Fetches the capability report once for a page. */
export function useCapabilities() {
  return useApi<ShopifyCapabilities>('/shopify/capabilities');
}
