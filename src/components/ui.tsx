/**
 * Reusable presentational primitives: stat card, badge, callout, skeletons,
 * empty/error states, card, page header, modal.
 *
 * Grouped in one module because each is small; they are the shared vocabulary
 * every page uses so the dashboard stays consistent.
 */

'use client';

import { useEffect, type ReactNode } from 'react';

import { ApiError } from '@/lib/api';
import { NOT_AVAILABLE } from '@/lib/format';

/* ------------------------------------------------------------------ card -- */

export function Card({
  title,
  actions,
  footer,
  children,
  bodyless,
}: {
  title?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Set when the child manages its own padding (e.g. a full-width table). */
  bodyless?: boolean;
}) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card__header">
          {title ? <h2 className="card__title">{title}</h2> : <span />}
          {actions}
        </header>
      )}
      {bodyless ? children : <div className="card__body">{children}</div>}
      {footer && <div className="card__footer">{footer}</div>}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-header__title">{title}</h1>
          {description && <p className="page-header__desc">{description}</p>}
        </div>
        {actions}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- stat card -- */

export function StatCard({
  label,
  value,
  hint,
  unavailable,
  compact,
  valueTitle,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  /** Renders the muted "unavailable" treatment instead of a fake number. */
  unavailable?: boolean;
  /** Smaller type for long text values so they fit without wrapping oddly. */
  compact?: boolean;
  /** Tooltip for when the displayed value is an abbreviation of a longer one. */
  valueTitle?: string;
}) {
  const modifiers = [
    unavailable ? 'stat__value--muted' : '',
    compact ? 'stat__value--compact' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div
        className={`stat__value${modifiers ? ` ${modifiers}` : ''}`}
        title={valueTitle}
      >
        {unavailable ? NOT_AVAILABLE : value}
      </div>
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  );
}

