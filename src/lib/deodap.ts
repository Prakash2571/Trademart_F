/**
 * DeoDap page helpers - framework-free, so they run under node --test.
 *
 * The limits here mirror the backend (Trademart_B src/suppliers/deodap). They are
 * checked in the browser only to give a clear message before a request that would be
 * refused anyway; the backend enforces every one of them itself.
 */

import type {
  DeodapImportOutcome,
  DeodapOrderStatus,
  DeodapOrderView,
  DeodapPreviewStatus,
  DeodapSyncChangeKind,
} from './types';

/** Products per import request. Mirrors MAX_IMPORT_BATCH. */
export const DEODAP_IMPORT_BATCH = 10;

/** Cost updates per sync request. Mirrors MAX_SYNC_UPDATES. */
export const DEODAP_SYNC_BATCH = 200;

/** Characters per file. Mirrors CSV_LIMITS.maxChars. */
export const MAX_CSV_CHARS = 950_000;

/**
 * The backend reads at most 1 MB of JSON per request, and the file travels inside a
 * JSON string - where every quote and line break takes two bytes and a Hindi letter
 * three. So the ENCODED size is checked, with a little room for the other fields.
 */
export const MAX_UPLOAD_BYTES = 1_000_000;

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

/** Splits a list into consecutive batches of at most `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error('chunk size must be a positive integer');
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

/** The number of bytes `value` occupies when sent as JSON. */
export function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** Why a file cannot be uploaded as it is, or null when it can. */
export function uploadProblem(csv: string): string | null {
  if (csv.trim().length === 0) return 'The file is empty.';
  if (csv.length > MAX_CSV_CHARS || jsonByteLength({ csv }) > MAX_UPLOAD_BYTES) {
    return 'This file is too large to upload in one go (about 1 MB is the limit). Split it into smaller files - for example by category - and upload them one at a time.';
  }
  return null;
}

/** Reads the SKU prefix box: separated by commas, spaces or new lines. */
export function parsePrefixInput(raw: string): string[] {
  const seen = new Set<string>();
  const prefixes: string[] = [];
  for (const piece of raw.split(/[\s,]+/)) {
    const prefix = piece.trim();
    const key = prefix.toLowerCase();
    if (prefix.length === 0 || seen.has(key)) continue;
    seen.add(key);
    prefixes.push(prefix);
  }
  return prefixes;
}

/**
 * The Shopify admin page for an order or product, or null when it cannot be built.
 *
 * Used on the orders page: the customer's address is needed to place the order with
 * DeoDap, and Trademart deliberately does not store or show it - Shopify does.
 */
export function shopifyAdminUrl(storeDomain: string | null | undefined, gid: string): string | null {
  const store = (storeDomain ?? '').trim().replace(/\.myshopify\.com\/?$/i, '');
  const match = /^gid:\/\/shopify\/(Order|Product)\/(\d+)$/.exec(gid);
  if (store.length === 0 || !/^[a-z0-9][a-z0-9-]*$/i.test(store) || match === null) return null;
  const section = match[1] === 'Order' ? 'orders' : 'products';
  return `https://admin.shopify.com/store/${store}/${section}/${match[2]}`;
}

/** What to order from DeoDap for one Shopify order, as text to paste. */
export function orderSummaryText(order: Pick<DeodapOrderView, 'name' | 'lines'>): string {
  const lines = order.lines.map((line) => {
    const code = line.sku ?? line.supplierRef ?? 'no SKU';
    return `${code} x ${line.quantity} - ${line.title}`;
  });
  return [`Shopify order ${order.name}`, ...lines].join('\n');
}

/* ------------------------------------------------------------- labels ---- */

export const ORDER_STATUSES: readonly DeodapOrderStatus[] = [
  'NOT_PLACED',
  'PLACED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'PROBLEM',
];

const ORDER_STATUS_LABELS: Record<DeodapOrderStatus, string> = {
  NOT_PLACED: 'Not placed',
  PLACED: 'Placed with DeoDap',
  SHIPPED: 'Shipped by DeoDap',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  PROBLEM: 'Problem',
};

export function orderStatusLabel(status: DeodapOrderStatus | null): string {
  return status === null ? 'Not placed' : ORDER_STATUS_LABELS[status];
}

export function orderStatusTone(status: DeodapOrderStatus | null): Tone {
  switch (status) {
    case 'PLACED':
      return 'info';
    case 'SHIPPED':
    case 'DELIVERED':
      return 'success';
    case 'PROBLEM':
      return 'danger';
    case 'CANCELLED':
      return 'neutral';
    case 'NOT_PLACED':
    case null:
    default:
      return 'warning';
  }
}

const PREVIEW_STATUS_LABELS: Record<DeodapPreviewStatus, string> = {
  READY: 'Ready',
  NEEDS_ATTENTION: 'Needs attention',
  ALREADY_IMPORTED: 'Already imported',
  IN_PROGRESS: 'Import running',
};

export function previewStatusLabel(status: DeodapPreviewStatus): string {
  return PREVIEW_STATUS_LABELS[status];
}

export function previewStatusTone(status: DeodapPreviewStatus): Tone {
  switch (status) {
    case 'READY':
      return 'success';
    case 'NEEDS_ATTENTION':
      return 'danger';
    case 'ALREADY_IMPORTED':
      return 'info';
    case 'IN_PROGRESS':
    default:
      return 'warning';
  }
}

const OUTCOME_LABELS: Record<DeodapImportOutcome, string> = {
  CREATED: 'Created as draft',
  PARTIAL: 'Created, needs a look',
  SKIPPED: 'Skipped',
  FAILED: 'Failed',
  NOT_ATTEMPTED: 'Not attempted',
};

export function importOutcomeLabel(outcome: DeodapImportOutcome): string {
  return OUTCOME_LABELS[outcome];
}

export function importOutcomeTone(outcome: DeodapImportOutcome): Tone {
  switch (outcome) {
    case 'CREATED':
      return 'success';
    case 'PARTIAL':
      return 'warning';
    case 'SKIPPED':
      return 'neutral';
    case 'FAILED':
    case 'NOT_ATTEMPTED':
    default:
      return 'danger';
  }
}

export function syncKindLabel(kind: DeodapSyncChangeKind): string {
  switch (kind) {
    case 'COST_CHANGED':
      return 'Cost changed';
    case 'UNCHANGED':
      return 'Unchanged';
    case 'NO_COST_IN_FILE':
    default:
      return 'No cost in file';
  }
}

/** A cost change as a signed percentage, e.g. "+10.0%". */
export function formatChange(percent: number | null): string {
  if (percent === null) return '—';
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent.toFixed(1)}%`;
}
