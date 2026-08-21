'use client';

/**
 * /dropshipping/orders/[id] - one order, in full.
 *
 * Sections, in the order an operator asks the questions:
 *   ORDER      what is this and did they pay
 *   WARNINGS   what is wrong with it (first, so it cannot be missed)
 *   FINANCIALS what did it cost and what will I make
 *   SUPPLIER   who is fulfilling it, and how do we know
 *   SHIPMENT   where is the parcel
 *   TIMELINE   how it got there
 *   ITEMS      what was bought
 *
 * READ-ONLY. There are no fulfil/refund/cancel actions here on purpose: those stay
 * in Shopify, where the merchant's own process and audit trail live and where a
 * mistake is recoverable by someone who knows the tools.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';

import {
  ConfidenceBadge,
  FigureValue,
  StateBadge,
  SupplierBadge,
  describeState,
} from '@/components/DropshipUi';
import {
  Badge,
  Callout,
  Card,
  ErrorCallout,
  KeyValue,
  PageHeader,
  SkeletonTable,
} from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { formatAmount, formatDateTime, formatNumber, shortGid } from '@/lib/format';
import type { DropshipFulfillmentState, DropshipOrder } from '@/lib/types';

export default function DropshipOrderPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : '';
  const order = useApi<DropshipOrder>(
    id === '' ? null : `/dropshipping/orders/${encodeURIComponent(id)}`,
    [id],
  );
  const data = order.data;

  return (
    <>
      <PageHeader
        title={data === null ? 'Order' : data.orderName}
        description="Normalised from Shopify. Fulfilling, refunding and cancelling stay in Shopify."
        actions={
          <div className="row" style={{ gap: 8 }}>
            <Link className="btn btn--sm" href="/dropshipping">
              Back to dropshipping
            </Link>
            <button className="btn btn--sm" onClick={order.refetch} disabled={order.loading}>
              Refresh
            </button>
          </div>
        }
      />

      {order.error !== null && <ErrorCallout error={order.error} onRetry={order.refetch} />}

      {data === null && order.error === null ? (
        <SkeletonTable rows={6} columns={2} />
      ) : data === null ? null : (
        <div className="stack">
          <OrderSection order={data} />
          <WarningsSection order={data} />
          <FinancialsSection order={data} />
          <SupplierSection order={data} />
          <ShipmentSection order={data} />
          <TimelineSection order={data} />
          <ItemsSection order={data} />
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ order -- */

