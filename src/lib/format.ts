/**
 * Display formatting helpers.
 *
 * Guiding rule: never render a missing value as 0 or "free". Unknown data shows
 * an em dash so the UI cannot imply information it does not have.
 */

import type { Money } from './types';

export const NOT_AVAILABLE = '—';

export function formatMoney(money: Money | null | undefined): string {
  if (!money) return NOT_AVAILABLE;
  return formatAmount(money.amount, money.currencyCode);
}

export function formatAmount(
  amount: number | null | undefined,
  currencyCode: string | null | undefined,
): string {
  if (amount === null || amount === undefined) return NOT_AVAILABLE;
  if (!currencyCode || currencyCode === 'UNKNOWN') {
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Unknown/invalid currency code - show the number with the code appended.
    return `${amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${currencyCode}`;
  }
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return NOT_AVAILABLE;
  return value.toLocaleString();
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return NOT_AVAILABLE;
  return `${value.toFixed(2)}%`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return NOT_AVAILABLE;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return NOT_AVAILABLE;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return NOT_AVAILABLE;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return NOT_AVAILABLE;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Turns SNAKE_CASE Shopify enums into readable text. */
export function humanise(value: string | null | undefined): string {
  if (!value) return NOT_AVAILABLE;
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Extracts the numeric part of a Shopify GID for display. */
export function shortGid(gid: string | null | undefined): string {
  if (!gid) return NOT_AVAILABLE;
  const parts = gid.split('/');
  return parts[parts.length - 1] ?? gid;
}
