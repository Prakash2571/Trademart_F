/**
 * Reusable presentational primitives: stat card, badge, callout, skeletons,
 * empty/error states, card, page header, modal.
 *
 * Grouped in one module because each is small; they are the shared vocabulary
 * every page uses so the dashboard stays consistent.
 */

'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { ApiError } from '@/lib/api';
import { isNoOpFailure, presentError } from '@/lib/errorMessages';
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
  title,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  /**
   * Tooltip text. Badges are necessarily terse, and for state badges the
   * important part is often WHY the state is what it is - "active, NOT published"
   * needs somewhere to say which half is missing.
   */
  title?: string;
}) {
  const suffix = tone === 'neutral' ? '' : ` badge--${tone}`;
  return (
    <span className={`badge${suffix}`} title={title}>
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
  // 'success' exists so a confirmed-good outcome can be stated as strongly as a
  // problem. Publication in particular needs it: "customers can see this" is the
  // one positive claim in the app that has to be unmistakable when it is true,
  // and indistinguishable from neutral information when it is not.
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title?: string;
  children: ReactNode;
}) {
  const icon = tone === 'danger' || tone === 'warning' ? '!' : tone === 'success' ? '\u2713' : 'i';
  return (
    <div
      className={`callout callout--${tone}`}
      // Only problems interrupt a screen reader. A success message is announced
      // politely via the surrounding live region instead of as an alert.
      role={tone === 'danger' || tone === 'warning' ? 'alert' : undefined}
    >
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
  const presentation = presentError(error.code);

  return (
    <div className="state" role="alert">
      <div className="state__icon" aria-hidden="true">
        !
      </div>
      <div className="state__title">{presentation.title}</div>
      <div className="state__code">{error.code}</div>
      <p className="state__desc">{error.message}</p>
      <p className="state__desc muted">{presentation.action}</p>
      {isNoOpFailure(error.code) && (
        <p className="state__desc muted">
          <strong>Nothing was changed.</strong>
        </p>
      )}
      <RequestIdLine requestId={error.requestId} />
      {onRetry && presentation.offerRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * Inline error callout, for a failure attached to one action rather than a whole
 * page. Shows the code, the backend message, what to do, and the request id.
 *
 * The request id is the point: it is what makes "this operation failed" findable
 * across nginx, the backend log and the audit trail.
 */
export function ErrorCallout({
  error,
  onRetry,
  onRefresh,
}: {
  error: ApiError;
  onRetry?: () => void;
  onRefresh?: () => void;
}) {
  const presentation = presentError(error.code);

  return (
    <Callout tone={presentation.tone} title={presentation.title}>
      <p style={{ margin: '0 0 6px' }}>{error.message}</p>
      <p className="muted" style={{ margin: '0 0 6px' }}>
        {presentation.action}
      </p>
      {isNoOpFailure(error.code) && (
        <p style={{ margin: '0 0 6px' }}>
          <strong>Nothing was changed.</strong>
        </p>
      )}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Badge tone="neutral">{error.code}</Badge>
        {onRefresh && presentation.offerRefresh && (
          <button type="button" className="btn btn--sm" onClick={onRefresh}>
            Refresh
          </button>
        )}
        {onRetry && presentation.offerRetry && (
          <button type="button" className="btn btn--sm" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
      <RequestIdLine requestId={error.requestId} />
    </Callout>
  );
}

/** Shows the correlation id, so an operator can quote one value when reporting. */
export function RequestIdLine({ requestId }: { requestId: string | null }) {
  if (requestId === null) return null;
  return (
    <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
      Request id <span className="mono">{requestId}</span> — quote this when reporting the problem.
    </p>
  );
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

/* ------------------------------------------------------- confirm dialog ---- */

export interface ConfirmChange {
  /** What is being changed, e.g. 'Price' or 'Status'. */
  label: string;
  /** Current value. Omit for a create. */
  from?: string | null;
  /** Value after the change. */
  to: string;
}

/**
 * Confirmation dialog for a consequential action.
 *
 * The rule this component exists to enforce: a confirmation must state WHAT will
 * change. "Are you sure?" trains an operator to click through without reading,
 * which makes it worse than no dialog - it adds friction while removing nothing.
 * So `changes` is a required, structured list rather than free text.
 *
 * `requireTypedConfirmation` is for the genuinely irreversible: the operator has
 * to type a word, which cannot be done by muscle memory.
 */
export function ConfirmDialog({
  title,
  intent,
  changes,
  consequence,
  confirmLabel,
  tone = 'warning',
  busy = false,
  requireTypedConfirmation,
  onConfirm,
  onCancel,
}: {
  title: string;
  /** One sentence naming the specific thing being acted on. */
  intent: string;
  changes: ConfirmChange[];
  /** What the operator should understand about the effect. Optional. */
  consequence?: string;
  confirmLabel: string;
  tone?: 'warning' | 'danger' | 'info';
  busy?: boolean;
  requireTypedConfirmation?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  const typedOk =
    requireTypedConfirmation === undefined ||
    typed.trim().toUpperCase() === requireTypedConfirmation.toUpperCase();

  // Focus moves into the dialog on open, so the confirm action is reachable by
  // keyboard without tabbing through the page behind it.
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <Modal title={title} onClose={busy ? () => {} : onCancel}>
      <div className="stack">
        <p style={{ margin: 0 }}>{intent}</p>

        {changes.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>From</th>
                  <th>To</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((change) => (
                  <tr key={`${change.label}-${change.to}`}>
                    <td>{change.label}</td>
                    <td className="mono muted">
                      {change.from === undefined || change.from === null ? '—' : change.from}
                    </td>
                    <td className="mono">
                      <strong>{change.to}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {consequence !== undefined && (
          <Callout tone={tone} title="What this means">
            {consequence}
          </Callout>
        )}

        {requireTypedConfirmation !== undefined && (
          <div className="field">
            <label className="field__label" htmlFor="confirm-typed">
              Type <span className="mono">{requireTypedConfirmation}</span> to confirm
            </label>
            <input
              id="confirm-typed"
              className="input"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              disabled={busy}
            />
          </div>
        )}

        <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={tone === 'danger' ? 'btn btn--danger' : 'btn btn--primary'}
            onClick={onConfirm}
            disabled={busy || !typedOk}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------- visibility indicator ---- */

/**
 * The single component allowed to state whether customers can see a product.
 *
 * Takes `status` and `publishedToOnlineStore` SEPARATELY and requires both,
 * because either one alone is wrong: an ACTIVE product published to no channel is
 * invisible, and a published DRAFT is invisible too. `publishedToOnlineStore` of
 * null means the backend could not read publication state (usually a missing
 * read_publications scope), which is reported as unknown rather than guessed.
 */
export function VisibilityBadge({
  status,
  publishedToOnlineStore,
}: {
  status: string;
  publishedToOnlineStore: boolean | null;
}) {
  if (publishedToOnlineStore === null) {
    return (
      <Badge tone="neutral" title="Publication state could not be read from Shopify">
        visibility unknown
      </Badge>
    );
  }
  if (status === 'ACTIVE' && publishedToOnlineStore) {
    return (
      <Badge tone="success" dot title="ACTIVE and published to the Online Store">
        visible to customers
      </Badge>
    );
  }
  if (status === 'ACTIVE' && !publishedToOnlineStore) {
    return (
      <Badge tone="warning" title="ACTIVE but not published to the Online Store">
        active, NOT published
      </Badge>
    );
  }
  if (status !== 'ACTIVE' && publishedToOnlineStore) {
    return (
      <Badge tone="warning" title={`Published to the Online Store but status is ${status}`}>
        published but {status.toLowerCase()}
      </Badge>
    );
  }
  return <Badge tone="neutral">hidden ({status.toLowerCase()})</Badge>;
}
