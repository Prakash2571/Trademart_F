/**
 * The API client is the whole security surface of this frontend.
 *
 * Everything the browser sends to the backend goes through `request()`, so four
 * properties have to hold for every call, and none of them are visible by reading
 * a page component:
 *
 *   1. the session cookie is sent (credentials:'include') - otherwise every
 *      management read 401s the moment the backend requires an operator
 *   2. mutations carry the double-submit CSRF header, and reads do NOT
 *   3. a failure becomes an ApiError with the backend's own code, not a generic
 *      "request failed" - the UI keys every explanation and every retry decision
 *      off that code
 *   4. the correlation id survives, including on a middleware 500 that never
 *      wrote a body
 *
 * `fetch` is replaced with a recording stub, so these assert what would actually
 * go over the wire.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  ApiError,
  IDEMPOTENCY_HEADER,
  REQUEST_ID_HEADER,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  getApiBaseUrl,
  newIdempotencyKey,
  query,
} from './api';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

interface RecordedCall {
  url: string;
  init: RequestInit & { headers: Record<string, string> };
}

const calls: RecordedCall[] = [];
let respond: () => Response | Promise<Response>;

const realFetch = globalThis.fetch;
const realDocument = (globalThis as { document?: unknown }).document;

/** A backend success envelope. */
function success(data: unknown, init: { status?: number; meta?: unknown; requestId?: string } = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (init.requestId !== undefined) headers.set(REQUEST_ID_HEADER, init.requestId);
  const body: Record<string, unknown> = { success: true, data };
  if (init.meta !== undefined) body['meta'] = init.meta;
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

/** A backend failure envelope, in the dual flat + nested shape it really sends. */
function failure(
  code: string,
  message: string,
  init: { status?: number; requestId?: string; details?: unknown; nested?: boolean } = {},
) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (init.requestId !== undefined) headers.set(REQUEST_ID_HEADER, init.requestId);
  const body: Record<string, unknown> = { success: false, code, message };
  if (init.details !== undefined) body['details'] = init.details;
  if (init.nested !== false) {
    body['error'] = { code, message, ...(init.details === undefined ? {} : { details: init.details }) };
  }
  return new Response(JSON.stringify(body), { status: init.status ?? 400, headers });
}

beforeEach(() => {
  calls.length = 0;
  respond = () => success({ ok: true });

  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    calls.push({
      url: String(input),
      init: { ...(init ?? {}), headers: (init?.headers ?? {}) as Record<string, string> },
    });
    return respond();
  }) as typeof globalThis.fetch;

  // No cookies unless a test sets them.
  (globalThis as { document?: unknown }).document = { cookie: '' };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realDocument === undefined) delete (globalThis as { document?: unknown }).document;
  else (globalThis as { document?: unknown }).document = realDocument;
});

const lastCall = (): RecordedCall => {
  const call = calls[calls.length - 1];
  if (call === undefined) throw new Error('no fetch call was recorded');
  return call;
};

// ---------------------------------------------------------------------------

