'use client';

/**
 * Products list: title, status, supplier, price, SKU, inventory, and estimated
 * supplier cost / margin when Shopify actually supplies a cost per item.
 *
 * Margin is computed ONLY from a real Shopify unitCost. When that is absent the
 * cell shows a dash, never a guess.
 */

import { useMemo, useState } from 'react';

import { DataTable, type Column } from '@/components/DataTable';
import { Badge, Callout, Card, Modal, PageHeader, supplierTone } from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { query } from '@/lib/api';
import { NOT_AVAILABLE, formatDate, formatMoney, formatNumber, formatPercent, humanise, shortGid } from '@/lib/format';
import type { ProductDto } from '@/lib/types';

function statusTone(status: string) {
  if (status === 'ACTIVE') return 'success' as const;
  if (status === 'DRAFT') return 'warning' as const;
  return 'neutral' as const;
}

/** First variant is the representative row value for a list view. */
function primaryVariant(product: ProductDto) {
  return product.variants[0] ?? null;
}

/** Estimated margin from Shopify's own cost-per-item, or null. */
function estimatedMargin(product: ProductDto): number | null {
  const variant = primaryVariant(product);
  const price = variant?.price?.amount;
  const cost = variant?.unitCost?.amount;
  if (price === undefined || cost === undefined || price <= 0) return null;
  return ((price - cost) / price) * 100;
}

export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selected, setSelected] = useState<ProductDto | null>(null);

  const path = useMemo(
    () => `/shopify/products${query({ limit: 50, query: appliedSearch || undefined })}`,
    [appliedSearch],
  );
  const { data, meta, loading, error, refetch } = useApi<ProductDto[]>(path);

  const columns: Column<ProductDto>[] = [
    {
      key: 'title',
      header: 'Product',
      render: (product) => (
        <div>
          <div className="table__strong truncate">{product.title}</div>
          <div className="muted mono" style={{ fontSize: 11.5 }}>
            {shortGid(product.shopifyProductId)}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (product) => (
        <Badge tone={statusTone(product.status)}>{humanise(product.status)}</Badge>
      ),
    },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (product) => (
        <Badge tone={supplierTone(product.supplier)}>{humanise(product.supplier)}</Badge>
      ),
    },
    {
      key: 'sku',
      header: 'SKU',
      render: (product) => (
        <span className="mono">{primaryVariant(product)?.sku ?? NOT_AVAILABLE}</span>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      render: (product) => formatMoney(product.minPrice ?? primaryVariant(product)?.price),
    },
    {
      key: 'inventory',
      header: 'Inventory',
      align: 'right',
      render: (product) =>
        product.totalInventory === null ? (
          <span className="muted">{NOT_AVAILABLE}</span>
        ) : (
          formatNumber(product.totalInventory)
        ),
    },
    {
      key: 'cost',
      header: 'Supplier cost',
      align: 'right',
      render: (product) => {
        const cost = primaryVariant(product)?.unitCost;
        return cost ? formatMoney(cost) : <span className="muted">{NOT_AVAILABLE}</span>;
      },
    },
    {
      key: 'margin',
      header: 'Est. margin',
      align: 'right',
      render: (product) => {
        const margin = estimatedMargin(product);
        return margin === null ? (
          <span className="muted">{NOT_AVAILABLE}</span>
        ) : (
          formatPercent(margin)
        );
      },
    },
  ];

  const degraded = meta?.degraded;

  return (
    <>
      <PageHeader
        title="Products"
        description="Read-only view of Shopify products. Bulk editing is intentionally not enabled."
      />

      <div className="stack">
        {degraded && degraded.length > 0 && (
          <Callout tone="warning" title="Some fields were unavailable">
            Shopify withheld: <code>{degraded.join(', ')}</code>. This usually means the app
            is missing the <code>read_inventory</code> scope, so inventory and cost columns
            show a dash instead of a guess.
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
            placeholder="Shopify search, e.g. status:active vendor:Tradelle"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search products"
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
              ? 'More products exist. Pagination beyond the first page is not implemented in this milestone.'
              : undefined
          }
        >
          <DataTable
            columns={columns}
            rows={data}
            getRowKey={(product) => product.shopifyProductId}
            loading={loading}
            error={error}
            onRetry={refetch}
            onRowClick={setSelected}
            emptyTitle="No products found"
            emptyDescription={
              appliedSearch
                ? 'No products matched that search.'
                : 'This Shopify store has no products yet.'
            }
          />
        </Card>
      </div>

      {selected && (
        <Modal title={selected.title} onClose={() => setSelected(null)}>
          <div className="stack">
            <div className="kv">
              <div className="kv__key">Shopify ID</div>
              <div className="kv__value mono">{selected.shopifyProductId}</div>
              <div className="kv__key">Status</div>
              <div className="kv__value">{humanise(selected.status)}</div>
              <div className="kv__key">Vendor</div>
              <div className="kv__value">{selected.vendor ?? NOT_AVAILABLE}</div>
              <div className="kv__key">Product type</div>
              <div className="kv__value">{selected.productType ?? NOT_AVAILABLE}</div>
              <div className="kv__key">Supplier</div>
              <div className="kv__value">
                <Badge tone={supplierTone(selected.supplier)}>
                  {humanise(selected.supplier)}
                </Badge>
              </div>
              <div className="kv__key">Classification evidence</div>
              <div className="kv__value mono">
                {selected.supplierEvidence.length > 0
                  ? selected.supplierEvidence.join(', ')
                  : 'none'}
              </div>
              <div className="kv__key">Tags</div>
              <div className="kv__value">
                {selected.tags.length > 0 ? (
                  <span className="tag-list">
                    {selected.tags.map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </span>
                ) : (
                  NOT_AVAILABLE
                )}
              </div>
              <div className="kv__key">Created</div>
              <div className="kv__value">{formatDate(selected.createdAt)}</div>
              <div className="kv__key">Updated</div>
              <div className="kv__value">{formatDate(selected.updatedAt)}</div>
            </div>

            {selected.description && (
              <>
                <div className="divider" />
                <p className="muted" style={{ margin: 0 }}>
                  {selected.description}
                </p>
              </>
            )}

            <div className="divider" />
            <h3 style={{ fontSize: 13.5 }}>Variants ({selected.variants.length})</h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Variant</th>
                    <th>SKU</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                    <th style={{ textAlign: 'right' }}>Compare at</th>
                    <th style={{ textAlign: 'right' }}>Cost</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.variants.map((variant) => (
                    <tr key={variant.shopifyVariantId}>
                      <td>{variant.title}</td>
                      <td className="mono">{variant.sku ?? NOT_AVAILABLE}</td>
                      <td className="table__num">{formatMoney(variant.price)}</td>
                      <td className="table__num">{formatMoney(variant.compareAtPrice)}</td>
                      <td className="table__num">{formatMoney(variant.unitCost)}</td>
                      <td className="table__num">
                        {variant.inventoryQuantity === null
                          ? NOT_AVAILABLE
                          : formatNumber(variant.inventoryQuantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
