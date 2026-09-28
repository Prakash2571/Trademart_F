'use client';

/**
 * /suppliers/deodap/orders - Shopify orders with DeoDap products, and what has been
 * done with DeoDap for each.
 *
 * DeoDap has no order API Trademart can call, so the loop is manual and this page
 * makes it quick: see what to order (SKU x quantity), open the order in Shopify for
 * the delivery address, place it with DeoDap, then record DeoDap's order number and,
 * later, the tracking. Trademart stores no customer data for this - the address is
 * read in Shopify, where it already is.
 *
 * Tracking recorded here is NOT pushed to Shopify yet. The page says so next to it,
 * because an operator who assumed otherwise would leave the customer without tracking.
 */

import Link from 'next/link';
import { useState, type ChangeEvent, type FormEvent } from 'react';

import { DeodapNav } from '@/components/DeodapUi';
import {
  Badge,
  Callout,
  Card,
  EmptyState,
  ErrorCallout,
  Modal,
  PageHeader,
  SkeletonTable,
  financialTone,
  fulfillmentTone,
} from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { ApiError, apiPut } from '@/lib/api';
import {
  ORDER_STATUSES,
  orderStatusLabel,
  orderStatusTone,
  orderSummaryText,
  shopifyAdminUrl,
} from '@/lib/deodap';
import { formatAmount, formatDateTime, formatNumber, humanise } from '@/lib/format';
import type { DeodapOrderStatus, DeodapOrderView, ShopDto } from '@/lib/types';

const PRESETS: { label: string; query: string }[] = [
  { label: 'Open orders', query: 'status:open' },
  { label: 'Unfulfilled', query: 'fulfillment_status:unfulfilled' },
  { label: 'Everything', query: '' },
];

const PAGE_SIZE = 50;

function toApiError(caught: unknown, fallback: string): ApiError {
  return caught instanceof ApiError ? caught : new ApiError('UNKNOWN', fallback, 0);
}

function destinationText(order: DeodapOrderView): string {
  const destination = order.destination;
  if (destination === null) return '—';
  const parts = [destination.city, destination.province ?? destination.provinceCode].filter(
    (part): part is string => part !== null && part.length > 0,
  );
  return parts.length > 0 ? parts.join(', ') : (destination.country ?? '—');
}

