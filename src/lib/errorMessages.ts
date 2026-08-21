/**
 * One place that turns a backend error code into something an operator can act on.
 *
 * The backend messages are already written for humans, so this does NOT replace
 * them. It adds the two things a raw message cannot carry:
 *
 *   title  - a short label, so a callout has a heading that is not a code
 *   action - what to DO about it
 *
 * Centralised because the same code appears on several pages, and an error whose
 * explanation differs between the automation page and the product page is worse
 * than one with no explanation at all.
 */

export type ErrorTone = 'danger' | 'warning' | 'info';

export interface ErrorPresentation {
  title: string;
  /** What to do next. Shown under the backend's own message. */
  action: string;
  tone: ErrorTone;
  /** True when re-running the same request could plausibly work. */
  offerRetry: boolean;
  /** True when the fix is to reload current state first. */
  offerRefresh: boolean;
}

const PRESENTATION: Record<string, ErrorPresentation> = {
  // ---- Preview / apply binding --------------------------------------------
  PREVIEW_REQUIRED: {
    title: 'Preview required',
    action: 'Run a preview, review the changes it lists, then apply from that result.',
    tone: 'info',
    offerRetry: false,
    offerRefresh: false,
  },
  PREVIEW_STALE: {
    title: 'The store changed since your preview',
    action:
      'Nothing was changed. Preview again to see what would happen with the current data, then apply that.',
    tone: 'warning',
    offerRetry: false,
    offerRefresh: true,
  },
  PREVIEW_EXPIRED: {
    title: 'Preview expired',
    action: 'Previews are short-lived because store data moves. Run a new preview.',
    tone: 'warning',
    offerRetry: false,
    offerRefresh: true,
  },
  PREVIEW_ALREADY_APPLIED: {
    title: 'Already applied',
    action:
      'This preview has been used. Check the run history below to see what it did, then preview again if more changes are needed.',
    tone: 'info',
    offerRetry: false,
    offerRefresh: true,
  },

  // ---- Concurrency ---------------------------------------------------------
  AUTOMATION_ALREADY_RUNNING: {
    title: 'Another automation run is in progress',
    action:
      'Only one run may touch the store at a time. Wait for it to finish, then preview again.',
    tone: 'info',
    offerRetry: true,
    offerRefresh: true,
  },
  PRODUCT_CHANGED: {
    title: 'This product changed in Shopify',
    action:
      'Nothing was saved, because saving would have overwritten the newer values. Refresh to see the current state, then re-apply your change.',
    tone: 'warning',
    offerRetry: false,
    offerRefresh: true,
  },
  IDEMPOTENCY_IN_PROGRESS: {
    title: 'Still processing',
    action: 'The first attempt is still running. Wait for it rather than retrying.',
    tone: 'info',
    offerRetry: true,
    offerRefresh: true,
  },
  IDEMPOTENCY_CONFLICT: {
    title: 'Request key reused',
    action:
      'This is a client bug: the same idempotency key was sent with a different request. Reload the page and try again.',
    tone: 'danger',
    offerRetry: false,
    offerRefresh: true,
  },

  // ---- Publication ---------------------------------------------------------
  PUBLICATION_FAILED: {
    title: 'Could not publish to the Online Store',
    action:
      'The product has been left as a DRAFT and is NOT visible to customers. Check that the app has the write_publications scope, then try again.',
    tone: 'danger',
    offerRetry: true,
    offerRefresh: true,
  },

  // ---- Cost / money --------------------------------------------------------
  COST_UNKNOWN: {
    title: 'Cost is unknown',
    action:
      'Trademart will not price a product it has no cost for. Enter a manual cost, or set Cost per item in Shopify.',
    tone: 'warning',
    offerRetry: false,
    offerRefresh: false,
  },
  CURRENCY_MISMATCH: {
    title: 'Currencies do not match',
    action:
      'Costs in one currency cannot be combined with a price in another without a conversion rate. Correct the cost currency.',
    tone: 'warning',
    offerRetry: false,
    offerRefresh: false,
  },

  // ---- Inventory -----------------------------------------------------------
  INVENTORY_DELTA_TOO_LARGE: {
    title: 'Stock change is unusually large',
    action:
      'Confirm the change if it is intended - the server requires an explicit acknowledgement for changes this size.',
    tone: 'warning',
    offerRetry: false,
    offerRefresh: false,
  },

  // ---- Store safety --------------------------------------------------------
  LIVE_STORE_WRITE_BLOCKED: {
    title: 'Blocked: this is a live store',
    action:
      'Automated tooling is not allowed to write to a store that is not a confirmed Shopify development store.',
    tone: 'danger',
    offerRetry: false,
    offerRefresh: false,
  },

  // ---- Shopify -------------------------------------------------------------
  SHOPIFY_DEGRADED: {
    title: 'Shopify is not responding reliably',
    action:
      'Bulk changes are paused so they do not fail halfway. Reads still work. Try again in a minute.',
    tone: 'warning',
    offerRetry: true,
    offerRefresh: true,
  },
  SHOPIFY_THROTTLED: {
    title: 'Shopify rate limit reached',
    action: 'Wait a few seconds and try again, or work in smaller batches.',
    tone: 'warning',
    offerRetry: true,
    offerRefresh: false,
  },
  SHOPIFY_TIMEOUT: {
    title: 'Shopify timed out',
    action:
      'The request may or may not have been applied. Refresh to see the current state before retrying.',
    tone: 'warning',
    offerRetry: false,
    offerRefresh: true,
  },
  SHOPIFY_SCOPE_MISSING: {
    title: 'Missing Shopify permission',
    action:
      'Add the named access scope to the app configuration, release a new app version, then reinstall or update the app on the store.',
    tone: 'danger',
    offerRetry: false,
    offerRefresh: false,
  },
  SHOPIFY_NOT_CONFIGURED: {
    title: 'Shopify is not configured',
    action: 'Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET on the backend and restart it.',
    tone: 'danger',
    offerRetry: false,
    offerRefresh: false,
  },
  SHOPIFY_UNAUTHORIZED: {
    title: 'Shopify rejected the credentials',
    action: 'Check the app credentials and that the app is installed on this store.',
    tone: 'danger',
    offerRetry: false,
    offerRefresh: false,
  },

  // ---- Platform ------------------------------------------------------------
  AUTOMATION_DISABLED: {
    title: 'Storefront writes are switched off',
    action:
      'Set AUTOMATION_ENABLED=true on the backend to allow changes. Preview works without it.',
    tone: 'info',
    offerRetry: false,
    offerRefresh: false,
  },
  AUTOMATION_PRECONDITION_FAILED: {
    title: 'Not safe to run',
    action: 'Resolve the reason below, then preview again.',
    tone: 'warning',
    offerRetry: false,
    offerRefresh: false,
  },
  DATABASE_UNAVAILABLE: {
    title: 'No database connection',
    action:
      'This feature stores data in MongoDB. Set MONGODB_URI on the backend, or check the connection.',
    tone: 'danger',
    offerRetry: true,
    offerRefresh: false,
  },
  UNAUTHORIZED: {
    title: 'Not signed in',
    action: 'Sign in again - your session may have expired.',
    tone: 'info',
    offerRetry: false,
    offerRefresh: true,
  },
  CSRF_INVALID: {
    title: 'Security token expired',
    action: 'Reload the page and try again.',
    tone: 'info',
    offerRetry: false,
    offerRefresh: true,
  },
  RATE_LIMITED: {
    title: 'Too many requests',
    action: 'Slow down and try again shortly.',
    tone: 'warning',
    offerRetry: true,
    offerRefresh: false,
  },
  VALIDATION_ERROR: {
    title: 'Check the values',
    action: 'The request was rejected before anything changed. Correct it and resubmit.',
    tone: 'warning',
    offerRetry: false,
    offerRefresh: false,
  },
  BACKEND_UNREACHABLE: {
    title: 'Cannot reach the backend',
    action: 'Check that the Trademart backend is running and reachable from this browser.',
    tone: 'danger',
    offerRetry: true,
    offerRefresh: false,
  },
};