describe('the session cookie and CSRF token', () => {
  it('sends credentials on every request', async () => {
    // Without this the operator cookie is not attached cross-origin and every
    // management call fails as UNAUTHORIZED - including reads, now that
    // production requires an operator for them.
    await apiGet('/shopify/products');
    assert.equal(lastCall().init.credentials, 'include');
  });

  it('echoes the CSRF cookie in the header on a mutation', async () => {
    (globalThis as { document: { cookie: string } }).document = {
      cookie: 'trademart_csrf=abc123; other=x',
    };

    await apiPost('/shopify/products', { title: 'x' });

    assert.equal(lastCall().init.headers['X-CSRF-Token'], 'abc123');
  });

  it('does NOT send a CSRF header on a read', async () => {
    // A GET cannot change anything, and sending the token on reads would widen
    // where it can leak (logs, referrers, caches) for no benefit.
    (globalThis as { document: { cookie: string } }).document = {
      cookie: 'trademart_csrf=abc123',
    };

    await apiGet('/shopify/products');

    assert.equal(lastCall().init.headers['X-CSRF-Token'], undefined);
  });

  it('sends the CSRF header on PUT, PATCH and DELETE too', async () => {
    (globalThis as { document: { cookie: string } }).document = {
      cookie: 'trademart_csrf=tok',
    };

    await apiPut('/suppliers/costs/1', { cost: 1 });
    assert.equal(lastCall().init.headers['X-CSRF-Token'], 'tok');

    await apiPatch('/shopify/products/1', { title: 'y' });
    assert.equal(lastCall().init.headers['X-CSRF-Token'], 'tok');

    await apiDelete('/suppliers/costs/1');
    assert.equal(lastCall().init.headers['X-CSRF-Token'], 'tok');
  });

  it('url-decodes the cookie value', async () => {
    // The backend base64s the token, and '+'/'=' survive percent-encoding in a
    // cookie. Sending the encoded form would fail the constant-time comparison.
    (globalThis as { document: { cookie: string } }).document = {
      cookie: 'trademart_csrf=a%2Bb%3D',
    };

    await apiPost('/operator/logout', {});

    assert.equal(lastCall().init.headers['X-CSRF-Token'], 'a+b=');
  });

  it('omits the header when no CSRF cookie exists, rather than sending empty', async () => {
    // An empty header would look like a failed double-submit; omitting it lets
    // the backend answer the honest CSRF_INVALID with its own explanation.
    await apiPost('/operator/login', { username: 'a', password: 'b' });
    assert.equal(lastCall().init.headers['X-CSRF-Token'], undefined);
  });

  it('never reads a cookie on the server, where document does not exist', async () => {
    delete (globalThis as { document?: unknown }).document;
    await assert.doesNotReject(apiPost('/shopify/products', {}));
    assert.equal(lastCall().init.headers['X-CSRF-Token'], undefined);
  });
});

