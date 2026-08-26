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

import { Badge, Callout, Card, ErrorCallout, ErrorState, Modal, PageHeader } from '@/components/ui';
import { CostSourceBadge, ManualCostEditor } from '@/components/ManualCostEditor';
import { useApi } from '@/hooks/useApi';
import { ApiError, apiPatch, apiPost } from '@/lib/api';
import {
  describeCapability,
  useCapabilities,
  type CapabilityVerdict,
} from '@/lib/capabilities';
import { formatDateTime, formatMoney, formatNumber, shortGid } from '@/lib/format';
import type {
  HeadlessVisibility,
  LocationDto,
  ManualCostRecord,
  ProductDto,
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

  const caps = useCapabilities();
  const writeVerdict = describeCapability(caps.data, 'products.write');
  const inventoryVerdict = describeCapability(caps.data, 'inventory.write');
  const publishVerdict = describeCapability(caps.data, 'products.publish');
  const headlessPublishVerdict = describeCapability(caps.data, 'headless.publish');

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
      <PublicationSection
        product={data}
        verdict={publishVerdict}
        headlessVerdict={headlessPublishVerdict}
      />
      <DetailsEditor product={data} verdict={writeVerdict} onSaved={refresh} />
      <TagEditor product={data} verdict={writeVerdict} onSaved={refresh} />
      <VariantEditor
        product={data}
        verdict={writeVerdict}
        costIndex={costIndex}
        onSaved={refresh}
      />
      <InventoryEditor product={data} verdict={inventoryVerdict} onSaved={refresh} />
    </div>
  );
}

/* ------------------------------------------------------------ publication -- */

/**
 * Publication state + publish/unpublish, per channel.
 *
 * Publishing is distinct from ACTIVE status: a product can be ACTIVE yet invisible
 * because it is not on a channel. And the channels are distinct from each other -
 * the themed Online Store and a custom headless storefront are separate
 * publications, so being on one says nothing about the other.
 *
 * Online Store controls are gated on products.publish; the headless control on
 * headless.publish, which needs its own configured channel and write_publications.
 */
