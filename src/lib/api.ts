/**
 * The only place the frontend performs network calls.
 *
 * It talks exclusively to the Trademart backend - never to Shopify directly -
 * and stores NO Shopify credentials. The operator session lives in an HttpOnly
 * cookie the browser manages, which this code cannot read (by design - that is
 * what makes it safe against XSS token theft).
 *
 * Auth model:
 *   - Requests are sent with credentials:'include', so the session cookie flows
 *     cross-origin (dev: :3000 -> :4000). The backend CORS allowlist is what
 *     makes that safe; a wildcard origin would be rejected by the browser.
 *   - Mutations (POST/PUT/PATCH/DELETE) echo the non-HttpOnly CSRF cookie in the
 *     X-CSRF-Token header (double-submit). A cross-site page can cause the
 *     cookie to be sent but cannot read it to set the header, so it cannot forge
 *     a mutation.
 *
 * Backend envelopes:
 *   success: { success: true, data, meta? }
 *   failure: { success: false, code, message, details?, requestId?,
 *              error: { code, message, requestId?, details? } }
 *
 * The failure body carries both a flat and a nested shape. The nested `error`
 * object is preferred when present because it is the one that carries requestId;
 * the flat keys are read as a fallback so this client still works against an
 * older backend.
 *
 * CORRELATION: every response carries an X-Request-ID header, which is surfaced
 * on ApiError so the UI can show an id an operator can quote. That id ties the
 * failure to the backend log lines and the audit entry for the same request.
 */

import type { PageMeta } from './types';

const DEFAULT_BASE_URL = 'http://localhost:4000/api';

/** Name of the CSRF cookie the backend sets (non-HttpOnly, readable here). */
const CSRF_COOKIE = 'trademart_csrf';
const CSRF_HEADER = 'X-CSRF-Token';

export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  const base = configured && configured.trim().length > 0 ? configured.trim() : DEFAULT_BASE_URL;
  return base.replace(/\/+$/, '');
}

/** Reads a cookie value in the browser. Returns undefined on the server. */
function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const part of document.cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

/** A failure that already carries a backend error code. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  /**
   * Correlation id for the failed request, from the X-Request-ID response header
   * or the error body. Quoting this makes a failure findable in the backend logs
   * and in the audit trail.
   */
  readonly requestId: string | null;

  constructor(
    code: string,
    message: string,
    status: number,
    details?: unknown,
    requestId: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }

  /** True when the operator needs to change configuration, not retry. */
  get isConfigurationProblem(): boolean {
    return (
      this.code === 'SHOPIFY_NOT_CONFIGURED' ||
      this.code === 'SHOPIFY_UNAUTHORIZED' ||
      this.code === 'SHOPIFY_SCOPE_MISSING'
    );
  }

  /** True when the operator is not signed in and should be shown the login screen. */
  get isAuthProblem(): boolean {
    return this.code === 'UNAUTHORIZED' || this.code === 'CSRF_INVALID';
  }

  /**
   * True when the world moved under the operator and the fix is to reload.
   *
   * These are all deliberate refusals rather than faults, and they share one
   * remedy: look at the current state again, then redo the action. Grouping them
   * lets the UI offer a Refresh action instead of a bare error.
   */
  get isStaleStateProblem(): boolean {
    return (
      this.code === 'PREVIEW_STALE' ||
      this.code === 'PREVIEW_EXPIRED' ||
      this.code === 'PREVIEW_ALREADY_APPLIED' ||
      this.code === 'PREVIEW_REQUIRED' ||
      this.code === 'PRODUCT_CHANGED'
    );
  }

  /** True when something else is holding a lock, or a dependency is degraded. */
  get isTemporary(): boolean {
    return (
      this.code === 'AUTOMATION_ALREADY_RUNNING' ||
      this.code === 'SHOPIFY_DEGRADED' ||
      this.code === 'SHOPIFY_THROTTLED' ||
      this.code === 'SHOPIFY_TIMEOUT' ||
      this.code === 'RATE_LIMITED' ||
      this.code === 'IDEMPOTENCY_IN_PROGRESS'
    );
  }
}

export interface ApiResult<T> {
  data: T;
  meta?: PageMeta & Record<string, unknown>;
  /**
   * HTTP status. Exposed because 207 Multi-Status is a real outcome here: a
   * product create can succeed partially (created but not published), and a
   * caller that only looked at `data` would report it as a clean success.
   */
  status: number;
  requestId: string | null;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  signal?: AbortSignal;
  /**
   * Value for the Idempotency-Key header.
   *
   * Deliberately NOT generated automatically for every POST. An idempotency key
   * is only meaningful when the CALLER can reuse the same value across retries -
   * a fresh key per attempt provides no protection at all and would just fill the
   * backend's key collection. Callers that retry (or that guard a
   * double-click) pass a stable key explicitly; see newIdempotencyKey.
   */
  idempotencyKey?: string;
}

