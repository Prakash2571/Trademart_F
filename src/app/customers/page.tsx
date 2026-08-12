'use client';

/**
 * Customers: read-only, and privacy-aware.
 *
 * PII is only rendered when Shopify actually returned it. When protected
 * customer data is withheld, the page still works and says why.
 */

import { DataTable, type Column } from '@/components/DataTable';
import { Badge, Callout, Card, PageHeader } from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { NOT_AVAILABLE, formatDate, formatMoney, formatNumber, humanise, shortGid } from '@/lib/format';
import type { CustomerDto } from '@/lib/types';

export default function CustomersPage() {
  const { data, meta, loading, error, refetch } = useApi<CustomerDto[]>(
    '/shopify/customers?limit=50',
  );

  const degraded = meta?.degraded;
  const piiWithheld = Boolean(degraded && degraded.length > 0);

  const columns: Column<CustomerDto>[] = [
    {
      key: 'customer',
      header: 'Customer',
      render: (customer) =>
        customer.displayName ? (
          <div>
            <div className="table__strong">{customer.displayName}</div>
            {customer.email && (
              <div className="muted" style={{ fontSize: 11.5 }}>
                {customer.email}
              </div>
            )}
          </div>
        ) : (
          // No name available: identify by Shopify id rather than inventing one.
          <div>
            <div className="mono">{shortGid(customer.shopifyCustomerId)}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>
              name withheld
            </div>
          </div>
        ),
    },
    {
      key: 'state',
      header: 'State',
      render: (customer) =>
        customer.state ? (
          <Badge tone={customer.state === 'ENABLED' ? 'success' : 'neutral'}>
            {humanise(customer.state)}
          </Badge>
        ) : (
          <span className="muted">{NOT_AVAILABLE}</span>
        ),
    },
    {
      key: 'orders',
      header: 'Orders',
      align: 'right',
      render: (customer) => formatNumber(customer.ordersCount),
    },
    {
      key: 'spent',
      header: 'Total spent',
      align: 'right',
      render: (customer) => formatMoney(customer.amountSpent),
    },
    {
      key: 'location',
      header: 'Location',
      render: (customer) => customer.location ?? <span className="muted">{NOT_AVAILABLE}</span>,
    },
    {
      key: 'created',
      header: 'Created',
      render: (customer) => <span className="nowrap">{formatDate(customer.createdAt)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        description="Read-only customer list. Trademart does not store customer personal data."
      />

      <div className="stack">
        {piiWithheld && (
          <Callout tone="warning" title="Personal details withheld by Shopify">
            Shopify did not return <code>{degraded?.join(', ')}</code>. Apps need the{' '}
            <code>read_customers</code> scope and Shopify&apos;s protected customer data
            approval to read personal fields. Aggregates below are still accurate.
          </Callout>
        )}

        <Callout tone="info">
          Only fields permitted by the granted scopes are requested, and no customer PII is
          persisted by Trademart.
        </Callout>

        <Card bodyless>
          <DataTable
            columns={columns}
            rows={data}
            getRowKey={(customer) => customer.shopifyCustomerId}
            loading={loading}
            error={error}
            onRetry={refetch}
            emptyTitle="No customers found"
            emptyDescription="This Shopify store has no customers yet, or none are visible to the app."
          />
        </Card>
      </div>
    </>
  );
}
