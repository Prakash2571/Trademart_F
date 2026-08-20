'use client';

/**
 * Review queue: products automation held back for a human decision.
 *
 * These are products carrying the trademart:needs-review tag, which the
 * automation applies instead of publishing a newly imported product. The queue
 * is the deliberate human step - the whole point of the draft/review gate is
 * that somebody looks before a customer does.
 *
 * Approval reuses POST /api/automation/approve rather than reimplementing it, so
 * the tag removal and the publish stay in one place on the backend.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';

import { Badge, Callout, Card, EmptyState, ErrorState, PageHeader } from '@/components/ui';
import { CostSourceBadge, ManualCostEditor } from '@/components/ManualCostEditor';
import { useApi } from '@/hooks/useApi';
import { ApiError, apiPatch, apiPost } from '@/lib/api';
import { formatMoney, formatNumber, shortGid } from '@/lib/format';
import type {
  AutomationStatus,
  ManualCostRecord,
  ProductDto,
  ProductVariantDto,
} from '@/lib/types';

/** The tag automation applies to hold a product for review. */
const REVIEW_TAG = 'trademart:needs-review';
/** Adding this tag takes a product out of automation permanently. */
const NO_AUTOMATION_TAG = 'trademart:no-automation';

export default function ProductReviewPage() {
  return (
    <>
      <PageHeader
        title="Review queue"
        description="Products automation held back for a human decision. Nothing here is visible to customers until you approve it."
      />
      <ReviewConsole />
    </>
  );
}

