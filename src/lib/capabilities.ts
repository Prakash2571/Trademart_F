'use client';

/**
 * Capability-driven UI helpers.
 *
 * The backend's GET /api/shopify/capabilities is the authority on what this
 * deployment can actually do against the connected store. The UI reads it so a
 * control is never offered for something the backend cannot perform - and, just
 * as importantly, so a disabled control explains WHY, distinguishing the two
 * very different reasons a feature is unavailable:
 *
 *   SCOPE_MISSING     the code exists; grant the scope and re-authorise
 *   NOT_IMPLEMENTED   no code exists; granting a scope changes nothing
 *
 * The backend still enforces everything; this is UX, not security.
 */

import { useApi } from '@/hooks/useApi';
import type { ShopifyCapabilities } from '@/lib/types';

export type CapabilityUiStatus =
  | 'AVAILABLE'
  | 'SCOPE_MISSING'
  | 'NOT_IMPLEMENTED'
  | 'SCOPES_UNKNOWN'
  | 'LOADING';

export interface CapabilityVerdict {
  /** Whether the control should be enabled. */
  available: boolean;
  status: CapabilityUiStatus;
  /** A sentence to show on a disabled control, or null when enabled/loading. */
  reason: string | null;
}

/** Fetches the capability report once for a page. */
export function useCapabilities() {
  return useApi<ShopifyCapabilities>('/shopify/capabilities');
}

/**
 * Verdict for a feature key (e.g. 'products.write', 'products.publish').
 *
 * Fails OPEN while loading or when the answer is undeterminable: the control
 * stays enabled and the backend remains the real gate. It only disables a
 * control when the backend positively reports the feature cannot be used.
 */
export function describeCapability(
  caps: ShopifyCapabilities | null,
  key: string,
): CapabilityVerdict {
  if (caps === null) {
    return { available: true, status: 'LOADING', reason: null };
  }

  const feature = caps.features.find((entry) => entry.key === key);
  if (feature === undefined) {
    // Unknown key: do not block on a catalogue gap; the backend decides.
    return { available: true, status: 'AVAILABLE', reason: null };
  }

  switch (feature.status) {
    case 'AVAILABLE':
      return { available: true, status: 'AVAILABLE', reason: null };
    case 'SCOPE_MISSING': {
      const scopes = feature.missingScopes.join(', ') || feature.requiredScopes.join(', ');
      return {
        available: false,
        status: 'SCOPE_MISSING',
        reason: `Missing Shopify permission: ${scopes}. Add the scope in the Shopify Dev Dashboard, release a new app version, then update the install.`,
      };
    }
    case 'NOT_IMPLEMENTED':
      return {
        available: false,
        status: 'NOT_IMPLEMENTED',
        reason:
          feature.note ??
          'This capability is not implemented, so it is unavailable regardless of scopes.',
      };
    case 'SCOPES_UNKNOWN':
      // A static token does not report scopes; let the backend decide.
      return {
        available: true,
        status: 'SCOPES_UNKNOWN',
        reason: null,
      };
    default:
      return { available: true, status: 'AVAILABLE', reason: null };
  }
}
