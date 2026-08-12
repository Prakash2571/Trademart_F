'use client';

/**
 * Analytics from real Shopify data only.
 *
 * Two rules this page follows strictly:
 *  - the sampling window is always shown next to the numbers
 *  - traffic/sessions render an explicit "unavailable" card; they are never
 *    inferred from order counts
 */

import { DataTable, type Column } from '@/components/DataTable';
import { Card, Callout, ErrorState, PageHeader, SkeletonStats, StatCard } from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { formatAmount, formatDateTime, formatNumber } from '@/lib/format';
import type { AnalyticsOverview, TrafficAvailability } from '@/lib/types';

export default function AnalyticsPage() {
  const overview = useApi<AnalyticsOverview>('/analytics/overview?limit=100');
  const traffic = useApi<TrafficAvailability>('/analytics/traffic');

  const data = overview.data;
  const currency = data?.currencyCode ?? null;

  const columns: Column<AnalyticsOverview['topProducts'][number]>[] = [
    {
      key: 'title',
      header: 'Product',
      render: (row) => <span className="truncate">{row.title}</span>,
    },
    {
      key: 'units',
      header: 'Units sold',
      align: 'right',
      render: (row) => formatNumber(row.unitsSold),
    },
    {
      key: 'revenue',
      header: 'Revenue',
      align: 'right',
      render: (row) => formatAmount(row.revenue, currency),
    },
  ];

  const maxDayRevenue = data
    ? Math.max(...data.ordersByDay.map((day) => day.revenue), 0)
    : 0;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Aggregates computed from real Shopify orders. Nothing on this page is estimated or simulated."
      />

      {overview.error ? (
        <Card>
          <ErrorState error={overview.error} onRetry={overview.refetch} />
        </Card>
      ) : overview.loading && !data ? (
        <SkeletonStats count={4} />
      ) : data ? (
        <div className="stack">
          <Callout tone="info" title="What these numbers cover">
            Based on the {data.window.basedOn}.
            {data.window.from && (
              <>
                {' '}
                Window: {formatDateTime(data.window.from)} – {formatDateTime(data.window.to)}.
              </>
            )}
            {data.window.truncated && ' More orders exist than were sampled.'}
          </Callout>

          <div className="grid grid--stats">
            <StatCard
              label="Revenue (sampled)"
              value={formatAmount(data.totalRevenue, currency)}
            />
            <StatCard label="Orders" value={formatNumber(data.orderCount)} />
            <StatCard
              label="Average order value"
              value={formatAmount(data.averageOrderValue, currency)}
              unavailable={data.averageOrderValue === null}
              hint={data.averageOrderValue === null ? 'No orders in window' : undefined}
            />
            <StatCard
              label="Pending fulfillment"
              value={formatNumber(data.pendingFulfillmentCount)}
            />
          </div>

          <div className="grid grid--stats">
            <StatCard label="Discounts" value={formatAmount(data.totalDiscounts, currency)} />
            <StatCard label="Shipping" value={formatAmount(data.totalShipping, currency)} />
            <StatCard label="Tax" value={formatAmount(data.totalTax, currency)} />
          </div>

          <div className="grid grid--two">
            <Card title="Revenue by day">
              {data.ordersByDay.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  No orders in the sampled window.
                </p>
              ) : (
                <>
                  <div className="spark" role="img" aria-label="Revenue by day">
                    {data.ordersByDay.map((day) => (
                      <div
                        key={day.date}
                        className="spark__bar"
                        style={{
                          height:
                            maxDayRevenue > 0
                              ? `${Math.max((day.revenue / maxDayRevenue) * 100, 2)}%`
                              : '2%',
                        }}
                        title={`${day.date}: ${formatAmount(day.revenue, currency)} (${day.orders} order(s))`}
                      />
                    ))}
                  </div>
                  <div className="row muted" style={{ justifyContent: 'space-between', marginTop: 8, fontSize: 11.5 }}>
                    <span>{data.ordersByDay[0]?.date}</span>
                    <span>{data.ordersByDay[data.ordersByDay.length - 1]?.date}</span>
                  </div>
                </>
              )}
            </Card>

            <Card title="Order status">
              <h3 style={{ fontSize: 12.5, marginBottom: 8 }} className="muted">
                Payment
              </h3>
              <StatusBars breakdown={data.financialStatusBreakdown} total={data.orderCount} />
              <div className="divider" />
              <h3 style={{ fontSize: 12.5, marginBottom: 8 }} className="muted">
                Fulfillment
              </h3>
              <StatusBars breakdown={data.fulfillmentStatusBreakdown} total={data.orderCount} />
            </Card>
          </div>

          <Card title="Top products by revenue" bodyless>
            <DataTable
              columns={columns}
              rows={data.topProducts}
              getRowKey={(row) => row.shopifyProductId ?? row.title}
              emptyTitle="No product sales in this window"
            />
          </Card>

          <div className="grid grid--two">
            <Card title="Estimated margin">
              {/* Honest unavailability rather than a fabricated margin. */}
              <Callout tone="warning" title="Not available">
                {data.estimatedMargin.reason}
              </Callout>
            </Card>

            <Card title="Traffic &amp; store reach">
              {traffic.loading ? (
                <p className="muted" style={{ margin: 0 }}>
                  Checking availability…
                </p>
              ) : traffic.data ? (
                <>
                  <Callout tone="warning" title="Not available">
                    {traffic.data.reason}
                  </Callout>
                  <div className="divider" />
                  <div className="kv">
                    <div className="kv__key">Required scope</div>
                    <div className="kv__value mono">{traffic.data.requiredScope}</div>
                    <div className="kv__key">Documentation</div>
                    <div className="kv__value">
                      <a href={traffic.data.documentation} target="_blank" rel="noopener noreferrer">
                        shopify.dev
                      </a>
                    </div>
                  </div>
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  Traffic availability could not be determined.
                </p>
              )}
            </Card>
          </div>

          <Card title="Notes">
            <ul className="note-list">
              {data.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </>
  );
}

function StatusBars({
  breakdown,
  total,
}: {
  breakdown: Record<string, number>;
  total: number;
}) {
  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        No data.
      </p>
    );
  }
  return (
    <div className="stack" style={{ gap: 9 }}>
      {entries.map(([status, count]) => (
        <div key={status}>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5 }}>
            <span>{status}</span>
            <span className="muted">{count}</span>
          </div>
          <div className="bar" style={{ marginTop: 4 }}>
            <div
              className="bar__fill"
              style={{ width: total > 0 ? `${(count / total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