function OrderSection({ order }: { order: DropshipOrder }) {
  const region = order.customerRegion;
  return (
    <Card title="Order">
      <div className="stack">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <StateBadge state={order.displayState} />
          {/*
            When the order is late, show the PROGRESS state too. The collapsed badge
            says DELAYED, which alone would hide where the parcel actually is.
          */}
          {order.shipment.delayed &&
            order.shipment.normalizedStatus !== 'DELAYED' && (
              <StateBadge
                state={order.shipment.normalizedStatus}
                title="The parcel's actual position. It is also late — see Shipment."
              />
            )}
          <SupplierBadge supplier={order.supplier} evidence={order.supplierEvidence} />
        </div>

        <KeyValue
          items={[
            { key: 'Placed', value: formatDateTime(order.createdAt) },
            {
              key: 'Payment',
              value:
                order.paymentStatus === null ? (
                  <span className="muted">not reported</span>
                ) : (
                  <Badge tone={order.paymentStatus === 'PAID' ? 'success' : 'warning'}>
                    {order.paymentStatus.toLowerCase().replace(/_/g, ' ')}
                  </Badge>
                ),
            },
            {
              key: 'Destination',
              value:
                region === null ? (
                  // A withheld field, NOT an order without a destination.
                  <span
                    className="muted"
                    title="Shopify withheld the shipping address. This requires approved protected customer data access — it does not mean the order has no destination."
                  >
                    withheld by Shopify
                  </span>
                ) : (
                  [region.city, region.province, region.country]
                    .filter((part) => part !== null && part !== '')
                    .join(', ') || <span className="muted">not reported</span>
                ),
            },
            {
              key: 'Shopify order id',
              value: <span className="mono">{shortGid(order.shopifyOrderId)}</span>,
            },
          ]}
        />
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- warnings -- */

function WarningsSection({ order }: { order: DropshipOrder }) {
  if (order.warnings.length === 0) return null;
  return (
    <Card title={`Warnings (${formatNumber(order.warnings.length)})`}>
      <div className="stack">
        {order.warnings.map((warning) => (
          <Callout key={warning} tone="warning" title="Needs attention">
            {warning}
          </Callout>
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------- financials -- */

function FinancialsSection({ order }: { order: DropshipOrder }) {
  const economics = order.economics;

  return (
    <Card title="Financials">
      <div className="stack">
        {economics.missingInputs.length > 0 && (
          <Callout tone="warning" title="Some figures cannot be calculated">
            Missing: {economics.missingInputs.join(', ')}. Unknown costs are left unknown
            rather than treated as zero, so contribution and margin are withheld rather
            than shown as flattering numbers.
          </Callout>
        )}

        {/* Landed cost: what the supplier is owed. */}
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Landed cost — what the supplier is owed
          </div>
          <KeyValue
            items={[
              {
                key: 'Supplier product cost',
                value: <FigureValue figure={economics.supplierProductCost} />,
              },
              {
                key: 'Supplier shipping',
                value: <FigureValue figure={economics.supplierShippingCost} />,
              },
              ...(economics.supplierFulfillmentCost.amount !== 0
                ? [
                    {
                      key: 'Fulfillment surcharge',
                      value: <FigureValue figure={economics.supplierFulfillmentCost} />,
                    },
                  ]
                : []),
              {
                key: 'Landed cost',
                value: <FigureValue figure={economics.landedCost} />,
              },
            ]}
          />
        </div>

        {/* Commercial cost: the basis of contribution. */}
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Commercial cost — landed cost plus fees and allowances
          </div>
          <KeyValue
            items={[
              { key: 'Payment fees', value: <FigureValue figure={economics.paymentFees} /> },
              { key: 'Platform fees', value: <FigureValue figure={economics.shopifyFees} /> },
              {
                key: 'Advertising allowance',
                value: <FigureValue figure={economics.advertisingAllowance} />,
              },
              ...(economics.otherCommercialCosts.amount !== 0
                ? [
                    {
                      key: 'Other commercial costs',
                      value: <FigureValue figure={economics.otherCommercialCosts} />,
                    },
                  ]
                : []),
              {
                key: 'Commercial cost',
                value: <FigureValue figure={economics.commercialCost} />,
              },
            ]}
          />
        </div>

        {/* The outcome. */}
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Outcome
          </div>
          <KeyValue
            items={[
              {
                key: 'Customer paid',
                value: <FigureValue figure={economics.customerRevenue} />,
              },
              {
                key: 'Estimated contribution',
                value: <FigureValue figure={economics.estimatedProfit} />,
              },
              {
                key: 'Estimated margin',
                value:
                  economics.estimatedMargin.value === null ? (
                    <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                      <span className="muted">unknown</span>
                      <ConfidenceBadge
                        confidence="UNKNOWN"
                        title="Margin needs both a known revenue and a known commercial cost."
                      />
                    </span>
                  ) : (
                    <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                      <span>{economics.estimatedMargin.value.toFixed(1)}%</span>
                      {economics.estimatedMargin.confidence !== 'KNOWN' && (
                        <ConfidenceBadge confidence={economics.estimatedMargin.confidence} />
                      )}
                    </span>
                  ),
              },
            ]}
          />
        </div>

        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Margin is contribution as a percentage of revenue. Fee figures are estimates
          from configured rates, not the amounts a processor actually charged.
        </p>
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- supplier -- */

function SupplierSection({ order }: { order: DropshipOrder }) {
  return (
    <Card title="Supplier">
      <div className="stack">
        <div className="row" style={{ gap: 8 }}>
          <SupplierBadge supplier={order.supplier} evidence={order.supplierEvidence} />
        </div>

        {order.supplierEvidence.length > 0 ? (
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Evidence — why Trademart attributed this order
            </div>
            <ul className="note-list">
              {order.supplierEvidence.map((entry) => (
                <li key={entry} className="mono" style={{ fontSize: 12 }}>
                  {entry}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            No vendor, tag or fulfillment service identified the supplier, so it is
            reported as unknown rather than guessed.
          </p>
        )}
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- shipment -- */

function ShipmentSection({ order }: { order: DropshipOrder }) {
  const shipment = order.shipment;

  return (
    <Card title="Shipment">
      <div className="stack">
        {shipment.delayed && (
          <Callout tone="warning" title="This order is late">
            <ul className="note-list">
              {shipment.delaySignals.map((signal) => (
                <li key={signal}>{signal}</li>
              ))}
            </ul>
          </Callout>
        )}

        <KeyValue
          items={[
            {
              key: 'State',
              value: <StateBadge state={shipment.normalizedStatus} />,
            },
            {
              key: 'Carrier',
              value: shipment.carrier ?? <span className="muted">not reported</span>,
            },
            {
              key: 'Tracking',
              value:
                shipment.tracking.length === 0 ? (
                  <span
                    className="muted"
                    title="No tracking number has been supplied. The customer can see nothing at all until one exists."
                  >
                    none yet
                  </span>
                ) : (
                  <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    {shipment.tracking.map((parcel, index) => (
                      <span key={`${parcel.number ?? 'p'}-${index}`} className="mono">
                        {parcel.url === null ? (
                          parcel.number ?? 'unknown'
                        ) : (
                          <a href={parcel.url} target="_blank" rel="noreferrer noopener">
                            {parcel.number ?? 'track'}
                          </a>
                        )}
                      </span>
                    ))}
                  </span>
                ),
            },
            {
              key: 'Estimated delivery',
              value:
                shipment.estimatedDeliveryAt === null ? (
                  <span className="muted">no estimate from the carrier</span>
                ) : (
                  formatDateTime(shipment.estimatedDeliveryAt)
                ),
            },
            {
              key: 'In transit since',
              value:
                shipment.inTransitAt === null ? (
                  <span className="muted">—</span>
                ) : (
                  formatDateTime(shipment.inTransitAt)
                ),
            },
            {
              key: 'Delivered',
              value:
                shipment.deliveredAt === null ? (
                  <span className="muted">not yet</span>
                ) : (
                  formatDateTime(shipment.deliveredAt)
                ),
            },
          ]}
        />

        {/*
          Shopify's own wording, always. When a normalisation looks wrong this is what
          makes it checkable rather than a mystery.
        */}
        <details>
          <summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>
            Raw Shopify status
          </summary>
          <div className="mono" style={{ fontSize: 12, marginTop: 6 }}>
            <div>
              order.displayFulfillmentStatus:{' '}
              {shipment.rawShopifyStatus.orderFulfillmentStatus ?? 'null'}
            </div>
            <div>
              fulfillment.displayStatus:{' '}
              {shipment.rawShopifyStatus.fulfillmentDisplayStatuses.length === 0
                ? 'no fulfillments'
                : shipment.rawShopifyStatus.fulfillmentDisplayStatuses
                    .map((status) => status ?? 'null')
                    .join(', ')}
            </div>
          </div>
        </details>
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- timeline -- */

/** The journey, as fixed milestones so gaps are visible rather than invisible. */
const MILESTONES: { state: DropshipFulfillmentState; label: string }[] = [
  { state: 'ORDER_RECEIVED', label: 'Order received' },
  { state: 'SUPPLIER_PROCESSING', label: 'Supplier processing' },
  { state: 'CARRIER_PICKED_UP', label: 'Carrier picked up' },
  { state: 'IN_TRANSIT', label: 'In transit' },
  { state: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { state: 'DELIVERED', label: 'Delivered' },
];

/** Progress ranking, mirroring the backend's STATE_RANK. */
const RANK: Record<DropshipFulfillmentState, number> = {
  UNKNOWN: 0,
  ORDER_RECEIVED: 1,
  AWAITING_SUPPLIER: 2,
  SUPPLIER_PROCESSING: 3,
  FULFILLED: 4,
  LABEL_CREATED: 5,
  CARRIER_PICKED_UP: 6,
  IN_TRANSIT: 7,
  OUT_FOR_DELIVERY: 8,
  DELIVERED: 9,
  DELAYED: 0,
  DELIVERY_FAILED: 10,
  CANCELLED: 11,
};

function TimelineSection({ order }: { order: DropshipOrder }) {
  const current = order.shipment.normalizedStatus;
  const currentRank = RANK[current] ?? 0;
  const events = order.shipment.events;

  return (
    <Card title="Timeline">
      <div className="stack">
        {current === 'UNKNOWN' ? (
          <Callout tone="warning" title="Progress could not be determined">
            Shopify did not report a status Trademart could interpret. This does{' '}
            <strong>not</strong> mean the order is being processed — open it in Shopify to
            check.
          </Callout>
        ) : (
          <ul className="note-list" style={{ listStyle: 'none', paddingLeft: 0 }}>
            {MILESTONES.map((milestone) => {
              const reached = currentRank >= RANK[milestone.state];
              const isCurrent = milestone.state === current;
              return (
                <li key={milestone.state} style={{ opacity: reached ? 1 : 0.45 }}>
                  <span aria-hidden="true" style={{ marginRight: 8 }}>
                    {isCurrent ? '●' : reached ? '✓' : '○'}
                  </span>
                  {milestone.label}
                  {isCurrent && (
                    <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                      (current)
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {(current === 'DELIVERY_FAILED' || current === 'CANCELLED') && (
          <Callout tone={current === 'CANCELLED' ? 'info' : 'danger'} title={describeState(current)}>
            {current === 'CANCELLED'
              ? 'This order was cancelled, so the journey above stopped.'
              : 'A delivery was attempted and did not succeed. Contact the carrier or the customer.'}
          </Callout>
        )}

        {events.length > 0 && (
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Carrier scans (newest first)
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Status</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event, index) => (
                    <tr key={`${event.happenedAt ?? 'e'}-${index}`}>
                      <td>{formatDateTime(event.happenedAt)}</td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {event.status ?? '—'}
                      </td>
                      <td>{event.message ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ items -- */

function ItemsSection({ order }: { order: DropshipOrder }) {
  const currency = order.economics.currencyCode;

  return (
    <Card title={`Items (${formatNumber(order.items.length)})`}>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th style={{ textAlign: 'right' }}>Qty</th>
              <th style={{ textAlign: 'right' }}>Customer paid</th>
              <th style={{ textAlign: 'right' }}>Unit cost</th>
              <th style={{ textAlign: 'right' }}>Unit shipping</th>
              <th>Supplier</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.shopifyLineItemId}>
                <td>{item.title}</td>
                <td className="mono" style={{ fontSize: 12 }}>
                  {item.sku ?? '—'}
                </td>
                <td style={{ textAlign: 'right' }}>{formatNumber(item.quantity)}</td>
                <td style={{ textAlign: 'right' }}>
                  {formatAmount(item.lineRevenue, currency)}
                </td>
                <td style={{ textAlign: 'right' }} title={item.unitCostSource}>
                  {item.unitCost === null ? (
                    <span className="muted" title={item.unitCostSource}>
                      unknown
                    </span>
                  ) : (
                    formatAmount(item.unitCost, currency)
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {item.unitShippingCost === null ? (
                    <span
                      className="muted"
                      title="No supplier shipping cost is recorded for this variant. Unknown, not free."
                    >
                      unknown
                    </span>
                  ) : (
                    formatAmount(item.unitShippingCost, currency)
                  )}
                </td>
                <td>
                  <SupplierBadge supplier={item.supplier} evidence={item.supplierEvidence} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
        Unit cost is Shopify&apos;s cost per item, or a recorded supplier cost where one
        exists — hover a value to see which. An unknown cost is never shown as zero.
      </p>
    </Card>
  );
}
