'use client';

/**
 * /suppliers/deodap/orders - Shopify orders with DeoDap products, and what needs doing.
 *
 * TWO FLOWS, SET ON THE DEODAP PAGE
 * ---------------------------------
 *   DeoDap's Shopify app (the Tradelle model): the app picks the orders up by itself.
 *   This page is then a monitor - each order's progress and tracking as Shopify reports
 *   them (the same StateBadge the dropshipping pages use), with anything that has not
 *   shipped in time flagged by the backend.
 *
 *   By hand: see what to order (SKU x quantity), open the order in Shopify for the
 *   delivery address, place it with DeoDap, then record DeoDap's order number and,
 *   later, the tracking.
 *
 * Products created by Trademart's CSV import are always by hand - DeoDap's app does not
 * know them - and the backend says so per order. Trademart stores no customer data for
 * any of this: the address is read in Shopify, where it already is. Tracking recorded
 * here is NOT pushed to Shopify, and the page says so wherever it matters.
 */

import Link from 'next/link';
import { useState, type ChangeEvent, type FormEvent } from 'react';

import { DeodapNav } from '@/components/DeodapUi';
import { StateBadge } from '@/components/DropshipUi';
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
} from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { ApiError, apiPut } from '@/lib/api';
import {
  ORDER_STATUSES,
  dispatchLabel,
  dispatchTone,
  orderStatusLabel,
  orderSummaryText,
  routeLabel,
  routeTone,
  safeExternalUrl,
  shopifyAdminUrl,
} from '@/lib/deodap';
import { formatAmount, formatDateTime, formatNumber, humanise } from '@/lib/format';
import type { DeodapOrderStatus, DeodapOrdersMeta, DeodapOrderView, ShopDto } from '@/lib/types';

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
  const meta = orders.meta as Partial<DeodapOrdersMeta> | undefined;

  const all = orders.data ?? [];
  const rows = onlyNeedsAction ? all.filter((order) => order.needsAction) : all;
  const storeDomain = shop.data?.myshopifyDomain ?? null;
  const appFlow = meta?.orderFlow === 'SHOPIFY_APP';
  const needingAction = all.filter((order) => order.needsAction).length;

  const choosePreset = (next: string) => {
    setQuery(next);
    setCursors([]);
  };

  return (
    <>
      <PageHeader
        title="DeoDap orders"
        description="Orders with DeoDap products: where each one is, as Shopify reports it, and what needs you."
      />
      <DeodapNav />

      <div className="stack">
        {meta?.orderFlow === undefined ? null : appFlow ? (
          <Callout tone="info" title="DeoDap's Shopify app sends these orders to DeoDap">
            As with Tradelle, DeoDap&apos;s app picks up orders for the products it imported, and
            Trademart watches them in Shopify. An order is flagged if nothing has been dispatched{' '}
            {formatNumber(meta.processingWarningHours ?? null)} hours after it was placed - that is
            what an order the app never received looks like. Items from Trademart&apos;s CSV import
            are the exception: DeoDap&apos;s app does not know them, so you place those yourself.
          </Callout>
        ) : (
          <Callout tone="info" title="You place these orders with DeoDap">
            For each order below, place the listed items with DeoDap (the delivery address is in
            Shopify), then use <strong>Record</strong> to note DeoDap&apos;s order number and, once
            shipped, the tracking. Tracking saved here is <strong>not</strong> sent to Shopify:
            fulfil the order in Shopify with the same tracking number so the customer is told. If
            you use DeoDap&apos;s Shopify app instead, switch the order flow on the{' '}
            <Link href="/suppliers/deodap">DeoDap page</Link>.
          </Callout>
        )}

        {needingAction > 0 && (
          <Callout tone="warning" title={`${formatNumber(needingAction)} order(s) on this page need you`}>
            Each is marked below with the reason.
          </Callout>
        )}

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
                  ? 'No DeoDap order on this page needs you right now.'
                  : 'No order on this page contains a product identified as DeoDap. Products are recognised by a vendor, tag or fulfillment service mentioning DeoDap, a configured SKU prefix, or being imported through Trademart.'
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
                    <th>DeoDap items</th>
                    <th className="table__num">DeoDap cost</th>
                    <th>Progress (Shopify)</th>
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
  const shipment = order.shipment;
  const trackingLink = safeExternalUrl(shipment.trackingUrls[0]);
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
          <>
            <Badge tone={status === 'PROBLEM' ? 'danger' : 'warning'}>needs you</Badge>
            <ul className="note-list" style={{ color: 'var(--warning)', maxWidth: 320 }}>
              {order.attention.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </>
        )}
      </td>
      <td className="muted">{destinationText(order)}</td>
      <td>
        <ul className="note-list" style={{ color: 'var(--text)', paddingLeft: 16 }}>
          {order.lines.map((line) => (
            <li key={line.shopifyLineItemId}>
              <span className="mono">{line.sku ?? line.supplierRef ?? 'no SKU'}</span> ×{' '}
              {formatNumber(line.quantity)} - {line.title}
              {order.route === 'MIXED' && line.route === 'MANUAL' && (
                <span className="muted"> (place yourself)</span>
              )}
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
          <StateBadge state={shipment.normalizedStatus} />
          <Badge tone={financialTone(order.financialStatus)}>{humanise(order.financialStatus)}</Badge>
          {shipment.trackingNumbers.length > 0 && (
            <div className="muted" style={{ fontSize: 12 }}>
              {shipment.carrier ?? 'Tracking'}:{' '}
              {trackingLink !== null ? (
                <a href={trackingLink} target="_blank" rel="noopener noreferrer">
                  {shipment.trackingNumbers[0]}
                </a>
              ) : (
                shipment.trackingNumbers[0]
              )}
              {shipment.trackingNumbers.length > 1 &&
                ` +${formatNumber(shipment.trackingNumbers.length - 1)}`}
            </div>
          )}
        </div>
      </td>
      <td>
        <div className="stack" style={{ gap: 4 }}>
          <Badge tone={routeTone(order.route)}>{routeLabel(order.route)}</Badge>
          <Badge tone={dispatchTone(order)}>{dispatchLabel(order)}</Badge>
        </div>
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

  // In a mixed order only the items to place by hand belong in the text to paste.
  const summary = orderSummaryText(
    order.route === 'MIXED'
      ? { name: order.name, lines: order.lines.filter((line) => line.route === 'MANUAL') }
      : order,
  );
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
        {order.route === 'DEODAP_APP' && (
          <Callout tone="info" title="DeoDap's app handles this order">
            There is nothing to place. Record something only if you need to - DeoDap&apos;s order
            number from the app, or a problem such as an item out of stock.
          </Callout>
        )}
        {order.route === 'MIXED' && (
          <Callout tone="warning" title="Part of this order is yours to place">
            DeoDap&apos;s app sends the items it imported. Place the items marked &quot;place
            yourself&quot; with DeoDap, then record the DeoDap order number here.
          </Callout>
        )}
        <div className="field">
          <label className="field__label" htmlFor="forward-summary">
            {order.route === 'DEODAP_APP' ? 'DeoDap items in this order' : 'What to order from DeoDap'}
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
