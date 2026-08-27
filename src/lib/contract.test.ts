/**
 * Cross-repository contract fixtures.
 *
 * WHAT BREAKS WITHOUT THIS
 * ------------------------
 * This console and Trademart_B are separate repositories with separate CI. Nothing
 * stops a backend change from renaming a field, dropping the nested `error` object or
 * changing a status code - and the failure would surface as a blank panel or a
 * mis-worded error in the UI, days later, with no test anywhere going red.
 *
 * These fixtures are the shapes this frontend RELIES on, written out literally and
 * fed through the real client. They are not a mock of convenience: each one is copied
 * from what the backend actually emits (buildErrorBody in common/errorBody.ts,
 * sendSuccess in common/http.ts), and the comment on each says which backend module
 * produces it. If the backend changes one of these shapes, the corresponding fixture
 * here is what has to be updated - which is exactly the review conversation that
 * should happen.
 *
 * Deliberately NOT a shared package. Two repositories that deploy independently and a
 * handful of shapes do not justify a publish-and-version workflow; a fixture file with
 * a pointer at the producing module gets the same protection with none of the
 * coupling.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { ApiError, apiGet, apiPost } from './api';
import { presentError } from './errorMessages';

const realFetch = globalThis.fetch;
const realDocument = (globalThis as { document?: unknown }).document;

let respond: () => Response;

beforeEach(() => {
  respond = () => new Response('{}', { status: 200 });
  globalThis.fetch = (async () => respond()) as typeof globalThis.fetch;
  (globalThis as { document?: unknown }).document = { cookie: '' };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realDocument === undefined) delete (globalThis as { document?: unknown }).document;
  else (globalThis as { document?: unknown }).document = realDocument;
});

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// ---------------------------------------------------------------------------
// Fixtures. Each mirrors a specific backend producer.
// ---------------------------------------------------------------------------

/** Trademart_B common/http.ts -> sendSuccess(res, data, meta). */
const SUCCESS_ENVELOPE = {
  success: true,
  data: { items: [{ id: 'gid://shopify/Product/1' }] },
  meta: { count: 1, hasMore: false },
};

/** Trademart_B common/errorBody.ts -> buildErrorBody. Both shapes, always. */
const FAILURE_ENVELOPE = {
  success: false,
  code: 'PRODUCT_CHANGED',
  message: 'The product changed in Shopify since you read it.',
  details: { shopifyProductId: 'gid://shopify/Product/1' },
  requestId: 'req-abc123',
  error: {
    code: 'PRODUCT_CHANGED',
    message: 'The product changed in Shopify since you read it.',
    requestId: 'req-abc123',
    details: { shopifyProductId: 'gid://shopify/Product/1' },
  },
};

/** Trademart_B auth/operator/operator.controller.ts -> GET /api/operator/me. */
const OPERATOR_ME = {
  success: true,
  data: {
    authenticated: true,
    username: 'operator',
    method: 'SESSION',
    loginConfigured: true,
    apiKeyConfigured: false,
    readsProtected: true,
  },
};

/** Trademart_B common/rateLimit.ts -> every 429. */
const RATE_LIMITED = {
  success: false,
  code: 'RATE_LIMITED',
  message: 'Too many requests. Please slow down.',
  requestId: 'req-429',
  error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.', requestId: 'req-429' },
};

describe('success envelope', () => {
  it('unwraps data and meta as the backend sends them', () => {
    // If the backend ever stopped wrapping in { success, data }, every page in this
    // console would render empty with no error.
    respond = () => json(SUCCESS_ENVELOPE);

    return apiGet<{ items: unknown[] }>('/shopify/products').then((result) => {
      assert.deepEqual(result.data, SUCCESS_ENVELOPE.data);
      assert.equal(result.meta?.count, 1);
      assert.equal(result.status, 200);
    });
  });

  it('surfaces 207 as a partial success rather than a clean one', async () => {
    // POST /api/shopify/products answers 207 when the product was created but not
    // published. Treating that as 201 would tell an operator a product is live when it
    // is invisible to customers.
    respond = () => json({ success: true, data: { id: '1', partialSuccess: true } }, 207);

    const result = await apiPost('/shopify/products', { title: 'x' });
    assert.equal(result.status, 207);
  });
});

