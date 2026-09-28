'use client';

/**
 * Registered supplier providers and what they can genuinely do.
 *
 * Every row is the provider's own DECLARED capability set, not a guess and not
 * inferred from whether a method happens to exist. Tradelle implements
 * getSupplierCost() as `return null`, so presence-based detection reported a
 * supplier cost feed that does not exist - this page would have shown a green
 * tick for a capability that always returns nothing.
 *
 * There are deliberately NO action controls here. Trademart has no supplier API
 * to call, and a button that cannot work is worse than no button. The one link is
 * to the DeoDap pages, whose flows work from files and records instead of an API.
 */

import Link from 'next/link';

import { Badge, Callout, Card, ErrorState, KeyValue, PageHeader } from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { formatDateTime, formatNumber } from '@/lib/format';
import type { DeodapStatus, SupplierCapabilityFlags, SupplierProviderDto } from '@/lib/types';

/**
 * Capabilities in reading order, with labels.
 *
 * Ordered so identification and the Shopify bridge (the things that DO work)
 * come first, then the API surface that no provider currently implements.
 */
const CAPABILITY_ROWS: { key: keyof SupplierCapabilityFlags; label: string }[] = [
  { key: 'identifyProduct', label: 'Identification' },
  { key: 'shopifyIntegration', label: 'Shopify integration' },
  { key: 'searchProducts', label: 'Direct catalog search' },
  { key: 'getProduct', label: 'Catalog product lookup' },
  { key: 'getSupplierCost', label: 'Supplier-cost API' },
  { key: 'getShippingQuote', label: 'Shipping API' },
  { key: 'getInventory', label: 'Supplier inventory' },
  { key: 'createOrder', label: 'Order API' },
  { key: 'getOrder', label: 'Order lookup' },
  { key: 'cancelOrder', label: 'Order cancellation' },
  { key: 'getTracking', label: 'Tracking' },
];

export default function SuppliersPage() {
  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Registered supplier providers and their real capabilities. Trademart never invents supplier data."
      />
      <SuppliersConsole />
    </>
  );
}

function SuppliersConsole() {
  const providers = useApi<SupplierProviderDto[]>('/suppliers/providers');

  if (providers.error !== null) {
    return (
      <Card title="Providers">
        <ErrorState error={providers.error} onRetry={providers.refetch} />
      </Card>
    );
  }

  if (providers.loading && providers.data === null) {
    return (
      <Card title="Providers">
        <p className="muted">Loading…</p>
      </Card>
    );
  }

  const list = providers.data ?? [];

  return (
    <div className="stack">
      <Callout tone="info" title="How supplier costs actually reach Trademart">
        No registered provider exposes a documented public cost API. Costs come from
        Shopify&apos;s <span className="mono">cost per item</span>, which dropshipping apps write
        when they import a product, or from a manual cost recorded in Trademart - typed in,
        or taken from a DeoDap product file or price list. When neither exists the cost is{' '}
        <span className="mono">UNKNOWN</span> and the product is skipped for automatic pricing —
        it is never priced as if the cost were zero.
      </Callout>

      <DeodapCard />

      {list.map((provider) => (
        <ProviderCard key={provider.providerName} provider={provider} />
      ))}
    </div>
  );
}

function ProviderCard({ provider }: { provider: SupplierProviderDto }) {
  const supported = CAPABILITY_ROWS.filter((row) => provider.capabilities[row.key]);

  return (
    <Card
      title={provider.providerName}
      actions={
        <Badge tone={supported.length > 0 ? 'info' : 'neutral'}>
          {supported.length} of {CAPABILITY_ROWS.length} supported
        </Badge>
      }
    >
      <div className="stack">
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {CAPABILITY_ROWS.map((row) => {
                const enabled = provider.capabilities[row.key];
                const limitation = provider.limitations[row.key];
                return (
                  <tr key={row.key}>
                    <td style={{ width: '30%' }}>{row.label}</td>
                    <td style={{ width: '10%' }}>
                      {enabled ? (
                        <Badge tone="success" dot>
                          yes
                        </Badge>
                      ) : (
                        <Badge tone="neutral">no</Badge>
                      )}
                    </td>
                    <td className="muted">
                      {enabled ? '' : (limitation ?? 'Not supported by this provider.')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted">
          Capabilities are declared by the provider itself, so a method that exists only to
          return <span className="mono">null</span> is reported as unsupported rather than
          available.
        </p>
      </div>
    </Card>
  );
}


/** DeoDap works from files and records, so it gets a way in here as well as its capabilities. */
function DeodapCard() {
  const status = useApi<DeodapStatus>('/suppliers/deodap/status');
  const data = status.data;

  return (
    <Card
      title="DeoDap"
      actions={
        <Link href="/suppliers/deodap" className="btn btn--primary btn--sm">
          Open DeoDap
        </Link>
      }
    >
      <div className="stack" style={{ gap: 10 }}>
        <p style={{ margin: 0 }}>
          Import DeoDap products from a CSV as Shopify drafts with their DeoDap cost, keep costs
          current from newer price lists, and record the orders you place with DeoDap. Nothing
          is sent to DeoDap automatically.
        </p>
        {status.error !== null && (
          <p className="muted" style={{ margin: 0 }}>
            DeoDap status unavailable ({status.error.code}).
          </p>
        )}
        {data !== null && (
          <KeyValue
            items={[
              {
                key: 'Account',
                value: data.credentials.stored
                  ? `saved ${data.credentials.maskedIdentifier ?? ''}`.trim()
                  : 'not saved',
              },
              {
                key: 'Imported products',
                value: data.counts === null ? '—' : formatNumber(data.counts.importedProducts),
              },
              {
                key: 'Recorded orders',
                value: data.counts === null ? '—' : formatNumber(data.counts.recordedOrders),
              },
              { key: 'Settings saved', value: formatDateTime(data.settingsUpdatedAt) },
            ]}
          />
        )}
      </div>
    </Card>
  );
}
