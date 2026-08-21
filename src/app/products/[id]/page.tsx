'use client';

/**
 * Product detail — a real control page, not a read-only view.
 *
 * Every mutation goes through the Trademart backend. The browser never holds a
 * Shopify access token, so there is no code path here that could leak one.
 *
 * Editing is deliberately split into independent, explicit saves rather than one
 * giant "Save everything" button:
 *   - details (title/description/vendor/type/status)
 *   - tags (add/remove, never a wholesale replace)
 *   - variant prices
 *   - manual supplier cost
 *   - inventory quantity per location
 *
 * The split matters because these hit different Shopify mutations with different
 * risk. Publishing a product and correcting a typo should not be the same click,
 * and a failed price write must not silently roll back a successful title edit.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import {
  Badge,
  Callout,
  Card,
  ConfirmDialog,
  ErrorCallout,
  ErrorState,
  Modal,
  PageHeader,
  VisibilityBadge,
} from '@/components/ui';
import { CostSourceBadge, ManualCostEditor } from '@/components/ManualCostEditor';
import { useApi } from '@/hooks/useApi';
import { ApiError, apiPatch, apiPost } from '@/lib/api';
import { formatDateTime, formatMoney, formatNumber, shortGid } from '@/lib/format';
import type {
  InventorySetResult,
  LocationDto,
  ManualCostRecord,
  ProductDto,
  ProductPublicationState,
  ProductVariantDto,
} from '@/lib/types';

const STATUSES = ['ACTIVE', 'DRAFT', 'ARCHIVED'] as const;

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const rawId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const productId = rawId !== undefined ? decodeURIComponent(rawId) : '';

  return (
    <>
      <PageHeader
        title="Product"
        description="Edit product details, prices, supplier cost and stock. Every change is written through the Trademart backend."
        actions={
          <Link className="btn btn--sm" href="/products">
            Back to products
          </Link>
        }
      />
      {productId === '' ? (
        <Card title="Product">
          <p className="muted">No product id in the URL.</p>
        </Card>
      ) : (
        <ProductDetail productId={productId} />
      )}
    </>
  );
}

function ProductDetail({ productId }: { productId: string }) {
  const encoded = encodeURIComponent(productId);
  const product = useApi<ProductDto>(`/shopify/products/${encoded}`);
  const costs = useApi<{ costs: ManualCostRecord[] }>(
    `/costs?productId=${encoded}`,
  );

  const costIndex = useMemo(() => {
    const index = new Map<string, ManualCostRecord>();
    for (const cost of costs.data?.costs ?? []) {
      index.set(cost.shopifyVariantId ?? '', cost);
    }
    return index;
  }, [costs.data]);

  if (product.error !== null) {
    return (
      <Card title="Product">
        <ErrorState error={product.error} onRetry={product.refetch} />
      </Card>
    );
  }
  if (product.data === null) {
    return (
      <Card title="Product">
        <p className="muted">Loading…</p>
      </Card>
    );
  }

  const data = product.data;
  const refresh = () => {
    product.refetch();
    costs.refetch();
  };

  return (
    <div className="stack">
      <SummaryCard product={data} />
      {/*
        Placed immediately after Details, because "is this visible?" is the question
        an operator has while looking at the status field just above.
      */}
      <PublicationCard product={data} onChanged={refresh} />
      <DetailsEditor product={data} onSaved={refresh} />
      <TagEditor product={data} onSaved={refresh} />
      <VariantEditor
        product={data}
        costIndex={costIndex}
        onSaved={refresh}
      />
      <InventoryEditor product={data} onSaved={refresh} />
    </div>
  );
}

/* ---------------------------------------------------------------- summary -- */