describe('failure envelope', () => {
  it('reads the backend code, message, details and requestId', async () => {
    respond = () => json(FAILURE_ENVELOPE, 409, { 'X-Request-ID': 'req-abc123' });

    const error = (await apiGet('/shopify/products/1').catch((caught: unknown) => caught)) as ApiError;

    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'PRODUCT_CHANGED');
    assert.equal(error.status, 409);
    assert.equal(error.requestId, 'req-abc123');
    assert.deepEqual(error.details, FAILURE_ENVELOPE.details);
  });

  it('has a presentation for every code in the shared taxonomy', () => {
    // The codes this console makes UI decisions about. A backend that stops sending one
    // is fine; a console with no explanation for one is not - the operator gets the
    // generic fallback for something we know how to explain.
    const CODES = [
      'VALIDATION_ERROR',
      'UNAUTHORIZED',
      'CSRF_INVALID',
      'RATE_LIMITED',
      'DATABASE_UNAVAILABLE',
      'PRODUCT_CHANGED',
      'PREVIEW_STALE',
      'PREVIEW_EXPIRED',
      'PREVIEW_REQUIRED',
      'PREVIEW_ALREADY_APPLIED',
      'AUTOMATION_ALREADY_RUNNING',
      'AUTOMATION_DISABLED',
      'AUTOMATION_PRECONDITION_FAILED',
      'IDEMPOTENCY_CONFLICT',
      'IDEMPOTENCY_IN_PROGRESS',
      'COST_UNKNOWN',
      'CURRENCY_MISMATCH',
      'INVENTORY_DELTA_TOO_LARGE',
      'LIVE_STORE_WRITE_BLOCKED',
      'PUBLICATION_FAILED',
      'SHOPIFY_DEGRADED',
      'SHOPIFY_THROTTLED',
      'SHOPIFY_TIMEOUT',
      'SHOPIFY_SCOPE_MISSING',
      'SHOPIFY_NOT_CONFIGURED',
      'SHOPIFY_UNAUTHORIZED',
      'RECOMMENDATION_CHANGED',
      'RESEARCH_PUSH_IN_PROGRESS',
      'RESEARCH_ALREADY_PUSHED',
      'PUSH_CLAIM_LOST',
      'RESEARCH_SUPPLIER_UNAVAILABLE',
      'RESEARCH_SUPPLIER_UNVERIFIED',
      'RESEARCH_SUPPLIER_STALE',
      'RESEARCH_SUPPLIER_VARIANTS',
      'RESEARCH_PUSH_SAFETY',
      'WEBHOOK_NOT_PERSISTED',
      'BACKEND_UNREACHABLE',
    ];

    const generic = presentError('A_CODE_NOBODY_HAS_SEEN').title;
    const unexplained = CODES.filter((code) => presentError(code).title === generic);

    assert.deepEqual(
      unexplained,
      [],
      `these backend codes fall through to the generic message: ${unexplained.join(', ')}`,
    );
  });

  it('a 429 carries a requestId, so it can be correlated', async () => {
    // Regression guard for a real gap: rate-limit responses used to be a static body
    // with no requestId, which made the most commonly reported failure the least
    // diagnosable.
    respond = () => json(RATE_LIMITED, 429, { 'X-Request-ID': 'req-429' });

    const error = (await apiGet('/shopify/products').catch((caught: unknown) => caught)) as ApiError;

    assert.equal(error.code, 'RATE_LIMITED');
    assert.equal(error.requestId, 'req-429');
    assert.equal(presentError(error.code).offerRetry, true);
  });
});

describe('session contract', () => {
  it('reads the fields AuthGate depends on', async () => {
    // AuthGate blocks the console on `readsProtected && !authenticated`. If the backend
    // renamed either field, the gate would silently stop blocking - which in production
    // (where reads ARE protected) means every page renders its own 401 instead.
    respond = () => json(OPERATOR_ME);

    const result = await apiGet<{
      authenticated: boolean;
      readsProtected: boolean;
      username: string | null;
    }>('/operator/me');

    assert.equal(result.data.authenticated, true);
    assert.equal(result.data.readsProtected, true);
    assert.equal(result.data.username, 'operator');
  });

  it('sends the CSRF header on a mutation, which the backend requires for cookie auth', async () => {
    (globalThis as { document: { cookie: string } }).document = {
      cookie: 'trademart_csrf=token-value',
    };
    let sent: Record<string, string> = {};
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      sent = (init?.headers ?? {}) as Record<string, string>;
      return json({ success: true, data: {} });
    }) as typeof globalThis.fetch;

    await apiPost('/automation/apply', { previewId: 'p1' });

    // Header name and cookie name are both part of the contract with
    // auth/operator/cookies.ts.
    assert.equal(sent['X-CSRF-Token'], 'token-value');
  });
});

describe('endpoint paths this console depends on', () => {
  it('uses the documented paths', async () => {
    // Cheap protection against a rename on either side: the path is asserted as sent.
    const calls: string[] = [];
    globalThis.fetch = (async (url: unknown) => {
      calls.push(String(url));
      return json({ success: true, data: {} });
    }) as typeof globalThis.fetch;

    await apiGet('/operator/me');
    await apiGet('/shopify/capabilities');
    await apiGet('/shopify/products');
    await apiGet('/automation/status');
    await apiGet('/webhooks/events?limit=25');
    await apiGet('/audit?limit=50');
    await apiGet('/diagnostics/operations');

    for (const path of [
      '/operator/me',
      '/shopify/capabilities',
      '/shopify/products',
      '/automation/status',
      '/webhooks/events?limit=25',
      '/audit?limit=50',
      // Added in hardening pass 2, operator-only.
      '/diagnostics/operations',
    ]) {
      assert.ok(
        calls.some((url) => url.endsWith(path)),
        `${path} was not requested as written`,
      );
    }
  });
});
