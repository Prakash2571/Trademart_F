'use client';

/**
 * /dropshipping - the operations dashboard.
 *
 * Answers, in this order of prominence:
 *   1. what needs attention right now
 *   2. how much supplier cash am I committed to
 *   3. where is everything
 *   4. what is the money doing
 *
 * Needs Attention is FIRST because that is the daily job. Totals are further down:
 * they are context, not tasks, and a dashboard that leads with revenue trains the
 * operator to scroll past the thing that needed doing.
 *
 * Every figure carries its confidence. A total that excluded orders says so on the
 * number itself, because a revenue figure covering 40 of 50 orders is not revenue.
 */

import { useState, type ChangeEvent } from 'react';
import Link from 'next/link';

import {
  AggregateValue,
  StateBadge,
} from '@/components/DropshipUi';
import {
  Badge,
  Callout,
  Card,
  EmptyState,
  ErrorCallout,
  KeyValue,
  PageHeader,
  SkeletonStats,
  StatCard,
} from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { formatDateTime, formatNumber, formatPercent } from '@/lib/format';
import type {
  AttentionBucket,
  DropshipDashboard,
  DropshipFulfillmentState,
  DropshipSettings,
} from '@/lib/types';

/** Window sizes. Small enough to stay fast, large enough to be representative. */
const WINDOWS = [50, 100, 250] as const;

