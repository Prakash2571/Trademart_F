'use client';

/**
 * Dashboard: connection status, counts, revenue, pending fulfillments and any
 * API errors.
 *
 * Every figure is either real backend data or explicitly marked unavailable -
 * nothing is filled in with a placeholder number.
 */

import Link from 'next/link';

import { useApi } from '@/hooks/useApi';
import { Card, Callout, ErrorState, PageHeader, SkeletonStats, StatCard } from '@/components/ui';
import { formatAmount, formatDateTime, formatNumber } from '@/lib/format';
import type { DashboardSummary } from '@/lib/types';

export default function DashboardPage() {
  const { data, loading, error, refetch } = useApi<DashboardSummary>('/dashboard/summary');

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Live overview of the connected Shopify store."
        actions={
          <button type="button" className="btn btn--sm" onClick={refetch} disabled={loading}>
            Refresh
          </button>
        }
      />

      {error ? (
        <Card>
          <ErrorState error={error} onRetry={refetch} />
        </Card>
      ) : loading && !data ? (
        <div className="stack">
          <SkeletonStats count={5} />
        </div>
      ) : data ? (
        <div className="stack">
          {!data.shopify.configured && (
            <Callout tone="warning" title="Shopify is not connected">
              Set <code>SHOPIFY_ACCESS_TOKEN</code> in the backend <code>.env</code> file and
              restart the backend. Until then, product, order, customer and inventory data
              cannot be read.
            </Callout>
          )}

          {data.shopify.configured && !data.shopify.connected && (
            <Callout tone="danger" title="Shopify is configured but unreachable">
              The backend has a token but could not complete a shop query. See the errors
              listed below.
            </Callout>
          )}

          <div className="grid grid--stats">
            <StatCard
              label="Store"
              value={data.shopify.shop?.name ?? data.shopify.storeDomain}
              hint={
                data.shopify.shop
                  ? `${data.shopify.shop.planDisplayName ?? 'Plan unknown'}${
                      data.shopify.shop.isDevelopmentStore ? ' · development store' : ''
                    }`
                  : `API ${data.shopify.apiVersion}`
              }
            />
            <StatCard
              label="Products"
              value={formatNumber(data.counts.products)}
              unavailable={data.counts.products === null}
              hint={data.counts.products === null ? 'Requires read_products' : undefined}
            />
            <StatCard
              label="Orders"
              value={formatNumber(data.counts.orders)}
              unavailable={data.counts.orders === null}
              hint={data.counts.orders === null ? 'Requires read_orders' : undefined}
            />
            <StatCard
              label="Customers"
              value={formatNumber(data.counts.customers)}
              unavailable={data.counts.customers === null}
              hint={data.counts.customers === null ? 'Requires read_customers' : undefined}
            />
            <StatCard
              label="Pending fulfillment"
              value={formatNumber(data.pendingFulfillmentCount)}
              unavailable={data.pendingFulfillmentCount === null}
              hint={
                data.pendingFulfillmentCount === null
                  ? 'Requires order access'
                  : 'Unfulfilled or partially fulfilled'
              }
            />
          </div>

          <div className="grid grid--two">
            <Card title="Revenue">
              {data.revenue ? (
                <>
                  <div className="grid grid--stats">
                    <StatCard
                      label="Revenue (sampled)"
                      value={formatAmount(data.revenue.total, data.revenue.currencyCode)}
                    />
                    <StatCard
                      label="Average order value"
                      value={formatAmount(
                        data.revenue.averageOrderValue,
                        data.revenue.currencyCode,
                      )}
                      unavailable={data.revenue.averageOrderValue === null}
                    />
                  </div>
                  <div className="divider" />
                  {/* The window is always disclosed so these are never mistaken
                      for all-time totals. */}
                  <ul className="note-list">
                    <li>Based on the {data.revenue.window.basedOn}.</li>
                    {data.revenue.window.from && (
                      <li>
                        Window: {formatDateTime(data.revenue.window.from)} –{' '}
                        {formatDateTime(data.revenue.window.to)}
                      </li>
                    )}
                    {data.revenue.window.truncated && (
                      <li>
                        More orders exist than were sampled, so this is not an all-time
                        total.
                      </li>
                    )}
                  </ul>
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  Revenue is unavailable because orders could not be read.
                </p>
              )}
            </Card>

            <Card title="System">
              <div className="kv">
                <div className="kv__key">Store domain</div>
                <div className="kv__value mono">{data.shopify.storeDomain}</div>
                <div className="kv__key">Shopify API version</div>
                <div className="kv__value mono">{data.shopify.apiVersion}</div>
                <div className="kv__key">Shopify connected</div>
                <div className="kv__value">{data.shopify.connected ? 'Yes' : 'No'}</div>
                <div className="kv__key">Database</div>
                <div className="kv__value">
                  {data.database.configured ? data.database.status : 'not configured'}
                </div>
              </div>
              <div className="divider" />
              <Link href="/settings" className="btn btn--sm">
                Open settings
              </Link>
            </Card>
          </div>

          <Card title={`API status${data.errors.length > 0 ? ` (${data.errors.length})` : ''}`}>
            {data.errors.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No API errors reported.
              </p>
            ) : (
              <div className="stack">
                {/* Errors are surfaced rather than swallowed - each names its
                    source and backend error code. */}
                {data.errors.map((item, index) => (
                  <Callout
                    key={`${item.source}-${index}`}
                    tone={item.code === 'SHOPIFY_SCOPE_MISSING' ? 'warning' : 'danger'}
                    title={`${item.source} · ${item.code}`}
                  >
                    {item.message}
                  </Callout>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </>
  );
}
