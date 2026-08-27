/**
 * Turning a backend capability report into a UI verdict.
 *
 * Split out of capabilities.ts so it can be tested: that module imports the
 * useApi hook (and therefore React) at runtime through the `@/` alias, which only
 * a bundler resolves. This half has no imports except a type, so it runs anywhere.
 *
 * The distinction this exists to preserve is the one an operator cannot guess:
 *
 *   SCOPE_MISSING     the code exists; grant the scope and re-authorise
 *   NOT_IMPLEMENTED   no code exists; granting a scope changes nothing
 *
 * Telling someone to grant a permission that will not help is worse than saying
 * nothing, so the two are never collapsed into "unavailable".
 *
 * The backend still enforces everything; this is UX, not security.
 */

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

/**
 * Verdict for a feature key (e.g. 'products.write', 'products.publish').
 *
 * Fails OPEN while loading or when the answer is undeterminable: the control stays
 * enabled and the backend remains the real gate. It only disables a control when
 * the backend positively reports the feature cannot be used. Failing closed here
 * would black out the console whenever the capability read itself failed, which is
 * exactly when an operator needs to get at the controls.
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