function ReviewConsole() {
  // Shopify search syntax. The tag contains a colon, so it must be quoted.
  const listPath = `/shopify/products?limit=50&query=${encodeURIComponent(`tag:'${REVIEW_TAG}'`)}`;
  const products = useApi<{ products: ProductDto[] }>(listPath);
  const status = useApi<AutomationStatus>('/automation/status');
  const costs = useApi<{ costs: ManualCostRecord[] }>('/costs');

  const writesEnabled = status.data?.writesEnabled ?? false;

  /** Manual costs keyed by "productId|variantId" for quick lookup. */
  const costIndex = useMemo(() => {
    const index = new Map<string, ManualCostRecord>();
    for (const cost of costs.data?.costs ?? []) {
      index.set(`${cost.shopifyProductId}|${cost.shopifyVariantId ?? ''}`, cost);
    }
    return index;
  }, [costs.data]);

  if (products.error !== null) {
    return (
      <Card title="Review queue">
        <ErrorState error={products.error} onRetry={products.refetch} />
      </Card>
    );
  }

  if (products.loading && products.data === null) {
    return (
      <Card title="Review queue">
        <p className="muted">Loading…</p>
      </Card>
    );
  }

  const list = products.data?.products ?? [];

  return (
    <div className="stack">
      {!writesEnabled && (
        <Callout tone="info" title="Approving is disabled">
          Publishing a product writes to the live store, which needs{' '}
          <span className="mono">AUTOMATION_ENABLED=true</span> on the backend. You can still
          inspect items, set manual costs, and edit products.
        </Callout>
      )}

      <Card title={`Awaiting review (${list.length})`}>
        {list.length === 0 ? (
          <EmptyState
            title="Nothing awaiting review"
            description={`No product currently carries the ${REVIEW_TAG} tag.`}
          />
        ) : (
          <p className="muted">
            Each item shows the real data Trademart holds. A cost of{' '}
            <span className="mono">UNKNOWN</span> means automation will skip it for pricing.
          </p>
        )}
      </Card>

      {list.map((product) => (
        <ReviewItem
          key={product.shopifyProductId}
          product={product}
          writesEnabled={writesEnabled}
          costIndex={costIndex}
          onChanged={() => {
            products.refetch();
            costs.refetch();
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- one item ---- */

function ReviewItem({
  product,
  writesEnabled,
  costIndex,
  onChanged,
}: {
  product: ProductDto;
  writesEnabled: boolean;
  costIndex: Map<string, ManualCostRecord>;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [costTarget, setCostTarget] = useState<ProductVariantDto | 'product' | null>(null);

  const currency =
    product.minPrice?.currencyCode ?? product.variants[0]?.price?.currencyCode ?? 'GBP';

  const productCost = costIndex.get(`${product.shopifyProductId}|`) ?? null;

  const approve = async () => {
    setBusy('approve');
    setError(null);
    try {
      // Reuses the backend's approve logic: removes the review/hidden tags and
      // sets the product ACTIVE. Not reimplemented here.
      await apiPost<unknown>('/automation/approve', { productId: product.shopifyProductId });
      onChanged();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught : new ApiError('UNKNOWN', 'Approve failed.', 0),
      );
    } finally {
      setBusy(null);
    }
  };

  const keepDraft = async () => {
    setBusy('draft');
    setError(null);
    try {
      // Explicitly pin it to DRAFT and drop the review tag, so it stops
      // reappearing in this queue without becoming visible to customers.
      await apiPatch<unknown>(`/shopify/products/${encodeURIComponent(product.shopifyProductId)}`, {
        status: 'DRAFT',
        removeTags: [REVIEW_TAG],
      });
      onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError('UNKNOWN', 'Update failed.', 0));
    } finally {
      setBusy(null);
    }
  };

  const excludeFromAutomation = async () => {
    setBusy('exclude');
    setError(null);
    try {
      await apiPatch<unknown>(`/shopify/products/${encodeURIComponent(product.shopifyProductId)}`, {
        addTags: [NO_AUTOMATION_TAG],
      });
      onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError('UNKNOWN', 'Update failed.', 0));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card
      title={product.title}
      actions={
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link
            className="btn btn--sm"
            href={`/products/${encodeURIComponent(product.shopifyProductId)}`}
          >
            Edit
          </Link>
          <button
            className="btn btn--sm"
            onClick={() => setCostTarget('product')}
            disabled={busy !== null}
          >
            Set manual cost
          </button>
          <button className="btn btn--sm" onClick={keepDraft} disabled={busy !== null}>
            {busy === 'draft' ? 'Saving…' : 'Keep draft'}
          </button>
          <button
            className="btn btn--sm"
            onClick={excludeFromAutomation}
            disabled={busy !== null}
            title={`Adds the ${NO_AUTOMATION_TAG} tag so automation never touches this product`}
          >
            {busy === 'exclude' ? 'Saving…' : 'Exclude from automation'}
          </button>
          <button
            className="btn btn--primary btn--sm"
            onClick={approve}
            disabled={busy !== null || !writesEnabled}
            title={
              writesEnabled
                ? 'Removes the review tag and sets the product ACTIVE'
                : 'Enable writes on the backend first (AUTOMATION_ENABLED=true)'
            }
          >
            {busy === 'approve' ? 'Approving…' : 'Approve & publish'}
          </button>
        </div>
      }
    >
      <div className="stack">
        {error !== null && (
          <Callout tone="danger" title={error.code}>
            {error.message}
          </Callout>
        )}

        <div className="row" style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {product.featuredImageUrl !== null && (
            // Plain <img>: next/image would need the loader configured for every
            // CDN host, and this is a diagnostic thumbnail.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.featuredImageUrl}
              alt=""
              width={96}
              height={96}
              style={{ objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
            />
          )}
          <div className="kv" style={{ flex: 1, minWidth: 280 }}>
            <div className="kv__key">Shopify ID</div>
            <div className="kv__value mono">{shortGid(product.shopifyProductId)}</div>
            <div className="kv__key">Status</div>
            <div className="kv__value">
              <Badge tone={product.status === 'ACTIVE' ? 'success' : 'neutral'}>
                {product.status}
              </Badge>
            </div>
            <div className="kv__key">Vendor</div>
            <div className="kv__value">{product.vendor ?? '—'}</div>
            <div className="kv__key">Detected supplier</div>
            <div className="kv__value">
              <Badge tone={product.supplier === 'TRADELLE' ? 'info' : 'neutral'}>
                {product.supplier}
              </Badge>
            </div>
            <div className="kv__key">Supplier evidence</div>
            <div className="kv__value muted">
              {product.supplierEvidence.length > 0
                ? product.supplierEvidence.join(', ')
                : 'none — classification is a guess only when evidence is listed'}
            </div>
            <div className="kv__key">Inventory</div>
            <div className="kv__value">{formatNumber(product.totalInventory)}</div>
            <div className="kv__key">Tags</div>
            <div className="kv__value">
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {product.tags.length === 0 ? (
                  <span className="muted">none</span>
                ) : (
                  product.tags.map((tag) => (
                    <Badge key={tag} tone={tag === REVIEW_TAG ? 'warning' : 'neutral'}>
                      {tag}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <VariantTable
          product={product}
          costIndex={costIndex}
          onSetCost={(variant) => setCostTarget(variant)}
        />
      </div>

      {costTarget !== null && (
        <ManualCostEditor
          productId={product.shopifyProductId}
          variantId={costTarget === 'product' ? null : costTarget.shopifyVariantId}
          existing={
            costTarget === 'product'
              ? productCost
              : (costIndex.get(
                  `${product.shopifyProductId}|${costTarget.shopifyVariantId}`,
                ) ?? null)
          }
          defaultCurrency={currency}
          onClose={() => setCostTarget(null)}
          onSaved={onChanged}
        />
      )}
    </Card>
  );
}

/* ---------------------------------------------------------- variant table -- */

function VariantTable({
  product,
  costIndex,
  onSetCost,
}: {
  product: ProductDto;
  costIndex: Map<string, ManualCostRecord>;
  onSetCost: (variant: ProductVariantDto) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Variant</th>
            <th>SKU</th>
            <th style={{ textAlign: 'right' }}>Price</th>
            <th style={{ textAlign: 'right' }}>Cost</th>
            <th>Cost source</th>
            <th style={{ textAlign: 'right' }}>Margin</th>
            <th style={{ textAlign: 'right' }}>Stock</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {product.variants.map((variant) => {
            const manual =
              costIndex.get(`${product.shopifyProductId}|${variant.shopifyVariantId}`) ??
              costIndex.get(`${product.shopifyProductId}|`) ??
              null;

            // Mirrors the backend hierarchy for DISPLAY only: no supplier API
            // exists, an override beats Shopify, otherwise Shopify wins, then
            // manual, then UNKNOWN. The backend remains the authority.
            const shopifyCost = variant.unitCost;
            let costAmount: number | null = null;
            let costSource = 'UNKNOWN';
            if (manual !== null && manual.override) {
              costAmount = manual.amount;
              costSource = 'MANUAL';
            } else if (shopifyCost !== null && shopifyCost.amount > 0) {
              costAmount = shopifyCost.amount;
              costSource = 'SHOPIFY_UNIT_COST';
            } else if (manual !== null && manual.amount > 0) {
              costAmount = manual.amount;
              costSource = 'MANUAL';
            }

            const price = variant.price?.amount ?? null;
            // Only computed when BOTH are genuinely known - never from a
            // defaulted zero cost, which would show a fake 100% margin.
            const margin =
              price !== null && price > 0 && costAmount !== null
                ? ((price - costAmount) / price) * 100
                : null;

            return (
              <tr key={variant.shopifyVariantId}>
                <td>{variant.title}</td>
                <td className="mono">{variant.sku ?? '—'}</td>
                <td className="table__num">{formatMoney(variant.price)}</td>
                <td className="table__num">
                  {costAmount === null ? (
                    <span className="muted">—</span>
                  ) : (
                    `${costAmount.toFixed(2)} ${variant.price?.currencyCode ?? ''}`
                  )}
                </td>
                <td>
                  <CostSourceBadge source={costSource} />
                </td>
                <td className="table__num">
                  {margin === null ? (
                    <span className="muted">n/a</span>
                  ) : (
                    `${margin.toFixed(1)}%`
                  )}
                </td>
                <td className="table__num">{formatNumber(variant.inventoryQuantity)}</td>
                <td>
                  <button className="btn btn--sm" onClick={() => onSetCost(variant)}>
                    Set cost
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