function PublicationSection({
  product,
  verdict,
  headlessVerdict,
}: {
  product: ProductDto;
  verdict: CapabilityVerdict;
  headlessVerdict: CapabilityVerdict;
}) {
  const encoded = encodeURIComponent(product.shopifyProductId);
  const state = useApi<{ publications: { publicationId: string; name: string; isPublished: boolean }[] }>(
    `/shopify/products/${encoded}/publications`,
  );
  // Separate request because it answers a separate question. The list above says
  // which channels exist and their flags; this says whether the CUSTOM storefront
  // can actually sell the product, which needs ACTIVE plus confirmed publication to
  // the headless channel specifically.
  const headless = useApi<HeadlessVisibility>(
    `/shopify/products/${encoded}/headless-visibility`,
  );
  const [busy, setBusy] = useState<'publish' | 'unpublish' | 'publish-headless' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const act = async (kind: 'publish' | 'unpublish' | 'publish-headless') => {
    setBusy(kind);
    setError(null);
    try {
      await apiPost<unknown>(`/shopify/products/${encoded}/${kind}`, {});
      state.refetch();
      headless.refetch();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError('UNKNOWN', `${kind} failed.`, 0));
    } finally {
      setBusy(null);
    }
  };

  const publications = state.data?.publications ?? [];
  const publishedOn = publications.filter((entry) => entry.isPublished);

  return (
    <Card
      title="Publication"
      actions={
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn btn--primary btn--sm"
            onClick={() => act('publish')}
            disabled={busy !== null || !verdict.available}
            title={verdict.reason ?? 'Publish to the Online Store'}
          >
            {busy === 'publish' ? 'Publishing…' : 'Publish to Online Store'}
          </button>
          {/*
            A DELIBERATE second button rather than a channel dropdown on the first.
            The two channels are different storefronts with different audiences, and
            an operator publishing to one should never be one mis-click from
            publishing to the other. The backend takes no channel from the request
            body either - it reads the configured headless channel - so neither this
            control nor a crafted request can aim it elsewhere.
          */}
          <button
            className="btn btn--sm"
            onClick={() => act('publish-headless')}
            disabled={busy !== null || !headlessVerdict.available}
            title={headlessVerdict.reason ?? 'Publish to the configured headless storefront channel'}
          >
            {busy === 'publish-headless' ? 'Publishing…' : 'Publish to headless'}
          </button>
          <button
            className="btn btn--sm"
            onClick={() => act('unpublish')}
            disabled={busy !== null || !verdict.available}
            title={verdict.reason ?? 'Remove from the Online Store'}
          >
            {busy === 'unpublish' ? 'Unpublishing…' : 'Unpublish'}
          </button>
        </div>
      }
    >
      <div className="stack">
        {!verdict.available && (
          <Callout tone="warning" title="Publishing is unavailable">
            {verdict.reason}
          </Callout>
        )}
        {error !== null && (
          <ErrorCallout error={error} />
        )}
        <p className="muted">
          A product&apos;s ACTIVE status only clears the draft flag. It is visible to customers
          only when published to a sales channel.
        </p>
        {state.loading && state.data === null ? (
          <p className="muted">Loading publication state…</p>
        ) : publications.length === 0 ? (
          <p className="muted">
            {state.error !== null
              ? `Could not read publication state: ${state.error.message}`
              : 'Not published to any channel.'}
          </p>
        ) : (
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {publications.map((entry) => (
              <Badge
                key={entry.publicationId}
                tone={entry.isPublished ? 'success' : 'neutral'}
                dot={entry.isPublished}
              >
                {entry.name}: {entry.isPublished ? 'published' : 'not published'}
              </Badge>
            ))}
          </div>
        )}
        {publishedOn.length === 0 && publications.length > 0 && (
          <Callout tone="info" title="Active but not visible">
            This product is not published on any channel, so customers cannot see it even if its
            status is ACTIVE.
          </Callout>
        )}

        <HeadlessVisibilityRow headless={headless} />
      </div>
    </Card>
  );
}

/**
 * Headless storefront sellability for this product.
 *
 * Kept visually distinct from the channel badge list above because it is a
 * CONCLUSION, not another flag: it is the conjunction of ACTIVE status and confirmed
 * headless publication. The two most confusing states an operator hits are shown
 * explicitly rather than left to be inferred from two separate badges:
 *
 *   ACTIVE, on the Online Store, absent from headless  -> not sellable on the custom store
 *   published to headless but DRAFT                    -> still not sellable
 *
 * UNKNOWN is rendered as its own thing, never as "no". The backend supplies the
 * sentence; re-deriving it here is how the console and the API drift apart.
 */
