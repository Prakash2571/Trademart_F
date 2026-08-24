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

/** The outcome of parsing an operator-typed number. */
export interface ParsedNumber {
  /** null means the field was left blank, which is a legitimate "unknown". */
  value: number | null;
  /** A human message when the text was present but not a valid number. Null otherwise. */
  error: string | null;
}

/**
 * Parses a numeric form field STRICTLY, so bad input is rejected rather than silently
 * reinterpreted.
 *
 * The trap this avoids: `Number("12x")` is NaN and `parseFloat("12x")` is 12. The old code
 * used `Number(...)` then fell back to null on NaN, so "12x" became "unknown" - the
 * operator's typo silently discarded the figure they thought they had entered, and a blank
 * cost is exactly what the whole module treats as most dangerous. This returns an ERROR for
 * "12x" instead, so the form can refuse and say so.
 *
 * Rules:
 *   - blank (after trim) is value:null, error:null - unknown is allowed
 *   - only an optional sign, digits and one optional decimal point are accepted; "12x",
 *     "1,000", "1.2.3", "1e5", "  " with content all error
 *   - by default negatives error (a negative cost or price is never meaningful); pass
 *     allowNegative for fields like a declining trend percentage
 *   - integer:true rejects a decimal point (transit days, search counts)
 */
export function parseNumericInput(
  raw: string,
  options: { allowNegative?: boolean; integer?: boolean; label?: string } = {},
): ParsedNumber {
  const label = options.label ?? 'This field';
  const trimmed = raw.trim();
  if (trimmed === '') return { value: null, error: null };

  const pattern = options.integer ? /^-?\d+$/ : /^-?\d+(\.\d+)?$/;
  if (!pattern.test(trimmed)) {
    return {
      value: null,
      error: `${label} must be a ${options.integer ? 'whole number' : 'number'} (for example ${
        options.integer ? '30' : '12.50'
      }), or left blank. "${raw.trim()}" is not one.`,
    };
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { value: null, error: `${label} is not a valid number.` };
  }
  if (!options.allowNegative && value < 0) {
    return { value: null, error: `${label} cannot be negative.` };
  }
  return { value, error: null };
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

/**
 * Strips the `.myshopify.com` suffix.
 *
 * The full domain is long, unbreakable and mostly boilerplate, which reads badly
 * as a headline value. The subdomain is the part that actually identifies the
 * store; the full domain is still shown in Settings and the System panel.
 */
export function storeSubdomain(domain: string | null | undefined): string {
  if (!domain) return NOT_AVAILABLE;
  return domain.trim().replace(/\.myshopify\.com\/?$/i, '');
}

/** Extracts the numeric part of a Shopify GID for display. */
export function shortGid(gid: string | null | undefined): string {
  if (!gid) return NOT_AVAILABLE;
  const parts = gid.split('/');
  return parts[parts.length - 1] ?? gid;
}
