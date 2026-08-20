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
 *   failure: { success: false, code, message, details? }
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

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
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
}

export interface ApiResult<T> {
  data: T;
  meta?: PageMeta & Record<string, unknown>;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  signal?: AbortSignal;
}

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

  if (!response.ok || body['success'] === false) {
    throw new ApiError(
      typeof body['code'] === 'string' ? body['code'] : 'REQUEST_FAILED',
      typeof body['message'] === 'string'
        ? body['message']
        : `Request failed with HTTP ${response.status}.`,
      response.status,
      body['details'],
    );
  }

  // /api/health is intentionally unwrapped, so fall back to the whole body.
  if (body['success'] === true) {
    return {
      data: body['data'] as T,
      meta: body['meta'] as (PageMeta & Record<string, unknown>) | undefined,
    };
  }
  return { data: body as T };
}

export function apiGet<T>(path: string, signal?: AbortSignal): Promise<ApiResult<T>> {
  return request<T>(path, { signal });
}

export function apiPost<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<ApiResult<T>> {
  return request<T>(path, { method: 'POST', body, signal });
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
