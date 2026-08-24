'use client';

/**
 * /dropshipping/orders - the order book.
 *
 * The dashboard at /dropshipping answers "what needs doing now" over a window. This page
 * is the list itself: every order, paginated, searchable with Shopify's own query syntax.
 * The gap it fills is real — the order detail page existed and was only reachable from a
 * Needs Attention example, so an order that was not flagged could not be found at all.
 *
 * READ-ONLY, like the rest of the module. Fulfilling, refunding and cancelling stay in
 * Shopify, where the merchant's own process and audit trail live.
 *
 * Every money figure carries its confidence, and an UNKNOWN cost renders as "unknown" with
 * the reason attached rather than as 0 — see FigureValue.
 */

import { useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';

import { FigureValue, StateBadge, SupplierBadge } from '@/components/DropshipUi';
import {
  Badge,
  Callout,
  Card,
  EmptyState,
  ErrorCallout,
  PageHeader,
  SkeletonTable,
} from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { formatDateTime, formatNumber } from '@/lib/format';
import type { DropshipOrder } from '@/lib/types';

const PAGE_SIZES = [25, 50, 100] as const;

/**
 * Ready-made Shopify order queries.
 *
 * Offered as presets because Shopify's syntax is powerful and unmemorable. The raw box is
 * still there: re-inventing a filter language on top of one that already works would be a
 * worse version of a thing that works.
 */
const PRESETS: { label: string; query: string }[] = [
  { label: 'Everything', query: '' },
  { label: 'Paid, not fulfilled', query: 'financial_status:paid fulfillment_status:unfulfilled' },
  { label: 'Unfulfilled', query: 'fulfillment_status:unfulfilled' },
  { label: 'Refunded', query: 'financial_status:refunded' },
];

export default function DropshipOrdersPage() {
  const [limit, setLimit] = useState<number>(25);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  /** Cursor stack, so Back walks the pages it actually came through. */
  const [cursors, setCursors] = useState<string[]>([]);

  const cursor = cursors[cursors.length - 1];
  const path = `/dropshipping/orders?limit=${limit}${
    query === '' ? '' : `&query=${encodeURIComponent(query)}`
  }${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`;

  const orders = useApi<DropshipOrder[]>(path, [limit, query, cursor]);
  const rows = orders.data ?? [];
  const meta = orders.meta as
    | { hasNextPage?: boolean; endCursor?: string | null; ordersNeedingAttention?: number; degraded?: string[] }
    | undefined;

  const applyQuery = (next: string) => {
    setQuery(next);
    setQueryInput(next);
    // A new filter invalidates every cursor: page 2 of the old query is meaningless.
    setCursors([]);
  };

  return (
    <>
      <PageHeader
        title="Dropshipping orders"
        description="Every order, with its cost, fulfillment state and supplier. Read-only — fulfilling and refunding stay in Shopify."
        actions={
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <Link href="/dropshipping" className="btn btn--sm">
              Dashboard
            </Link>
          </div>
        }
      />

      {orders.error !== null && <ErrorCallout error={orders.error} />}

      {meta?.degraded !== undefined && meta.degraded.length > 0 && (
        <Callout tone="warning" title="Some fields were not available">
          Shopify withheld: {meta.degraded.join(', ')}. The rows below are complete for
          everything else — the missing fields are reported rather than shown as empty.
        </Callout>
      )}

      <Card
        title="Orders"
        actions={
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <label className="muted" htmlFor="do-limit" style={{ fontSize: 12 }}>
              Per page
            </label>
            <select
              id="do-limit"
              className="select"
              value={limit}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                setLimit(Number(event.target.value));
                setCursors([]);
              }}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        }
      >
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="btn btn--sm"
              onClick={() => applyQuery(preset.query)}
              aria-pressed={query === preset.query}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <form
          className="row"
          style={{ gap: 8, marginBottom: 12 }}
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            applyQuery(queryInput.trim());
          }}
        >
          <input
            className="select"
            style={{ flex: 1, minWidth: 220 }}
            value={queryInput}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setQueryInput(event.target.value)}
            placeholder="Shopify order search, e.g. financial_status:paid"
            aria-label="Shopify order search query"
          />
          <button type="submit" className="btn btn--sm">
            Search
          </button>
        </form>

        {meta?.ordersNeedingAttention !== undefined && meta.ordersNeedingAttention > 0 && (
          <Callout tone="warning" title="Some of these need a human">
            {formatNumber(meta.ordersNeedingAttention)} order(s) on this page carry a warning —
            an unknown cost, a missing tracking number or a late delivery.
          </Callout>
        )}

        {orders.loading && <SkeletonTable rows={6} columns={7} />}

        {!orders.loading && rows.length === 0 && (
          <EmptyState
            title="No orders match"
            description={
              query === ''
                ? 'There are no orders in this store yet.'
                : `No orders matched "${query}". Shopify's own search syntax applies here.`
            }
          />
        )}

        {rows.length > 0 && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Placed</th>
                    <th>State</th>
                    <th>Supplier</th>
                    <th>Revenue</th>
                    <th>Landed cost</th>
                    <th>Contribution</th>
                    <th>Needs attention</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((order) => (
                    <tr key={order.shopifyOrderId}>
                      <td>
                        <Link
                          href={`/dropshipping/orders/${encodeURIComponent(order.shopifyOrderId)}`}
                        >
                          {order.orderName}
                        </Link>
                      </td>
                      <td>{formatDateTime(order.createdAt)}</td>
                      <td>
                        <StateBadge state={order.shipment.normalizedStatus} />
                        {order.shipment.delayed && (
                          <>
                            {' '}
                            <Badge
                              tone="warning"
                              title={order.shipment.delaySignals.join('; ')}
                            >
                              delayed
                            </Badge>
                          </>
                        )}
                      </td>
                      <td>
                        <SupplierBadge
                          supplier={order.supplier}
                          evidence={order.supplierEvidence}
                        />
                      </td>
                      <td>
                        <FigureValue figure={order.economics.customerRevenue} />
                      </td>
                      <td>
                        <FigureValue figure={order.economics.landedCost} />
                      </td>
                      <td>
                        <FigureValue figure={order.economics.estimatedProfit} />
                      </td>
                      <td>
                        {order.warnings.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          <Badge tone="warning" title={order.warnings.join('; ')}>
                            {formatNumber(order.warnings.length)}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="row" style={{ gap: 8, marginTop: 12, alignItems: 'center' }}>
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
                disabled={
                  meta?.hasNextPage !== true ||
                  orders.loading ||
                  meta?.endCursor === null ||
                  meta?.endCursor === undefined
                }
                onClick={() =>
                  setCursors((stack) =>
                    meta?.endCursor === null || meta?.endCursor === undefined
                      ? stack
                      : [...stack, meta.endCursor],
                  )
                }
              >
                Next
              </button>
              <span className="muted" style={{ fontSize: 12 }}>
                Page {cursors.length + 1}
                {meta?.hasNextPage === true ? ' — more available' : ' — last page'}
              </span>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
