'use client';

/**
 * Orders list + detail drawer.
 *
 * All money shown comes straight from Shopify order fields. Shipping and
 * tracking are shown exactly as Shopify reports them - Tradelle's internal
 * shipping cost is a supplier-side value Shopify does not know, so it is not
 * implied anywhere here.
 */

import { useMemo, useState } from 'react';

import { DataTable, type Column } from '@/components/DataTable';
import {
  Badge,
  Callout,
  Card,
  Modal,
  PageHeader,
  financialTone,
  fulfillmentTone,
  supplierTone,
} from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { query } from '@/lib/api';
import { NOT_AVAILABLE, formatDateTime, formatMoney, formatNumber, humanise } from '@/lib/format';
import type { OrderDto } from '@/lib/types';

export default function OrdersPage() {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selected, setSelected] = useState<OrderDto | null>(null);

  const path = useMemo(
    () => `/shopify/orders${query({ limit: 50, query: appliedSearch || undefined })}`,
    [appliedSearch],
  );
  const { data, meta, loading, error, refetch } = useApi<OrderDto[]>(path);

  const columns: Column<OrderDto>[] = [
    {
      key: 'name',
      header: 'Order',
      render: (order) => <span className="table__strong">{order.name}</span>,
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (order) =>
        order.customer ? (
          <div>
            <div>{order.customer.displayName ?? NOT_AVAILABLE}</div>
            {order.customer.email && (
              <div className="muted" style={{ fontSize: 11.5 }}>
                {order.customer.email}
              </div>
            )}
          </div>
        ) : (
          <span className="muted">{NOT_AVAILABLE}</span>
        ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (order) => <span className="nowrap">{formatDateTime(order.createdAt)}</span>,
    },
    {
      key: 'total',
      header: 'Amount',
      align: 'right',
      render: (order) => <span className="table__strong">{formatMoney(order.total)}</span>,
    },
    {
      key: 'financial',
      header: 'Payment',
      render: (order) => (
        <Badge tone={financialTone(order.financialStatus)}>
          {humanise(order.financialStatus)}
        </Badge>
      ),
    },
    {
      key: 'fulfillment',
      header: 'Fulfillment',
      render: (order) => (
        <Badge tone={fulfillmentTone(order.fulfillmentStatus)}>
          {humanise(order.fulfillmentStatus)}
        </Badge>
      ),
    },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (order) => (
        <Badge tone={supplierTone(order.supplier)}>{humanise(order.supplier)}</Badge>
      ),
    },
  ];

  const degraded = meta?.degraded;

  return (
    <>
      <PageHeader
        title="Orders"
        description="Shopify orders with financial and fulfillment status. Values are reported exactly as Shopify provides them."
      />

      <div className="stack">
        {degraded && degraded.length > 0 && (
          <Callout tone="warning" title="Customer details withheld">
            Shopify did not return <code>{degraded.join(', ')}</code>. This normally means the
            app lacks <code>read_customers</code> or protected customer data approval. Order
            financials are unaffected.
          </Callout>
        )}

        <form
          className="toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedSearch(search.trim());
          }}
        >
          <input
            className="input"
            style={{ maxWidth: 340 }}
            placeholder="Shopify search, e.g. financial_status:paid"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search orders"
          />
          <button type="submit" className="btn btn--primary btn--sm">
            Search
          </button>
          {appliedSearch && (
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                setSearch('');
                setAppliedSearch('');
              }}
            >
              Clear
            </button>
          )}
          <div className="toolbar__spacer" />
          <span className="muted" style={{ fontSize: 12.5 }}>
            {data ? `${data.length} shown` : ''}
          </span>
        </form>

        <Card
          bodyless
          footer={
            meta?.hasNextPage
              ? 'More orders exist. Pagination beyond the first page is not implemented in this milestone.'
              : undefined
          }
        >
          <DataTable
            columns={columns}
            rows={data}
            getRowKey={(order) => order.shopifyOrderId}
            loading={loading}
            error={error}
            onRetry={refetch}
            onRowClick={setSelected}
            emptyTitle="No orders found"
            emptyDescription={
              appliedSearch
                ? 'No orders matched that search.'
                : 'This Shopify store has no orders yet.'
            }
          />
        </Card>
      </div>

      {selected && (
        <Modal title={`Order ${selected.name}`} onClose={() => setSelected(null)}>
          <div className="stack">
            <div className="kv">
              <div className="kv__key">Placed</div>
              <div className="kv__value">{formatDateTime(selected.createdAt)}</div>
              <div className="kv__key">Payment</div>
              <div className="kv__value">
                <Badge tone={financialTone(selected.financialStatus)}>
                  {humanise(selected.financialStatus)}
                </Badge>
              </div>
              <div className="kv__key">Fulfillment</div>
              <div className="kv__value">
                <Badge tone={fulfillmentTone(selected.fulfillmentStatus)}>
                  {humanise(selected.fulfillmentStatus)}
                </Badge>
              </div>
              <div className="kv__key">Customer</div>
              <div className="kv__value">
                {selected.customer?.displayName ?? selected.customer?.email ?? NOT_AVAILABLE}
              </div>
            </div>

            <div className="divider" />
            <h3 style={{ fontSize: 13.5 }}>Line items</h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>SKU</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Unit</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lineItems.map((item) => (
                    <tr key={item.shopifyLineItemId}>
                      <td>
                        <div>{item.title}</div>
                        {item.vendor && (
                          <div className="muted" style={{ fontSize: 11.5 }}>
                            {item.vendor}
                          </div>
                        )}
                      </td>
                      <td className="mono">{item.sku ?? NOT_AVAILABLE}</td>
                      <td className="table__num">{formatNumber(item.quantity)}</td>
                      <td className="table__num">{formatMoney(item.unitPrice)}</td>
                      <td className="table__num">{formatMoney(item.discountedTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divider" />
            <div className="kv">
              <div className="kv__key">Subtotal</div>
              <div className="kv__value">{formatMoney(selected.subtotal)}</div>
              <div className="kv__key">Discounts</div>
              <div className="kv__value">{formatMoney(selected.totalDiscounts)}</div>
              <div className="kv__key">Shipping</div>
              <div className="kv__value">{formatMoney(selected.totalShipping)}</div>
              <div className="kv__key">Tax</div>
              <div className="kv__value">{formatMoney(selected.totalTax)}</div>
              <div className="kv__key">Total</div>
              <div className="kv__value table__strong">{formatMoney(selected.total)}</div>
            </div>

            <div className="divider" />
            <h3 style={{ fontSize: 13.5 }}>Shipping &amp; tracking</h3>
            {selected.shippingLine || selected.fulfillments.length > 0 ? (
              <div className="kv">
                <div className="kv__key">Shipping method</div>
                <div className="kv__value">{selected.shippingLine?.title ?? NOT_AVAILABLE}</div>
                <div className="kv__key">Carrier</div>
                <div className="kv__value">{selected.shippingLine?.carrier ?? NOT_AVAILABLE}</div>
                {selected.fulfillments.map((fulfillment) => (
                  <div key={fulfillment.id} style={{ display: 'contents' }}>
                    <div className="kv__key">Tracking ({humanise(fulfillment.status)})</div>
                    <div className="kv__value">
                      {fulfillment.trackingNumber ? (
                        <>
                          <span className="mono">{fulfillment.trackingNumber}</span>
                          {fulfillment.trackingCompany && ` · ${fulfillment.trackingCompany}`}
                          {fulfillment.trackingUrl && (
                            <>
                              {' · '}
                              <a
                                href={fulfillment.trackingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Track
                              </a>
                            </>
                          )}
                        </>
                      ) : (
                        NOT_AVAILABLE
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                Shopify has no shipping or tracking information for this order.
              </p>
            )}

            <Callout tone="info">
              Supplier-side shipping cost (for example Tradelle&apos;s internal cost) is not
              part of Shopify&apos;s data and is therefore not shown.
            </Callout>
          </div>
        </Modal>
      )}
    </>
  );
}
