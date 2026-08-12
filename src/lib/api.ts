/**
 * The only place the frontend performs network calls.
 *
 * It talks exclusively to the Trademart backend - never to Shopify directly -
 * and contains no credentials of any kind.
 *
 * Backend envelopes:
 *   success: { success: true, data, meta? }
 *   failure: { success: false, code, message, details? }
 */

import type { PageMeta } from './types';

const DEFAULT_BASE_URL = 'http://localhost:4000/api';

export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  const base = configured && configured.trim().length > 0 ? configured.trim() : DEFAULT_BASE_URL;
  return base.replace(/\/+$/, '');
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
}

export interface ApiResult<T> {
  data: T;
  meta?: PageMeta & Record<string, unknown>;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const url = `${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      cache: 'no-store',
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