export default function DeodapOrdersPage() {
  const [query, setQuery] = useState(PRESETS[0]?.query ?? '');
  const [cursors, setCursors] = useState<string[]>([]);
  const [onlyNeedsAction, setOnlyNeedsAction] = useState(false);
  const [editing, setEditing] = useState<DeodapOrderView | null>(null);

  const cursor = cursors[cursors.length - 1];
  const path = `/suppliers/deodap/orders?limit=${PAGE_SIZE}${
    query === '' ? '' : `&query=${encodeURIComponent(query)}`
  }${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`;

  const orders = useApi<DeodapOrderView[]>(path, [query, cursor]);
  const shop = useApi<ShopDto>('/shopify/shop');
  const meta = orders.meta as
    | { scanned?: number; matched?: number; hasNextPage?: boolean; endCursor?: string | null; degraded?: string[] }
    | undefined;

  const all = orders.data ?? [];
  const rows = onlyNeedsAction ? all.filter((order) => order.needsAction) : all;
  const storeDomain = shop.data?.myshopifyDomain ?? null;

  const choosePreset = (next: string) => {
    setQuery(next);
    setCursors([]);
  };

  return (
    <>
      <PageHeader
        title="DeoDap orders"
        description="Orders with DeoDap products. Place each one with DeoDap, then record DeoDap's order number and tracking here."
      />
      <DeodapNav />

      <div className="stack">
        <Callout tone="info" title="How this works">
          Trademart cannot send orders to DeoDap - there is no DeoDap order API to call. For
          each order below, place the listed items with DeoDap (the delivery address is in
          Shopify), then use <strong>Record</strong> to note DeoDap&apos;s order number and,
          once shipped, the tracking. Tracking saved here is <strong>not</strong> sent to
          Shopify yet: fulfil the order in Shopify with the same tracking number so the
          customer is told.
        </Callout>

        {orders.error !== null && <ErrorCallout error={orders.error} onRetry={orders.refetch} />}

        {meta?.degraded !== undefined && meta.degraded.length > 0 && (
          <Callout tone="warning" title="Some fields were not available">
            Shopify withheld: {meta.degraded.join(', ')}.
          </Callout>
        )}

        <Card
          title="Orders"
          actions={
            <label className="row muted" style={{ gap: 6, fontSize: 12.5 }}>
              <input
                type="checkbox"
                checked={onlyNeedsAction}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setOnlyNeedsAction(event.target.checked)}
              />
              Only orders needing action
            </label>
          }
        >
          <div className="row" style={{ gap: 6, marginBottom: 10 }}>
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={`btn btn--sm${query === preset.query ? ' btn--primary' : ''}`}
                aria-pressed={query === preset.query}
                onClick={() => choosePreset(preset.query)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {meta?.scanned !== undefined && (
            <p className="muted" style={{ margin: '0 0 10px' }}>
              Looked at {formatNumber(meta.scanned)} Shopify order(s) on this page;{' '}
              {formatNumber(meta.matched ?? all.length)} contain DeoDap products. Shopify cannot
              filter orders by supplier, so a page can hold fewer.
            </p>
          )}

          {orders.loading && orders.data === null && <SkeletonTable rows={5} columns={6} />}

          {!orders.loading && rows.length === 0 && (
            <EmptyState
              title="No DeoDap orders here"
              description={
                onlyNeedsAction && all.length > 0
                  ? 'Every DeoDap order on this page has been placed or closed.'
                  : 'No order on this page contains a product identified as DeoDap. Products are recognised by the DeoDap vendor or tag, a configured SKU prefix, or being imported through Trademart.'
              }
            />
          )}

          {rows.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>To</th>
                    <th>Order from DeoDap</th>
                    <th className="table__num">DeoDap cost</th>
                    <th>Shopify</th>
                    <th>DeoDap</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((order) => (
                    <OrderRow
                      key={order.shopifyOrderId}
                      order={order}
                      adminUrl={shopifyAdminUrl(storeDomain, order.shopifyOrderId)}
                      onRecord={() => setEditing(order)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="btn btn--sm"
              disabled={cursors.length === 0 || orders.loading}
              onClick={() => setCursors((stack) => stack.slice(0, -1))}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn--sm"
              disabled={meta?.hasNextPage !== true || orders.loading}
              onClick={() => {
                const next = meta?.endCursor;
                if (typeof next === 'string') setCursors((stack) => [...stack, next]);
              }}
            >
              Older orders
            </button>
          </div>
        </Card>
      </div>

      {editing !== null && (
        <ForwardingEditor
          order={editing}
          adminUrl={shopifyAdminUrl(storeDomain, editing.shopifyOrderId)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            orders.refetch();
          }}
        />
      )}
    </>
  );
}

function OrderRow({
  order,
  adminUrl,
  onRecord,
}: {
  order: DeodapOrderView;
  adminUrl: string | null;
  onRecord: () => void;
}) {
  const forwarding = order.forwarding;
  const status = forwarding?.status ?? null;
  const supplierOrderId = forwarding?.supplierOrderId ?? null;
  const trackingNumber = forwarding?.trackingNumber ?? null;
  const trackingCompany = forwarding?.trackingCompany ?? null;
  return (
    <tr>
      <td>
        <Link href={`/dropshipping/orders/${encodeURIComponent(order.shopifyOrderId)}`}>
          {order.name}
        </Link>
        <div className="muted" style={{ fontSize: 12 }}>
          {formatDateTime(order.createdAt)}
        </div>
        {order.needsAction && (
          <Badge tone={status === 'PROBLEM' ? 'danger' : 'warning'}>needs action</Badge>
        )}
      </td>
      <td className="muted">{destinationText(order)}</td>
      <td>
        <ul className="note-list" style={{ color: 'var(--text)', paddingLeft: 16 }}>
          {order.lines.map((line) => (
            <li key={line.shopifyLineItemId}>
              <span className="mono">{line.sku ?? line.supplierRef ?? 'no SKU'}</span> ×{' '}
              {formatNumber(line.quantity)} - {line.title}
            </li>
          ))}
        </ul>
        {order.otherLineCount > 0 && (
          <div className="muted" style={{ fontSize: 12 }}>
            + {formatNumber(order.otherLineCount)} item(s) from other suppliers
          </div>
        )}
      </td>
      <td className="table__num nowrap">
        {formatAmount(order.supplierCost.total, order.supplierCost.currencyCode)}
        {order.supplierCost.total !== null && !order.supplierCost.complete && (
          <div className="muted" style={{ fontSize: 12 }}>
            at least - some costs unknown
          </div>
        )}
      </td>
      <td>
        <div className="stack" style={{ gap: 4 }}>
          <Badge tone={financialTone(order.financialStatus)}>{humanise(order.financialStatus)}</Badge>
          <Badge tone={fulfillmentTone(order.fulfillmentStatus)}>
            {humanise(order.fulfillmentStatus)}
          </Badge>
          {order.cancelledAt !== null && <Badge tone="danger">cancelled</Badge>}
        </div>
      </td>
      <td>
        <Badge tone={orderStatusTone(status)}>{orderStatusLabel(status)}</Badge>
        {supplierOrderId !== null && (
          <div className="mono" style={{ fontSize: 12, marginTop: 4 }}>
            #{supplierOrderId}
          </div>
        )}
        {trackingNumber !== null && (
          <div className="muted" style={{ fontSize: 12 }}>
            {trackingCompany ?? 'Tracking'}: {trackingNumber}
          </div>
        )}
      </td>
      <td>
        <div className="stack" style={{ gap: 6 }}>
          <button type="button" className="btn btn--sm" onClick={onRecord}>
            Record
          </button>
          {adminUrl !== null && (
            <a href={adminUrl} target="_blank" rel="noopener noreferrer" className="muted" style={{ fontSize: 12 }}>
              Open in Shopify ↗
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}

function ForwardingEditor({
  order,
  adminUrl,
  onClose,
  onSaved,
}: {
  order: DeodapOrderView;
  adminUrl: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const current = order.forwarding;
  const [status, setStatus] = useState<DeodapOrderStatus>(
    current?.status ?? (order.cancelledAt !== null ? 'CANCELLED' : 'PLACED'),
  );
  const [supplierOrderId, setSupplierOrderId] = useState(current?.supplierOrderId ?? '');
  const [trackingCompany, setTrackingCompany] = useState(current?.trackingCompany ?? '');
  const [trackingNumber, setTrackingNumber] = useState(current?.trackingNumber ?? '');
  const [trackingUrl, setTrackingUrl] = useState(current?.trackingUrl ?? '');
  const [note, setNote] = useState(current?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);

  const summary = orderSummaryText(order);
  const urlProblem =
    trackingUrl.trim().length > 0 && !/^https:\/\/\S+$/i.test(trackingUrl.trim())
      ? 'Use a full https:// link, or leave it empty.'
      : null;
  const shippedWithoutTracking =
    (status === 'SHIPPED' || status === 'DELIVERED') && trackingNumber.trim().length === 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied('yes');
    } catch {
      setCopied('failed');
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || urlProblem !== null) return;
    setBusy(true);
    setError(null);
    const text = (value: string): string | null => (value.trim().length > 0 ? value.trim() : null);
    try {
      await apiPut<DeodapOrderView>(
        `/suppliers/deodap/orders/${encodeURIComponent(order.shopifyOrderId)}`,
        {
          status,
          supplierOrderId: text(supplierOrderId),
          trackingCompany: text(trackingCompany),
          trackingNumber: text(trackingNumber),
          trackingUrl: text(trackingUrl),
          note: text(note),
        },
      );
      onSaved();
    } catch (caught) {
      setError(toApiError(caught, 'Saving the DeoDap order failed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`DeoDap order for ${order.name}`} onClose={busy ? () => {} : onClose}>
      <form className="stack" style={{ gap: 12 }} onSubmit={(event) => void save(event)}>
        <div className="field">
          <label className="field__label" htmlFor="forward-summary">
            What to order from DeoDap
          </label>
          <textarea
            id="forward-summary"
            className="input mono"
            readOnly
            rows={Math.min(8, order.lines.length + 1)}
            value={summary}
          />
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn--sm" onClick={() => void copy()}>
              Copy
            </button>
            {copied === 'yes' && <span className="muted">Copied.</span>}
            {copied === 'failed' && <span className="muted">Select the text and copy it instead.</span>}
            {adminUrl !== null && (
              <a href={adminUrl} target="_blank" rel="noopener noreferrer" className="btn btn--sm">
                Delivery address in Shopify ↗
              </a>
            )}
          </div>
        </div>

        {error !== null && <ErrorCallout error={error} />}

        <div className="form-grid">
          <div className="field">
            <label className="field__label" htmlFor="forward-status">
              Status with DeoDap
            </label>
            <select
              id="forward-status"
              className="select"
              value={status}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setStatus(event.target.value as DeodapOrderStatus)
              }
            >
              {ORDER_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {orderStatusLabel(value)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="forward-order-id">
              DeoDap order number
            </label>
            <input
              id="forward-order-id"
              className="input"
              maxLength={100}
              value={supplierOrderId}
              onChange={(event) => setSupplierOrderId(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="forward-carrier">
              Courier
            </label>
            <input
              id="forward-carrier"
              className="input"
              maxLength={100}
              value={trackingCompany}
              onChange={(event) => setTrackingCompany(event.target.value)}
              placeholder="e.g. Delhivery"
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="forward-tracking">
              Tracking number
            </label>
            <input
              id="forward-tracking"
              className="input"
              maxLength={100}
              value={trackingNumber}
              onChange={(event) => setTrackingNumber(event.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="forward-url">
            Tracking link (optional)
          </label>
          <input
            id="forward-url"
            className="input"
            maxLength={500}
            value={trackingUrl}
            onChange={(event) => setTrackingUrl(event.target.value)}
            placeholder="https://"
          />
          {urlProblem !== null && <div className="field__hint">{urlProblem}</div>}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="forward-note">
            Note (optional)
          </label>
          <input
            id="forward-note"
            className="input"
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        {shippedWithoutTracking && (
          <Callout tone="warning" title="No tracking number">
            You can save without one, but the customer has nothing to follow until you add it.
          </Callout>
        )}
        {(status === 'SHIPPED' || status === 'DELIVERED') && (
          <p className="muted" style={{ margin: 0 }}>
            Remember to fulfil the order in Shopify with this tracking number - Trademart does not
            send it to Shopify yet.
          </p>
        )}

        <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy || urlProblem !== null}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