function HeadlessVisibilityRow({
  headless,
}: {
  headless: ReturnType<typeof useApi<HeadlessVisibility>>;
}) {
  if (headless.loading && headless.data === null) {
    return <p className="muted">Loading headless storefront state…</p>;
  }
  if (headless.error !== null) {
    return (
      <p className="muted">
        Could not read headless storefront state: {headless.error.message}
      </p>
    );
  }
  const data = headless.data;
  if (data === null) return null;

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="muted">Headless storefront:</span>
        {data.sellableOnHeadlessStorefront ? (
          <Badge tone="success" dot title={data.reason}>
            sellable
          </Badge>
        ) : (
          <Badge
            tone={data.headless === 'UNKNOWN' ? 'neutral' : 'warning'}
            title={data.reason}
          >
            not sellable
          </Badge>
        )}
        <Badge
          tone={
            data.headless === 'PUBLISHED'
              ? 'success'
              : data.headless === 'UNPUBLISHED'
                ? 'warning'
                : 'neutral'
          }
        >
          channel: {data.headless.toLowerCase()}
        </Badge>
        <Badge tone="neutral">online store: {data.onlineStore.toLowerCase()}</Badge>
      </div>
      <p className="muted">{data.reason}</p>
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
  verdict,
  onSaved,
}: {
  product: ProductDto;
  verdict: CapabilityVerdict;
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
    if (status !== product.status) patch['status'] = status;
    return patch;
  }, [title, description, vendor, productType, status, product]);

  const dirty = Object.keys(changes).length > 0;
  const publishing = status === 'ACTIVE' && product.status !== 'ACTIVE';

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
          disabled={!dirty || busy || !verdict.available}
          title={verdict.reason ?? (dirty ? undefined : 'No changes to save')}
        >
          {busy ? 'Saving…' : 'Save details'}
        </button>
      }
    >
      <div className="stack">
        {error !== null && (
          <ErrorCallout error={error} />
        )}
        {done && !dirty && (
          <Callout tone="info" title="Saved">
            Shopify has the new values.
          </Callout>
        )}
        {publishing && (
          <Callout tone="warning" title="This will publish the product">
            Setting status to ACTIVE makes it visible to customers immediately.
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

function TagEditor({
  product,
  verdict,
  onSaved,
}: {
  product: ProductDto;
  verdict: CapabilityVerdict;
  onSaved: () => void;
}) {
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
        {error !== null && (
          <ErrorCallout error={error} />
        )}
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
                  disabled={busy !== null || !verdict.available}
                  aria-label={`Remove tag ${tag}`}
                  title={verdict.reason ?? `Remove ${tag}`}
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
            disabled={busy !== null || newTag.trim().length === 0 || !verdict.available}
            title={verdict.reason ?? undefined}
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
  verdict,
  costIndex,
  onSaved,
}: {
  product: ProductDto;
  verdict: CapabilityVerdict;
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
          disabled={busy || pending.length === 0 || !verdict.available}
          title={
            verdict.reason ??
            (pending.length === 0
              ? 'Change a price first'
              : `Write ${pending.length} variant price change(s) to Shopify`)
          }
        >
          {busy ? 'Saving…' : `Save price to Shopify${pending.length > 0 ? ` (${pending.length})` : ''}`}
        </button>
      }
    >
      <div className="stack">
        {error !== null && (
          <ErrorCallout error={error} />
        )}
        <p className="muted">
          Editing a price here only changes this form. Nothing reaches Shopify until you press
          Save.
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
  verdict,
  onSaved,
}: {
  product: ProductDto;
  verdict: CapabilityVerdict;
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
    verdict.available &&
    !busy;

  const submit = async () => {
    if (!canSubmit || variant === null || variant.inventoryItemId === null) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await apiPost<unknown>('/shopify/inventory/set', {
        inventoryItemId: variant.inventoryItemId,
        locationId: selectedLocation,
        quantity: parsed,
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
        {!verdict.available && (
          <Callout tone="warning" title="Inventory editing is unavailable">
            {verdict.reason}
          </Callout>
        )}
        {locations.error !== null && (
          <Callout tone="warning" title={locations.error.code}>
            Could not list locations: {locations.error.message}
          </Callout>
        )}
        {error !== null && (
          <ErrorCallout error={error} />
        )}
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
            {busy ? 'Saving…' : 'Set quantity'}
          </button>
        </div>
      </div>

      {confirm && (
        <Modal title="Confirm a large stock change" onClose={() => setConfirm(false)}>
          <div className="stack">
            <Callout tone="warning" title="This is a big change">
              {variant?.title} moves from {formatNumber(current)} to {parsed}
              {delta !== null && ` (${delta > 0 ? '+' : ''}${delta})`}. Large jumps are usually a
              mistyped digit, so this needs a second confirmation.
            </Callout>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" onClick={() => setConfirm(false)} disabled={busy}>
                Cancel
              </button>
              <button className="btn btn--primary" onClick={submit} disabled={busy}>
                {busy ? 'Saving…' : 'Yes, set it'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
}