describe('error normalisation', () => {
  it('turns a failure envelope into an ApiError carrying the backend code', async () => {
    respond = () => failure('PRODUCT_CHANGED', 'The product changed in Shopify.', { status: 409 });

    const error = (await apiPatch('/shopify/products/1', {}).catch(
      (caught: unknown) => caught,
    )) as ApiError;

    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'PRODUCT_CHANGED');
    assert.equal(error.status, 409);
    assert.equal(error.message, 'The product changed in Shopify.');
  });

  it('prefers the nested error object, which is the shape carrying requestId', async () => {
    const body = JSON.stringify({
      success: false,
      code: 'FLAT_CODE',
      message: 'flat message',
      error: { code: 'NESTED_CODE', message: 'nested message', requestId: 'req-nested' },
    });
    respond = () =>
      new Response(body, { status: 409, headers: { 'Content-Type': 'application/json' } });

    const error = (await apiPost('/x', {}).catch((caught: unknown) => caught)) as ApiError;

    assert.equal(error.code, 'NESTED_CODE');
    assert.equal(error.requestId, 'req-nested');
  });

  it('falls back to the flat keys for an older backend', async () => {
    respond = () => failure('COST_UNKNOWN', 'No cost.', { status: 409, nested: false });

    const error = (await apiPost('/x', {}).catch((caught: unknown) => caught)) as ApiError;

    assert.equal(error.code, 'COST_UNKNOWN');
    assert.equal(error.message, 'No cost.');
  });

  it('prefers the response header for the request id', async () => {
    // The header is set before the route runs, so it survives a failure the route
    // never got to write - a 500 raised inside middleware, for instance.
    respond = () => failure('INTERNAL_ERROR', 'boom', { status: 500, requestId: 'req-header' });

    const error = (await apiGet('/x').catch((caught: unknown) => caught)) as ApiError;

    assert.equal(error.requestId, 'req-header');
  });

  it('reports a request id even when the body is empty', async () => {
    respond = () =>
      new Response('', { status: 502, headers: { [REQUEST_ID_HEADER]: 'req-empty' } });

    const error = (await apiGet('/x').catch((caught: unknown) => caught)) as ApiError;

    assert.equal(error.status, 502);
    assert.equal(error.requestId, 'req-empty');
    // No code from the backend, so a generic one - but never a silent success.
    assert.equal(error.code, 'REQUEST_FAILED');
  });

  it('keeps details, which several codes use to say what to fix', async () => {
    respond = () =>
      failure('RESEARCH_SUPPLIER_VARIANTS', 'Some variants are unavailable.', {
        status: 409,
        details: { unavailable: ['S', 'M'] },
      });

    const error = (await apiPost('/x', {}).catch((caught: unknown) => caught)) as ApiError;

    assert.deepEqual(error.details, { unavailable: ['S', 'M'] });
  });

  it('distinguishes an unreachable backend from an error response', async () => {
    // The most common local-setup problem by far, and the one where a generic
    // "request failed" wastes the most time.
    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof globalThis.fetch;

    const error = (await apiGet('/x').catch((caught: unknown) => caught)) as ApiError;

    assert.equal(error.code, 'BACKEND_UNREACHABLE');
    assert.equal(error.status, 0);
    assert.match(error.message, /Is it running\?/);
  });

  it('reports a non-JSON response as INVALID_RESPONSE, not as JSON garbage', async () => {
    // What an nginx 502 page looks like from here.
    respond = () =>
      new Response('<html>502 Bad Gateway</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      });

    const error = (await apiGet('/x').catch((caught: unknown) => caught)) as ApiError;

    assert.equal(error.code, 'INVALID_RESPONSE');
    assert.equal(error.status, 502);
  });

  it('treats success:false with HTTP 200 as a failure', async () => {
    // Defensive: an envelope that says it failed IS a failure, whatever the status
    // line claims. Trusting response.ok alone would surface an error body as data.
    respond = () =>
      new Response(JSON.stringify({ success: false, code: 'VALIDATION_ERROR', message: 'no' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const error = (await apiGet('/x').catch((caught: unknown) => caught)) as ApiError;

    assert.equal(error.code, 'VALIDATION_ERROR');
  });

  it('re-throws an abort rather than reporting it as a backend failure', async () => {
    // useApi aborts in-flight reads on unmount and on a path change. Turning that
    // into a visible error would make every navigation look broken.
    globalThis.fetch = (async () => {
      throw new DOMException('aborted', 'AbortError');
    }) as typeof globalThis.fetch;

    const error = (await apiGet('/x').catch((caught: unknown) => caught)) as DOMException;

    assert.ok(error instanceof DOMException);
    assert.equal(error.name, 'AbortError');
  });
});

describe('ApiError classification', () => {
  const make = (code: string, status = 400) => new ApiError(code, 'm', status);

  it('recognises the two codes that mean "show the login screen"', () => {
    assert.equal(make('UNAUTHORIZED', 401).isAuthProblem, true);
    assert.equal(make('CSRF_INVALID', 403).isAuthProblem, true);
    assert.equal(make('VALIDATION_ERROR').isAuthProblem, false);
    // A Shopify credential failure is NOT an operator session problem. Showing a
    // login screen for it would send the operator to re-enter a password that was
    // never the issue.
    assert.equal(make('SHOPIFY_UNAUTHORIZED', 401).isAuthProblem, false);
  });

  it('separates configuration problems from transient ones', () => {
    assert.equal(make('SHOPIFY_NOT_CONFIGURED', 503).isConfigurationProblem, true);
    assert.equal(make('SHOPIFY_SCOPE_MISSING', 403).isConfigurationProblem, true);
    // Retrying a missing scope forever is exactly what must not be offered.
    assert.equal(make('SHOPIFY_SCOPE_MISSING', 403).isTemporary, false);
  });

  it('groups the "reload and try again" refusals', () => {
    for (const code of [
      'PREVIEW_STALE',
      'PREVIEW_EXPIRED',
      'PREVIEW_ALREADY_APPLIED',
      'PREVIEW_REQUIRED',
      'PRODUCT_CHANGED',
    ]) {
      assert.equal(make(code, 409).isStaleStateProblem, true, code);
    }
  });

  it('treats a held lock and a degraded dependency as temporary', () => {
    for (const code of [
      'AUTOMATION_ALREADY_RUNNING',
      'SHOPIFY_DEGRADED',
      'SHOPIFY_THROTTLED',
      'SHOPIFY_TIMEOUT',
      'RATE_LIMITED',
      'IDEMPOTENCY_IN_PROGRESS',
    ]) {
      assert.equal(make(code, 409).isTemporary, true, code);
    }
  });

  it('does not classify a reused key as temporary', () => {
    // IDEMPOTENCY_CONFLICT means the same key was sent with a DIFFERENT body.
    // Retrying it cannot succeed; it needs a new key or a fixed request.
    assert.equal(make('IDEMPOTENCY_CONFLICT', 409).isTemporary, false);
  });
});

describe('idempotency keys', () => {
  it('sends the header only when a key is supplied', async () => {
    await apiPost('/shopify/products', { title: 'x' });
    assert.equal(lastCall().init.headers[IDEMPOTENCY_HEADER], undefined);

    await apiPost('/shopify/products', { title: 'x' }, { idempotencyKey: 'key-12345678' });
    assert.equal(lastCall().init.headers[IDEMPOTENCY_HEADER], 'key-12345678');
  });

  it('generates keys that satisfy the backend format', () => {
    // The backend accepts 8-200 characters of [A-Za-z0-9._~:-]. A key it rejects
    // would turn a protected write into a 400 at the worst possible moment.
    for (let index = 0; index < 20; index += 1) {
      const key = newIdempotencyKey();
      assert.match(key, /^[A-Za-z0-9._~:-]{8,200}$/, key);
    }
  });

  it('generates a different key per call', () => {
    // One key per user intent, reused across retries of that intent - so the
    // generator must not be stable across intents.
    assert.notEqual(newIdempotencyKey(), newIdempotencyKey());
  });
});

describe('responses', () => {
  it('unwraps data and meta', async () => {
    respond = () => success([{ id: 1 }], { meta: { count: 1, hasMore: false } });

    const result = await apiGet<{ id: number }[]>('/shopify/products');

    assert.deepEqual(result.data, [{ id: 1 }]);
    assert.equal(result.meta?.count, 1);
  });

  it('exposes the status, so a 207 partial success is not read as clean', async () => {
    // A product create can succeed and fail to publish. A caller that only looked
    // at `data` would report "created" and say nothing about the product being
    // invisible to customers.
    respond = () => success({ id: 1 }, { status: 207 });

    const result = await apiGet('/x');

    assert.equal(result.status, 207);
  });

  it('passes an unwrapped body through, for /health', async () => {
    respond = () =>
      new Response(JSON.stringify({ status: 'ok', database: 'connected' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const result = await apiGet<{ status: string }>('/health');

    assert.equal(result.data.status, 'ok');
  });

  it('never caches, so a read after a write shows the new state', async () => {
    await apiGet('/shopify/products');
    assert.equal(lastCall().init.cache, 'no-store');
  });
});

describe('url building', () => {
  it('joins the base and path exactly once', async () => {
    await apiGet('shopify/products');
    assert.equal(lastCall().url, `${getApiBaseUrl()}/shopify/products`);

    await apiGet('/shopify/products');
    assert.equal(lastCall().url, `${getApiBaseUrl()}/shopify/products`);
  });

  it('strips trailing slashes from the configured base', () => {
    assert.ok(!getApiBaseUrl().endsWith('/'));
  });

  it('omits empty query values instead of sending key=', () => {
    // `?status=` is not the same request as no filter at all, and the backend
    // validates the parameter it receives.
    assert.equal(query({ status: '', limit: 50 }), '?limit=50');
    assert.equal(query({ status: undefined }), '');
    assert.equal(query({}), '');
    assert.equal(query({ q: 'a b' }), '?q=a+b');
  });
});