function SummaryCard({ product }: { product: ProductDto }) {
  return (
    <Card title={product.title}>
      <div className="row" style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {product.featuredImageUrl !== null && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.featuredImageUrl}
            alt=""
            width={120}
            height={120}
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
          <div className="kv__key">Handle</div>
          <div className="kv__value mono">{product.handle}</div>
          <div className="kv__key">Price range</div>
          <div className="kv__value">
            {formatMoney(product.minPrice)} – {formatMoney(product.maxPrice)}
          </div>
          <div className="kv__key">Total inventory</div>
          <div className="kv__value">{formatNumber(product.totalInventory)}</div>
          <div className="kv__key">Detected supplier</div>
          <div className="kv__value">
            <Badge tone={product.supplier === 'TRADELLE' ? 'info' : 'neutral'}>
              {product.supplier}
            </Badge>
            {product.supplierEvidence.length > 0 && (
              <span className="muted"> ({product.supplierEvidence.join(', ')})</span>
            )}
          </div>
          <div className="kv__key">Updated</div>
          <div className="kv__value">{formatDateTime(product.updatedAt)}</div>
        </div>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- details -- */

function DetailsEditor({
  product,
  onSaved,
}: {
  product: ProductDto;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(product.title);
  const [description, setDescription] = useState(product.description ?? '');
  const [vendor, setVendor] = useState(product.vendor ?? '');
  const [productType, setProductType] = useState(product.productType ?? '');
  const [status, setStatus] = useState<string>(product.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState(false);

  // Re-sync when the product reloads after a save elsewhere on the page.
  useEffect(() => {
    setTitle(product.title);
    setDescription(product.description ?? '');
    setVendor(product.vendor ?? '');
    setProductType(product.productType ?? '');
    setStatus(product.status);
  }, [product]);

  /** Only changed fields are sent, so a save cannot clobber untouched values. */
  const changes = useMemo(() => {
    const patch: Record<string, unknown> = {};
    if (title !== product.title) patch['title'] = title;
    if (description !== (product.description ?? '')) patch['descriptionHtml'] = description;
    if (vendor !== (product.vendor ?? '')) patch['vendor'] = vendor;
    if (productType !== (product.productType ?? '')) patch['productType'] = productType;
    if (status !== product.status) {
      patch['status'] = status;
      // Optimistic concurrency: tells the backend what status this form was built
      // from. If Shopify has changed since, the save is refused with
      // PRODUCT_CHANGED instead of silently overwriting the newer value.
      patch['expectedStatus'] = product.status;
    }
    return patch;
  }, [title, description, vendor, productType, status, product]);

  const dirty = Object.keys(changes).length > 0;
  /**
   * Setting ACTIVE does NOT publish.
   *
   * A product can be ACTIVE and published to no sales channel, in which case it
   * stays invisible. So this warns about a status change without claiming it makes
   * the product visible - publishing is the separate action in the Publication
   * card below.
   */
  const activating = status === 'ACTIVE' && product.status !== 'ACTIVE';

  const save = async () => {
    if (!dirty) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await apiPatch<unknown>(
        `/shopify/products/${encodeURIComponent(product.shopifyProductId)}`,
        changes,
      );
      setDone(true);
      onSaved();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError('UNKNOWN', 'Save failed.', 0));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Details"
      actions={
        <button
          className="btn btn--primary btn--sm"
          onClick={save}
          disabled={!dirty || busy}
          title={dirty ? undefined : 'No changes to save'}
        >
          {busy ? 'Saving…' : 'Save details'}
        </button>
      }
    >
      <div className="stack">
        {error !== null && <ErrorCallout error={error} onRefresh={onSaved} />}
        {done && !dirty && (
          <Callout tone="info" title="Saved">
            Shopify has the new values.
          </Callout>
        )}
        {activating && (
          <Callout tone="warning" title="Setting status to ACTIVE">
            ACTIVE alone does <strong>not</strong> put a product on the storefront - it also has to
            be published to the Online Store. Use the Publication card below to check and change
            that. If it is already published, setting ACTIVE will make it visible to customers
            immediately.
          </Callout>
        )}
        <div className="form-grid">
          <div className="field">
            <label className="field__label">Title</label>
            <input
              className="input"
              value={title}
              maxLength={255}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">Vendor</label>
            <input
              className="input"
              value={vendor}
              maxLength={255}
              onChange={(event) => setVendor(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">Product type</label>
            <input
              className="input"
              value={productType}
              maxLength={255}
              onChange={(event) => setProductType(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">Status</label>
            <select
              className="select"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {STATUSES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label className="field__label">Description (HTML allowed)</label>
          <textarea
            className="input"
            rows={6}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------- tags -- */

function TagEditor({ product, onSaved }: { product: ProductDto; onSaved: () => void }) {
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const mutate = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    setError(null);
    try {
      await apiPatch<unknown>(
        `/shopify/products/${encodeURIComponent(product.shopifyProductId)}`,
        body,
      );
      setNewTag('');
      onSaved();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError('UNKNOWN', 'Update failed.', 0));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card title="Tags">
      <div className="stack">
        {error !== null && <ErrorCallout error={error} onRefresh={onSaved} />}
        <p className="muted">
          Tags are added and removed individually. Trademart never replaces the whole tag list,
          which would silently drop tags set by other apps.
        </p>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {product.tags.length === 0 ? (
            <span className="muted">No tags</span>
          ) : (
            product.tags.map((tag) => (
              <span key={tag} className="row" style={{ gap: 4, alignItems: 'center' }}>
                <Badge tone="neutral">{tag}</Badge>
                <button
                  className="btn btn--sm"
                  onClick={() => mutate({ removeTags: [tag] }, `remove:${tag}`)}
                  disabled={busy !== null}
                  aria-label={`Remove tag ${tag}`}
                  title={`Remove ${tag}`}
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1 }}>
            <label className="field__label">Add a tag</label>
            <input
              className="input"
              value={newTag}
              onChange={(event) => setNewTag(event.target.value)}
            />
          </div>
          <button
            className="btn btn--sm"
            onClick={() => mutate({ addTags: [newTag.trim()] }, 'add')}
            disabled={busy !== null || newTag.trim().length === 0}
          >
            {busy === 'add' ? 'Adding…' : 'Add tag'}
          </button>
        </div>
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- variants -- */

function VariantEditor({
  product,
  costIndex,
  onSaved,
}: {
  product: ProductDto;
  costIndex: Map<string, ManualCostRecord>;
  onSaved: () => void;
}) {
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [compareAt, setCompareAt] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [costTarget, setCostTarget] = useState<ProductVariantDto | null>(null);

  useEffect(() => {
    // Reset local edits whenever fresh server data arrives.
    setPrices({});
    setCompareAt({});
  }, [product]);

  const currency = product.minPrice?.currencyCode ?? 'GBP';

  const pending = product.variants
    .map((variant) => {
      const id = variant.shopifyVariantId;
      const entry: Record<string, unknown> = { id };
      let changed = false;

      const price = prices[id];
      if (price !== undefined && price.trim() !== String(variant.price?.amount ?? '')) {
        entry['price'] = price.trim();
        // Optimistic concurrency: the price this form was BUILT from. If someone
        // changed it in the Shopify admin in the meantime, the backend refuses the
        // whole save with PRODUCT_CHANGED rather than discarding their change.
        // Sent as 2dp so it compares equal to the backend's normalised form.
        if (variant.price !== null) {
          entry['expectedPrice'] = variant.price.amount.toFixed(2);
        }
        changed = true;
      }
      const compare = compareAt[id];
      if (compare !== undefined) {
        const current = String(variant.compareAtPrice?.amount ?? '');
        if (compare.trim() !== current) {
          // Empty string means CLEAR, which the backend models as null.
          entry['compareAtPrice'] = compare.trim() === '' ? null : compare.trim();
          changed = true;
        }
      }
      return changed ? entry : null;
    })
    .filter((entry): entry is Record<string, unknown> => entry !== null);

  const save = async () => {
    if (pending.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await apiPatch<unknown>(
        `/shopify/products/${encodeURIComponent(product.shopifyProductId)}`,
        { variants: pending },
      );
      onSaved();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError('UNKNOWN', 'Save failed.', 0));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Variants, prices and cost"
      actions={
        <button
          className="btn btn--primary btn--sm"
          onClick={save}
          disabled={busy || pending.length === 0}
          title={
            pending.length === 0
              ? 'Change a price first'
              : `Write ${pending.length} variant price change(s) to Shopify`
          }
        >
          {busy ? 'Saving…' : `Save price to Shopify${pending.length > 0 ? ` (${pending.length})` : ''}`}
        </button>
      }
    >
      <div className="stack">
        {error !== null && <ErrorCallout error={error} onRefresh={onSaved} />}
        <p className="muted">
          Editing a price here only changes this form. Nothing reaches Shopify until you press
          Save. Each price is saved with the value it was loaded from, so if someone changes it in
          Shopify meanwhile the save is refused rather than overwriting their change.
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Variant</th>
                <th>SKU</th>
                <th>Barcode</th>
                <th style={{ textAlign: 'right' }}>Price</th>
                <th style={{ textAlign: 'right' }}>Compare at</th>
                <th style={{ textAlign: 'right' }}>Cost</th>
                <th>Cost source</th>
                <th style={{ textAlign: 'right' }}>Margin</th>
                <th style={{ textAlign: 'right' }}>Stock</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {product.variants.map((variant) => {
                const id = variant.shopifyVariantId;
                const manual = costIndex.get(id) ?? costIndex.get('') ?? null;

                let costAmount: number | null = null;
                let costSource = 'UNKNOWN';
                if (manual !== null && manual.override) {
                  costAmount = manual.amount;
                  costSource = 'MANUAL';
                } else if (variant.unitCost !== null && variant.unitCost.amount > 0) {
                  costAmount = variant.unitCost.amount;
                  costSource = 'SHOPIFY_UNIT_COST';
                } else if (manual !== null && manual.amount > 0) {
                  costAmount = manual.amount;
                  costSource = 'MANUAL';
                }

                const priceValue = prices[id] ?? String(variant.price?.amount ?? '');
                const priceNumber = Number(priceValue);
                // Never computed from a defaulted zero cost.
                const margin =
                  Number.isFinite(priceNumber) && priceNumber > 0 && costAmount !== null
                    ? ((priceNumber - costAmount) / priceNumber) * 100
                    : null;

                return (
                  <tr key={id}>
                    <td>{variant.title}</td>
                    <td className="mono">{variant.sku ?? '—'}</td>
                    <td className="mono">{variant.barcode ?? '—'}</td>
                    <td className="table__num">
                      <input
                        className="input"
                        style={{ width: 96, textAlign: 'right' }}
                        type="number"
                        step="0.01"
                        min="0"
                        value={priceValue}
                        onChange={(event) =>
                          setPrices((prev) => ({ ...prev, [id]: event.target.value }))
                        }
                      />
                    </td>
                    <td className="table__num">
                      <input
                        className="input"
                        style={{ width: 96, textAlign: 'right' }}
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="none"
                        value={compareAt[id] ?? String(variant.compareAtPrice?.amount ?? '')}
                        onChange={(event) =>
                          setCompareAt((prev) => ({ ...prev, [id]: event.target.value }))
                        }
                      />
                    </td>
                    <td className="table__num">
                      {costAmount === null ? (
                        <span className="muted">—</span>
                      ) : (
                        `${costAmount.toFixed(2)} ${currency}`
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
                      <button className="btn btn--sm" onClick={() => setCostTarget(variant)}>
                        Set cost
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {costTarget !== null && (
        <ManualCostEditor
          productId={product.shopifyProductId}
          variantId={costTarget.shopifyVariantId}
          existing={costIndex.get(costTarget.shopifyVariantId) ?? null}
          defaultCurrency={currency}
          onClose={() => setCostTarget(null)}
          onSaved={onSaved}
        />
      )}
    </Card>
  );
}

/* -------------------------------------------------------------- inventory -- */

function InventoryEditor({
  product,
  onSaved,
}: {
  product: ProductDto;
  onSaved: () => void;
}) {
  const locations = useApi<{ locations: LocationDto[] }>('/shopify/locations');
  const [variantId, setVariantId] = useState<string>(
    product.variants[0]?.shopifyVariantId ?? '',
  );
  const [locationId, setLocationId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const variant = product.variants.find((v) => v.shopifyVariantId === variantId) ?? null;
  const selectedLocation =
    locationId !== '' ? locationId : (locations.data?.locations[0]?.id ?? '');

  const parsed = Number(quantity);
  const quantityValid =
    quantity.trim().length > 0 && Number.isInteger(parsed) && parsed >= 0;
  // A negative value is refused, never coerced to 0 - silently turning -5 into 0
  // is a stock change nobody asked for.
  const negative = quantity.trim().length > 0 && Number.isFinite(parsed) && parsed < 0;

  const current = variant?.inventoryQuantity ?? null;
  const delta = current !== null && quantityValid ? parsed - current : null;
  // "Major" is deliberately generous; the point is to catch a fat-fingered
  // extra digit, not to nag about routine adjustments.
  const major = delta !== null && Math.abs(delta) >= 50;

  const canSubmit =
    variant !== null &&
    variant.inventoryItemId !== null &&
    selectedLocation !== '' &&
    quantityValid &&
    !busy;

  const submit = async () => {
    if (!canSubmit || variant === null || variant.inventoryItemId === null) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await apiPost<InventorySetResult>('/shopify/inventory/set', {
        inventoryItemId: variant.inventoryItemId,
        locationId: selectedLocation,
        quantity: parsed,
        // Stale-write protection. If stock moved since this page loaded (a sale, a
        // supplier sync), the backend refuses with PRODUCT_CHANGED rather than
        // putting the sold units back.
        ...(current !== null ? { expectedQuantity: current } : {}),
        // Server-enforced. The dialog below is a courtesy; this flag is what
        // actually satisfies the MAX_INVENTORY_DELTA check, and without it a large
        // change is refused no matter what the UI did.
        ...(major ? { confirmLargeChange: true } : {}),
      });
      setDone(`Set ${variant.title} to ${parsed}.`);
      setQuantity('');
      onSaved();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError('UNKNOWN', 'Update failed.', 0));
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <Card title="Inventory">
      <div className="stack">
        {locations.error !== null && (
          <Callout tone="warning" title={locations.error.code}>
            Could not list locations: {locations.error.message}
          </Callout>
        )}
        {error !== null && <ErrorCallout error={error} onRefresh={onSaved} />}
        {done !== null && (
          <Callout tone="info" title="Stock updated">
            {done}
          </Callout>
        )}
        {variant !== null && variant.inventoryItemId === null && (
          <Callout tone="warning" title="This variant has no inventory item">
            Shopify did not return an inventoryItemId, so its quantity cannot be set. This usually
            means inventory is not tracked for the variant.
          </Callout>
        )}

        <p className="muted">
          Sets an absolute on-hand quantity at one location. Negative values are refused rather
          than clamped to zero.
        </p>

        <div className="form-grid">
          <div className="field">
            <label className="field__label">Variant</label>
            <select
              className="select"
              value={variantId}
              onChange={(event) => setVariantId(event.target.value)}
            >
              {product.variants.map((option) => (
                <option key={option.shopifyVariantId} value={option.shopifyVariantId}>
                  {option.title}
                  {option.sku !== null ? ` (${option.sku})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label">Location</label>
            <select
              className="select"
              value={selectedLocation}
              onChange={(event) => setLocationId(event.target.value)}
            >
              {(locations.data?.locations ?? []).map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label">New quantity</label>
            <input
              className="input"
              type="number"
              step="1"
              min="0"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
            <div className="field__hint">
              {current !== null ? `Currently ${current}.` : 'Current quantity unknown.'}
              {delta !== null && delta !== 0 && ` Change of ${delta > 0 ? '+' : ''}${delta}.`}
            </div>
          </div>
        </div>

        {negative && (
          <Callout tone="danger" title="Negative quantity">
            Enter zero or more. Trademart will not silently convert a negative value to 0.
          </Callout>
        )}

        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn btn--primary btn--sm"
            onClick={() => (major ? setConfirm(true) : submit())}
            disabled={!canSubmit}
          >
            {busy ? 'Updating…' : 'Set quantity'}
          </button>
        </div>

        {confirm && variant !== null && (
          <ConfirmDialog
            title="Confirm a large stock change"
            intent={`Change stock for "${variant.title}" at ${
              locations.data?.locations.find((l) => l.id === selectedLocation)?.name ??
              'the selected location'
            }.`}
            changes={[
              {
                label: 'Quantity',
                from: current === null ? null : String(current),
                to: String(parsed),
              },
              {
                label: 'Change',
                to: delta === null ? 'unknown' : `${delta > 0 ? '+' : ''}${delta}`,
              },
              ...(variant.sku !== null ? [{ label: 'SKU', to: variant.sku }] : []),
            ]}
            consequence={
              'This sets an absolute quantity, replacing whatever Shopify currently holds. The backend independently enforces its own limit on change size and records the previous quantity in the audit trail, so this is reversible.'
            }
            confirmLabel="Set quantity"
            tone="warning"
            busy={busy}
            onConfirm={submit}
            onCancel={() => setConfirm(false)}
          />
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------ publication -- */

/**
 * Publication card: the authoritative answer to "can a customer see this?".
 *
 * Separate from the Details card on purpose. Status and publication are different
 * things, and putting them in one form is what led to `status: ACTIVE` being
 * treated as "published". Here they are shown side by side so the two halves of
 * visibility are visibly distinct:
 *
 *   ACTIVE   + published   -> visible
 *   ACTIVE   + unpublished -> invisible (looks live in the Shopify admin)
 *   DRAFT    + published   -> invisible (one status change from being live)
 *
 * The state is read from GET /shopify/products/:id/publication, which asks Shopify
 * directly rather than inferring anything.
 */
function PublicationCard({
  product,
  onChanged,
}: {
  product: ProductDto;
  onChanged: () => void;
}) {
  const path = `/shopify/products/${encodeURIComponent(product.shopifyProductId)}/publication`;
  const state = useApi<ProductPublicationState>(path);

  const [busy, setBusy] = useState<'publish' | 'unpublish' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [confirming, setConfirming] = useState<'publish' | 'unpublish' | null>(null);

  const current = state.data;

  const act = async (action: 'publish' | 'unpublish') => {
    setBusy(action);
    setError(null);
    try {
      await apiPost<ProductPublicationState>(
        `/shopify/products/${encodeURIComponent(product.shopifyProductId)}/${action}`,
        {},
        // Stable per product and action, so a double-click cannot publish twice.
        { idempotencyKey: `${action}-${product.shopifyProductId}` },
      );
      state.refetch();
      onChanged();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError('UNKNOWN', `${action} failed.`, 0),
      );
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  return (
    <Card
      title="Publication"
      actions={
        <div className="row" style={{ gap: 8 }}>
          {current !== null && current.publishedToOnlineStore ? (
            <button
              className="btn btn--sm"
              onClick={() => setConfirming('unpublish')}
              disabled={busy !== null}
            >
              {busy === 'unpublish' ? 'Unpublishing…' : 'Unpublish…'}
            </button>
          ) : (
            <button
              className="btn btn--primary btn--sm"
              onClick={() => setConfirming('publish')}
              disabled={busy !== null || current === null}
            >
              {busy === 'publish' ? 'Publishing…' : 'Publish…'}
            </button>
          )}
        </div>
      }
    >
      <div className="stack">
        {error !== null && (
          <ErrorCallout error={error} onRetry={() => state.refetch()} onRefresh={() => state.refetch()} />
        )}

        {state.error !== null && (
          <Callout tone="warning" title="Publication state unavailable">
            {state.error.message}
            <p className="muted" style={{ marginBottom: 0, marginTop: 6 }}>
              Reading publication state needs the <span className="mono">read_publications</span>{' '}
              scope. Until it is granted, Trademart reports visibility as unknown rather than
              guessing it from the status.
            </p>
          </Callout>
        )}

        {state.loading && current === null && <p className="muted">Checking Shopify…</p>}

        {current !== null && (
          <>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <VisibilityBadge
                status={current.status}
                publishedToOnlineStore={current.publishedToOnlineStore}
              />
              <Badge tone={current.status === 'ACTIVE' ? 'success' : 'neutral'}>
                status {current.status}
              </Badge>
              <Badge tone={current.publishedToOnlineStore ? 'success' : 'neutral'}>
                {current.publishedToOnlineStore ? 'published' : 'not published'} to{' '}
                {current.publicationName}
              </Badge>
            </div>

            {/*
              The two "looks fine but isn't" states get an explicit explanation,
              because they are the ones an operator misreads. Neither is reported
              as an error - both can be deliberate.
            */}
            {current.status === 'ACTIVE' && !current.publishedToOnlineStore && (
              <Callout tone="warning" title="ACTIVE but not on the storefront">
                This product looks live in the Shopify admin, but it is not published to the Online
                Store, so customers cannot see it. Publish it, or set it to DRAFT so its status
                matches reality.
              </Callout>
            )}
            {current.status !== 'ACTIVE' && current.publishedToOnlineStore && (
              <Callout tone="info" title="Published, but hidden by its status">
                It is on the Online Store channel but its status is {current.status}, so it stays
                hidden. Setting it ACTIVE would make it visible immediately.
              </Callout>
            )}

            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              Checked {formatDateTime(current.checkedAt)}. Read from Shopify, not inferred.
            </p>
          </>
        )}
      </div>

      {confirming === 'publish' && current !== null && (
        <ConfirmDialog
          title="Publish to the Online Store?"
          intent={`Publish "${product.title}" to ${current.publicationName}.`}
          changes={[
            { label: 'Online Store', from: 'not published', to: 'published' },
            { label: 'Status', from: current.status, to: `${current.status} (unchanged)` },
            {
              label: 'Visible to customers after this',
              to: current.status === 'ACTIVE' ? 'YES' : `No - status is ${current.status}`,
            },
          ]}
          consequence={
            current.status === 'ACTIVE'
              ? 'This product is ACTIVE, so publishing makes it visible and purchasable immediately.'
              : `This product is ${current.status}, so publishing alone will NOT make it visible. It becomes visible when you also set it ACTIVE.`
          }
          confirmLabel="Publish"
          tone={current.status === 'ACTIVE' ? 'warning' : 'info'}
          busy={busy === 'publish'}
          onConfirm={() => act('publish')}
          onCancel={() => setConfirming(null)}
        />
      )}

      {confirming === 'unpublish' && current !== null && (
        <ConfirmDialog
          title="Remove from the Online Store?"
          intent={`Unpublish "${product.title}" from ${current.publicationName}.`}
          changes={[
            { label: 'Online Store', from: 'published', to: 'not published' },
            { label: 'Status', from: current.status, to: `${current.status} (unchanged)` },
          ]}
          consequence={
            current.status === 'ACTIVE'
              ? 'Customers will no longer be able to see or buy this product. Existing orders are unaffected. Any links to it will stop working.'
              : 'This product is already hidden by its status, so customers will not notice a change.'
          }
          confirmLabel="Unpublish"
          tone="danger"
          busy={busy === 'unpublish'}
          onConfirm={() => act('unpublish')}
          onCancel={() => setConfirming(null)}
        />
      )}
    </Card>
  );
}