/**
 * Generates a key for one logical operation.
 *
 * Call this ONCE per user intent - typically when a form is first submitted - and
 * reuse the value for every retry of that same submission. Generating a new key
 * per attempt defeats the purpose.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older browsers. Only needs to be unique per operator action, not
  // globally unguessable - the key is not a credential.
  return `tm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
export const REQUEST_ID_HEADER = 'X-Request-ID';

/** Methods that change state and therefore need a CSRF token. */
const MUTATING = new Set<HttpMethod>(['POST', 'PUT', 'PATCH', 'DELETE']);

async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const url = `${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  const method = options.method ?? 'GET';

  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  // Attach the CSRF token on mutations. Harmless when absent (the backend only
  // enforces it for cookie-authenticated requests).
  if (MUTATING.has(method)) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf !== undefined) headers[CSRF_HEADER] = csrf;
  }
  if (options.idempotencyKey !== undefined) {
    headers[IDEMPOTENCY_HEADER] = options.idempotencyKey;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      cache: 'no-store',
      // Send the operator session cookie cross-origin. Safe because the backend
      // CORS origin is an explicit allowlist, never a wildcard.
      credentials: 'include',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    // Distinguish "backend is down" from "backend returned an error" - the most
    // common problem during local setup by far.
    throw new ApiError(
      'BACKEND_UNREACHABLE',
      `Could not reach the Trademart backend at ${getApiBaseUrl()}. Is it running?`,
      0,
      error instanceof Error ? error.message : undefined,
    );
  }

  let payload: unknown = null;
  const text = await response.text();
  if (text.length > 0) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError(
        'INVALID_RESPONSE',
        `The backend returned a non-JSON response (HTTP ${response.status}).`,
        response.status,
      );
    }
  }

  const body = (payload ?? {}) as Record<string, unknown>;
  // The header is authoritative: it is set before the route runs, so it is present
  // even on a response the route never got to write (a 500 from middleware).
  const headerRequestId = response.headers.get(REQUEST_ID_HEADER);

  if (!response.ok || body['success'] === false) {
    // Prefer the nested `error` object - it is the shape that carries requestId -
    // and fall back to the flat keys so an older backend still reports properly.
    const nested = (body['error'] ?? {}) as Record<string, unknown>;
    const code =
      typeof nested['code'] === 'string'
        ? nested['code']
        : typeof body['code'] === 'string'
          ? body['code']
          : 'REQUEST_FAILED';
    const message =
      typeof nested['message'] === 'string'
        ? nested['message']
        : typeof body['message'] === 'string'
          ? body['message']
          : `Request failed with HTTP ${response.status}.`;
    const details = nested['details'] ?? body['details'];
    const requestId =
      headerRequestId ??
      (typeof nested['requestId'] === 'string' ? nested['requestId'] : null) ??
      (typeof body['requestId'] === 'string' ? body['requestId'] : null);

    throw new ApiError(code, message, response.status, details, requestId);
  }

  // /api/health is intentionally unwrapped, so fall back to the whole body.
  if (body['success'] === true) {
    return {
      data: body['data'] as T,
      meta: body['meta'] as (PageMeta & Record<string, unknown>) | undefined,
      status: response.status,
      requestId: headerRequestId,
    };
  }
  return { data: body as T, status: response.status, requestId: headerRequestId };
}

export function apiGet<T>(path: string, signal?: AbortSignal): Promise<ApiResult<T>> {
  return request<T>(path, { signal });
}

export function apiPost<T>(
  path: string,
  body: unknown,
  options: { signal?: AbortSignal; idempotencyKey?: string } = {},
): Promise<ApiResult<T>> {
  const request_: RequestOptions = { method: 'POST', body };
  if (options.signal !== undefined) request_.signal = options.signal;
  if (options.idempotencyKey !== undefined) request_.idempotencyKey = options.idempotencyKey;
  return request<T>(path, request_);
}

export function apiPut<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<ApiResult<T>> {
  return request<T>(path, { method: 'PUT', body, signal });
}

export function apiPatch<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<ApiResult<T>> {
  return request<T>(path, { method: 'PATCH', body, signal });
}

/** DELETE. Body optional - many delete routes take none. */
export function apiDelete<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<ApiResult<T>> {
  return request<T>(path, { method: 'DELETE', body, signal });
}

/** Builds a query string, skipping empty values. */
export function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const serialised = search.toString();
  return serialised.length > 0 ? `?${serialised}` : '';
}