export default function DropshippingPage() {
  const [window, setWindow] = useState<number>(100);
  const dashboard = useApi<DropshipDashboard>(`/dropshipping/dashboard?limit=${window}`, [
    window,
  ]);
  const settings = useApi<DropshipSettings>('/dropshipping/settings');
  const data = dashboard.data;

  return (
    <>
      <PageHeader
        title="Dropshipping"
        description="Orders, fulfillment, cost and supplier cash exposure — normalised from Shopify. Trademart reports on these orders; fulfilling and refunding stay in Shopify."
        actions={
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <label className="muted" htmlFor="ds-window" style={{ fontSize: 12 }}>
              Window
            </label>
            <select
              id="ds-window"
              className="select"
              value={window}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setWindow(Number(event.target.value))
              }
            >
              {WINDOWS.map((size) => (
                <option key={size} value={size}>
                  last {size} orders
                </option>
              ))}
            </select>
            <button
              className="btn btn--sm"
              onClick={dashboard.refetch}
              disabled={dashboard.loading}
            >
              Refresh
            </button>
            {/*
              This dashboard is a WINDOW over recent orders. Without these links the only
              route to a specific order was a Needs Attention example, so an order that
              was not flagged could not be reached at all.
            */}
            <Link className="btn btn--sm" href="/dropshipping/orders">
              All orders
            </Link>
            <Link className="btn btn--sm" href="/dropshipping/settings">
              Settings
            </Link>
          </div>
        }
      />

      {dashboard.error !== null && (
        <ErrorCallout error={dashboard.error} onRetry={dashboard.refetch} />
      )}

      {data === null && dashboard.error === null ? (
        <SkeletonStats count={4} />
      ) : data === null ? null : (
        <div className="stack">
          {/*
            Scope first. "Revenue" over the last 100 orders is a very different claim
            from all-time revenue, and the difference must never be guessable.
          */}
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Computed from the most recent {formatNumber(data.ordersConsidered)} order(s) —
            not all-time totals. Generated {formatDateTime(data.generatedAt)}.
          </p>

          {data.warnings.map((warning) => (
            <Callout key={warning} tone="warning" title="Coverage">
              {warning}
            </Callout>
          ))}

          <AttentionSection buckets={data.attention} />

          <ExposureSection dashboard={data} />

          <Card title="Where everything is">
            <div className="grid grid--stats">
              <StatCard label="Orders today" value={formatNumber(data.ordersToday)} />
              <StatCard label="Orders this week" value={formatNumber(data.ordersThisWeek)} />
            </div>
            <div style={{ height: 12 }} />
            <StateGrid dashboard={data} />
          </Card>

          <MoneySection dashboard={data} settings={settings.data} />
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------- attention -- */

const SEVERITY_ORDER: Record<AttentionBucket['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function AttentionSection({ buckets }: { buckets: AttentionBucket[] }) {
  if (buckets.length === 0) {
    return (
      <Card title="Needs attention">
        <EmptyState
          title="Nothing needs attention"
          description="No failed deliveries, delays, missing tracking, unknown costs or thin margins in this window."
        />
      </Card>
    );
  }

  const sorted = [...buckets].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count,
  );

  return (
    <Card title="Needs attention">
      <div className="stack">
        {sorted.map((bucket) => (
          <div key={bucket.code} className="card">
            <div className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 18 }}>{formatNumber(bucket.count)}</strong>
              <span>{bucket.label}</span>
              <Badge
                tone={
                  bucket.severity === 'critical'
                    ? 'danger'
                    : bucket.severity === 'warning'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {bucket.severity}
              </Badge>
            </div>
            {/* The action, always. A count with no remedy is not actionable. */}
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
              {bucket.action}
            </p>
            {bucket.examples.length > 0 && (
              <div
                className="row"
                style={{ gap: 8, flexWrap: 'wrap', marginTop: 6, fontSize: 13 }}
              >
                {bucket.examples.map((example) => (
                  <Link
                    key={example.shopifyOrderId}
                    href={`/dropshipping/orders/${encodeURIComponent(example.shopifyOrderId)}`}
                  >
                    {example.orderName}
                  </Link>
                ))}
                {bucket.count > bucket.examples.length && (
                  <span className="muted">
                    +{formatNumber(bucket.count - bucket.examples.length)} more
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------- exposure -- */

function ExposureSection({ dashboard }: { dashboard: DropshipDashboard }) {
  const exposure = dashboard.exposure;

  return (
    <Card title="Supplier cash exposure">
      <div className="stack">
        {/*
          The headline number. Prominent because it answers a cash question, and
          because understating it is the expensive direction to be wrong in.
        */}
        <div>
          <div className="muted" style={{ fontSize: 12 }}>
            Outstanding supplier exposure — cash still needed to keep these orders moving
          </div>
          <div style={{ fontSize: 30, fontWeight: 600, marginTop: 2 }}>
            <AggregateValue aggregate={exposure.outstanding} />
          </div>
        </div>

        {exposure.warnings.map((warning) => (
          <Callout key={warning} tone="warning" title="This figure is incomplete">
            {warning}
          </Callout>
        ))}

        <KeyValue
          items={[
            {
              key: 'Paid customer orders',
              value: <AggregateValue aggregate={exposure.paidCustomerOrders} />,
            },
            {
              key: 'Estimated supplier commitments',
              value: <AggregateValue aggregate={exposure.supplierCommitments} />,
            },
            {
              key: 'Already fulfilled',
              value: <AggregateValue aggregate={exposure.alreadyFulfilled} />,
            },
            {
              key: 'Paid orders with no known cost',
              value:
                exposure.ordersWithUnknownCost === 0 ? (
                  <Badge tone="success">none</Badge>
                ) : (
                  <Badge
                    tone="warning"
                    title="These orders are in none of the figures above, so the real exposure is higher."
                  >
                    {formatNumber(exposure.ordersWithUnknownCost)}
                  </Badge>
                ),
            },
          ]}
        />

        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Built from <strong>landed</strong> cost — supplier goods plus supplier shipping.
          Payment fees and advertising allowances are deliberately excluded: the supplier
          does not invoice you for those, so including them would overstate the cash you
          need to hold.
        </p>
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------------- states -- */

function StateGrid({ dashboard }: { dashboard: DropshipDashboard }) {
  const counts = dashboard.counts;
  const cells: { state: DropshipFulfillmentState; count: number }[] = [
    { state: 'AWAITING_SUPPLIER', count: counts.awaitingFulfillment },
    { state: 'SUPPLIER_PROCESSING', count: counts.processing },
    { state: 'FULFILLED', count: counts.shipped },
    { state: 'IN_TRANSIT', count: counts.inTransit },
    { state: 'OUT_FOR_DELIVERY', count: counts.outForDelivery },
    { state: 'DELIVERED', count: counts.delivered },
    { state: 'DELIVERY_FAILED', count: counts.deliveryFailed },
    { state: 'CANCELLED', count: counts.cancelled },
    { state: 'UNKNOWN', count: counts.unknown },
  ];

  return (
    <div className="stack">
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        {cells
          .filter((cell) => cell.count > 0)
          .map((cell) => (
            <span key={cell.state} className="row" style={{ gap: 6, alignItems: 'center' }}>
              <strong>{formatNumber(cell.count)}</strong>
              <StateBadge state={cell.state} />
            </span>
          ))}
        {cells.every((cell) => cell.count === 0) && (
          <span className="muted">No orders in this window.</span>
        )}
      </div>

      {counts.delayed > 0 && (
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          <strong>{formatNumber(counts.delayed)}</strong> of these are also{' '}
          <StateBadge state="DELAYED" /> — lateness is counted alongside the state above,
          not instead of it, so an order can be in transit and late at the same time.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ money -- */

function MoneySection({
  dashboard,
  settings,
}: {
  dashboard: DropshipDashboard;
  settings: DropshipSettings | null;
}) {
  return (
    <Card title="Money">
      <div className="stack">
        <KeyValue
          items={[
            { key: 'Customer revenue', value: <AggregateValue aggregate={dashboard.revenue} /> },
            {
              key: 'Landed cost (owed to suppliers)',
              value: <AggregateValue aggregate={dashboard.supplierCost} />,
            },
            {
              key: 'Commercial cost (landed + fees + allowances)',
              value: <AggregateValue aggregate={dashboard.commercialCost} />,
            },
            {
              key: 'Estimated contribution',
              value: <AggregateValue aggregate={dashboard.estimatedProfit} />,
            },
            {
              key: 'Estimated margin',
              value:
                dashboard.estimatedMarginPercentage === null ? (
                  <span className="muted" title="No order in this window has both a known revenue and a known cost.">
                    unknown
                  </span>
                ) : (
                  formatPercent(dashboard.estimatedMarginPercentage)
                ),
            },
          ]}
        />

        {/*
          The thresholds a margin was computed with. "41%" means one thing with an
          advertising allowance deducted and another without, so the inputs are shown
          next to the number rather than buried in a settings page.
        */}
        {settings !== null && (
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Commercial cost includes:{' '}
            {[
              settings.cost.includeSupplierShipping ? 'supplier shipping' : null,
              settings.cost.includePaymentFees
                ? `payment fees (${settings.cost.paymentFeePercentage}%)`
                : null,
              settings.cost.includeShopifyFees
                ? `platform fees (${settings.cost.shopifyFeePercentage}%)`
                : null,
              settings.cost.includeAdvertisingAllowance
                ? `advertising allowance (${settings.cost.advertisingAllowancePercentage}%)`
                : null,
            ]
              .filter((entry) => entry !== null)
              .join(', ') || 'landed cost only'}
            . Fee figures are estimates from configured rates, not the amounts a
            processor actually charged. Orders are flagged below{' '}
            {settings.cost.minimumMarginPercentage}% margin
            {settings.cost.minimumProfitAmount > 0
              ? ` or ${formatNumber(settings.cost.minimumProfitAmount)} contribution`
              : ''}
            .
          </p>
        )}
      </div>
    </Card>
  );
}