/* ----------------------------------------------------------------- badge -- */

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({
  children,
  tone = 'neutral',
  dot,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
}) {
  const suffix = tone === 'neutral' ? '' : ` badge--${tone}`;
  return (
    <span className={`badge${suffix}`}>
      {dot && <span className="badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Maps Shopify financial statuses to a tone. */
export function financialTone(status: string | null): BadgeTone {
  switch (status) {
    case 'PAID':
      return 'success';
    case 'PARTIALLY_PAID':
    case 'PENDING':
    case 'AUTHORIZED':
      return 'warning';
    case 'REFUNDED':
    case 'PARTIALLY_REFUNDED':
    case 'VOIDED':
    case 'EXPIRED':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** Maps Shopify fulfillment statuses to a tone. */
export function fulfillmentTone(status: string | null): BadgeTone {
  switch (status) {
    case 'FULFILLED':
      return 'success';
    case 'PARTIALLY_FULFILLED':
    case 'IN_PROGRESS':
    case 'SCHEDULED':
    case 'ON_HOLD':
      return 'warning';
    case 'UNFULFILLED':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function supplierTone(supplier: string): BadgeTone {
  if (supplier === 'TRADELLE') return 'info';
  if (supplier === 'OTHER') return 'neutral';
  return 'neutral';
}

/* --------------------------------------------------------------- callout -- */

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'danger';
  title?: string;
  children: ReactNode;
}) {
  const icon = tone === 'danger' ? '!' : tone === 'warning' ? '!' : 'i';
  return (
    <div className={`callout callout--${tone}`} role={tone === 'info' ? undefined : 'alert'}>
      <span className="callout__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="callout__body">
        {title && <div className="callout__title">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- skeleton -- */

export function Skeleton({ width = '100%', height = 13 }: { width?: string; height?: number }) {
  return <div className="skeleton" style={{ width, height }} />;
}

export function SkeletonTable({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columns }).map((__, columnIndex) => (
                <td key={columnIndex}>
                  <Skeleton width={columnIndex === 0 ? '70%' : '45%'} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid--stats">
      {Array.from({ length: count }).map((_, index) => (
        <div className="stat" key={index}>
          <Skeleton width="55%" height={11} />
          <div style={{ marginTop: 12 }}>
            <Skeleton width="42%" height={24} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- states -- */

export function EmptyState({
  title,
  description,
  icon = '∅',
  action,
}: {
  title: string;
  description?: string;
  icon?: string;
  action?: ReactNode;
}) {
  return (
    <div className="state">
      <div className="state__icon" aria-hidden="true">
        {icon}
      </div>
      <div className="state__title">{title}</div>
      {description && <p className="state__desc">{description}</p>}
      {action}
    </div>
  );
}

/**
 * Error state that surfaces the backend error code verbatim.
 *
 * Showing the code matters: SHOPIFY_SCOPE_MISSING and BACKEND_UNREACHABLE need
 * completely different fixes, and hiding the difference wastes debugging time.
 */
export function ErrorState({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry?: () => void;
}) {
  return (
    <div className="state" role="alert">
      <div className="state__icon" aria-hidden="true">
        !
      </div>
      <div className="state__title">{errorHeadline(error)}</div>
      <div className="state__code">{error.code}</div>
      <p className="state__desc">{error.message}</p>
      {remedy(error) && <p className="state__desc muted">{remedy(error)}</p>}
      {onRetry && !error.isConfigurationProblem && (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

function errorHeadline(error: ApiError): string {
  switch (error.code) {
    case 'BACKEND_UNREACHABLE':
      return 'Cannot reach the Trademart backend';
    case 'SHOPIFY_NOT_CONFIGURED':
      return 'Shopify is not configured';
    case 'SHOPIFY_AUTH_FAILED':
      return 'Could not obtain a Shopify access token';
    case 'SHOPIFY_APP_NOT_INSTALLED':
      return 'The app is not installed on this store';
    case 'SHOPIFY_UNAUTHORIZED':
      return 'Shopify rejected the access token';
    case 'SHOPIFY_SCOPE_MISSING':
      return 'Missing Shopify permission';
    case 'SHOPIFY_THROTTLED':
      return 'Shopify rate limit reached';
    case 'RATE_LIMITED':
      return 'Too many requests';
    case 'UNAUTHORIZED':
      return 'Sign in required';
    case 'CSRF_INVALID':
      return 'Session check failed';
    case 'OPERATOR_NOT_CONFIGURED':
      return 'Operator login is not configured';
    default:
      return 'Something went wrong';
  }
}

function remedy(error: ApiError): string | null {
  switch (error.code) {
    case 'BACKEND_UNREACHABLE':
      return 'Start the backend with `npm run dev` and confirm NEXT_PUBLIC_API_BASE_URL points at it.';
    case 'SHOPIFY_NOT_CONFIGURED':
      return 'Add SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET to the backend .env file and restart the backend.';
    case 'SHOPIFY_AUTH_FAILED':
      return 'Check that SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET match the app in the Shopify Dev Dashboard.';
    case 'SHOPIFY_APP_NOT_INSTALLED':
      return 'Install or update the Trademart app on this store, then retry. The client credentials grant only works on stores where the app is installed.';
    case 'SHOPIFY_SCOPE_MISSING':
      return 'Add the scope in the Shopify Dev Dashboard, release a new app version, then update the install on the store.';
    case 'SHOPIFY_THROTTLED':
      return 'Wait a few seconds and retry - the backend already retries with backoff.';
    case 'UNAUTHORIZED':
      return 'Sign in as an operator, then retry.';
    case 'CSRF_INVALID':
      return 'Your session token is missing or stale. Sign in again.';
    case 'OPERATOR_NOT_CONFIGURED':
      return 'Set OPERATOR_PASSWORD_HASH and SESSION_SECRET on the backend (npm run operator:hash), then restart it.';
    default:
      return null;
  }
}

/* ----------------------------------------------------------------- modal -- */

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // Escape-to-close, and prevent the page behind from scrolling.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- key/value -- */

export function KeyValue({ items }: { items: { key: string; value: ReactNode }[] }) {
  return (
    <div className="kv">
      {items.map((item) => (
        <div key={item.key} style={{ display: 'contents' }}>
          <div className="kv__key">{item.key}</div>
          <div className="kv__value">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