const FALLBACK: ErrorPresentation = {
  title: 'Something went wrong',
  action: 'If this keeps happening, quote the request id below when reporting it.',
  tone: 'danger',
  offerRetry: true,
  offerRefresh: true,
};

/** Presentation for a backend error code. Never throws; unknown codes fall back. */
export function presentError(code: string): ErrorPresentation {
  return PRESENTATION[code] ?? FALLBACK;
}

/**
 * True for codes that mean "nothing was changed".
 *
 * Worth stating explicitly in the UI: after a refused write, the most urgent
 * question is whether the store was left half-modified, and for these it was not.
 */
export function isNoOpFailure(code: string): boolean {
  return (
    code === 'PREVIEW_REQUIRED' ||
    code === 'PREVIEW_STALE' ||
    code === 'PREVIEW_EXPIRED' ||
    code === 'PRODUCT_CHANGED' ||
    code === 'INVENTORY_DELTA_TOO_LARGE' ||
    code === 'LIVE_STORE_WRITE_BLOCKED' ||
    code === 'AUTOMATION_ALREADY_RUNNING' ||
    code === 'AUTOMATION_DISABLED' ||
    code === 'VALIDATION_ERROR' ||
    code === 'COST_UNKNOWN' ||
    code === 'CURRENCY_MISMATCH'
  );
}
