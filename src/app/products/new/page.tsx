'use client';

/**
 * Create a product.
 *
 * Posts to POST /api/shopify/products, which creates the product and then its
 * variants. DRAFT is the default and publishing is a deliberate, separate
 * choice - a newly created product must not appear on the storefront because
 * someone was clicking through a form.
 *
 * A stepped layout keeps the decisions in a sensible order (identity, then
 * options, then priced variants, then media) and ends on a preview of the exact
 * request body, so nothing is sent that the operator has not seen.
 */

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge, Callout, Card, ErrorCallout, PageHeader } from '@/components/ui';
import { ApiError, apiPost, apiPut, newIdempotencyKey } from '@/lib/api';
import type { CreatedVariant, ProductCreateResult } from '@/lib/types';

interface OptionDraft {
  name: string;
  /** Raw comma-separated input; split at submit time. */
  values: string;
}

interface VariantDraft {
  price: string;
  compareAtPrice: string;
  sku: string;
  barcode: string;
  /** One entry per declared option, in the same order. */
  optionValues: string[];
  /** Optional manual supplier cost, recorded after the product is created. */
  manualCost: string;
}

const STEPS = [
  'Product',
  'Options',
  'Variants',
  'Supplier cost',
  'Media',
  'Preview',
] as const;

function emptyVariant(optionCount: number): VariantDraft {
  return {
    price: '',
    compareAtPrice: '',
    sku: '',
    barcode: '',
    optionValues: Array.from({ length: optionCount }, () => ''),
    manualCost: '',
  };
}

export default function NewProductPage() {
  return (
    <>
      <PageHeader
        title="Add product"
        description="Creates the product in Shopify as a DRAFT by default. Publishing is a separate, explicit choice."
      />
      <NewProductWizard />
    </>
  );
}

function NewProductWizard() {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [descriptionHtml, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [productType, setProductType] = useState('');
  const [tags, setTags] = useState('');
  const [publish, setPublish] = useState(false);
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [variants, setVariants] = useState<VariantDraft[]>([emptyVariant(0)]);
  const [currency, setCurrency] = useState('GBP');
  const [mediaUrls, setMediaUrls] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [costWarning, setCostWarning] = useState<string | null>(null);
  const [created, setCreated] = useState<ProductCreateResult | null>(null);

  /**
   * Idempotency key for the create POST.
   *
   * Generated ONCE per submission and held here so that if the response is lost -
   * the product was created but the browser never heard back - clicking submit
   * again REUSES the key. The backend then replays the stored result instead of
   * creating a second product. Cleared on success, so the next product gets its
   * own key. A permanent per-product key would be wrong here: there is no product
   * id yet to derive one from, and the point is to guard the create itself.
   */
  const idempotencyKeyRef = useRef<string | null>(null);

  const parsedOptions = useMemo(
    () =>
      options
        .map((option) => ({
          name: option.name.trim(),
          values: option.values
            .split(',')
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
        }))
        .filter((option) => option.name.length > 0 && option.values.length > 0),
    [options],
  );

  /** The exact body that will be POSTed. Shown in the preview step. */
  const requestBody = useMemo(() => {
    return {
      title: title.trim(),
      ...(descriptionHtml.trim().length > 0 ? { descriptionHtml } : {}),
      ...(vendor.trim().length > 0 ? { vendor: vendor.trim() } : {}),
      ...(productType.trim().length > 0 ? { productType: productType.trim() } : {}),
      // Always created DRAFT. `publish` asks the backend to publish + verify +
      // activate; it never creates ACTIVE directly (ACTIVE without a channel
      // publication is invisible-but-looks-live).
      status: 'DRAFT',
      publish,
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
      options: parsedOptions,
      variants: variants
        .filter((variant) => variant.price.trim().length > 0)
        .map((variant) => ({
          price: variant.price.trim(),
          ...(variant.compareAtPrice.trim().length > 0
            ? { compareAtPrice: variant.compareAtPrice.trim() }
            : {}),
          ...(variant.sku.trim().length > 0 ? { sku: variant.sku.trim() } : {}),
          ...(variant.barcode.trim().length > 0 ? { barcode: variant.barcode.trim() } : {}),
          optionValues: parsedOptions.map((option, index) => ({
            optionName: option.name,
            name: variant.optionValues[index]?.trim() ?? '',
          })),
        })),
      mediaUrls: mediaUrls
        .split(/[\n,]/)
        .map((url) => url.trim())
        .filter((url) => url.length > 0),
    };
  }, [
    title,
    descriptionHtml,
    vendor,
    productType,
    publish,
    tags,
    parsedOptions,
    variants,
    mediaUrls,
  ]);

  const pricedVariants = requestBody.variants.length;
  const canSubmit = title.trim().length > 0 && pricedVariants > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setCostWarning(null);
    // Reuse the pending key if this is a retry of a failed submission; mint one
    // otherwise. Reused across retries, fresh per new submission.
    if (idempotencyKeyRef.current === null) {
      idempotencyKeyRef.current = newIdempotencyKey();
    }
    try {
      const response = await apiPost<ProductCreateResult>('/shopify/products', requestBody, {
        idempotencyKey: idempotencyKeyRef.current,
      });
      const product = response.data;
      // The create landed. Release the key so the next product is a new operation.
      idempotencyKeyRef.current = null;
      setCreated(product);

      // Manual costs are a separate concern (/api/costs), recorded AFTER
      // creation. A failure here must never read as "product creation failed" -
      // the product exists either way. Each cost is mapped to the REAL Shopify
      // variant id by SKU (then option values), never by assuming the created
      // order matches the form order.
      const withCost = variants.filter(
        (variant) => variant.price.trim().length > 0 && variant.manualCost.trim().length > 0,
      );
      if (withCost.length > 0) {
        const failures: string[] = [];
        for (let i = 0; i < withCost.length; i += 1) {
          const draft = withCost[i] as VariantDraft;
          const label = draft.sku.trim().length > 0 ? `SKU ${draft.sku.trim()}` : `variant ${i + 1}`;
          const amount = Number(draft.manualCost);
          if (!Number.isFinite(amount) || amount <= 0) {
            failures.push(`${label}: cost must be greater than zero`);
            continue;
          }
          const variantId = matchCreatedVariant(draft, product.variants, parsedOptions);
          if (variantId === null) {
            failures.push(`${label}: could not match it to a created variant`);
            continue;
          }
          try {
            await apiPut<unknown>('/costs', {
              productId: product.shopifyProductId,
              variantId,
              amount,
              currencyCode: currency.toUpperCase(),
              override: false,
              note: 'Entered when the product was created.',
            });
          } catch (caught) {
            failures.push(`${label}: ${caught instanceof ApiError ? caught.message : 'failed'}`);
          }
        }
        if (failures.length > 0) {
          setCostWarning(
            `Product created successfully. Manual supplier costs failed to save for ${failures.length} variant(s): ${failures.join('; ')}. Set them from the product page.`,
          );
        }
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError('UNKNOWN', 'Create failed.', 0));
    } finally {
      setBusy(false);
    }
  };

  if (created !== null) {
    return (
      <Card title="Product created">
        <div className="stack">
          {created.published ? (
            <Callout tone="info" title="Created and published">
              <strong>{created.title}</strong> is ACTIVE and published to the Online Store, so
              customers can see it.
            </Callout>
          ) : created.publishError !== null ? (
            // Publish was requested but failed: the backend left it DRAFT. Do
            // NOT say customers can see it.
            <Callout tone="warning" title="Created as DRAFT — publication failed">
              <strong>{created.title}</strong> exists but was left as DRAFT and is NOT visible to
              customers: {created.publishError} Open the product to retry publishing.
            </Callout>
          ) : (
            <Callout tone="info" title="Created as DRAFT">
              <strong>{created.title}</strong> now exists in Shopify as a DRAFT. It is not visible
              to customers until you publish it from the product page.
            </Callout>
          )}
          {costWarning !== null && (
            <Callout tone="warning" title="Manual costs incomplete">
              {costWarning}
            </Callout>
          )}
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn btn--primary"
              onClick={() =>
                router.push(`/products/${encodeURIComponent(created.shopifyProductId)}`)
              }
            >
              Open product
            </button>
            <button className="btn" onClick={() => router.push('/products')}>
              Back to products
            </button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="stack">
      <Card title="Steps">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {STEPS.map((label, index) => (
            <button
              key={label}
              className={`btn btn--sm${index === step ? ' btn--primary' : ''}`}
              onClick={() => setStep(index)}
            >
              {index + 1}. {label}
            </button>
          ))}
        </div>
      </Card>

      {error !== null && (
        <ErrorCallout error={error} />
      )}

      {step === 0 && (
        <Card title="1. Product">
          <div className="form-grid">
            <div className="field">
              <label className="field__label">Title (required)</label>
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
                onChange={(event) => setVendor(event.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label">Product type</label>
              <input
                className="input"
                value={productType}
                onChange={(event) => setProductType(event.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label">Tags (comma-separated)</label>
              <input
                className="input"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label className="field__label">Description (HTML allowed)</label>
            <textarea
              className="input"
              rows={5}
              value={descriptionHtml}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card
          title="2. Options"
          actions={
            <button
              className="btn btn--sm"
              onClick={() => {
                setOptions((prev) => [...prev, { name: '', values: '' }]);
                setVariants((prev) =>
                  prev.map((variant) => ({
                    ...variant,
                    optionValues: [...variant.optionValues, ''],
                  })),
                );
              }}
            >
              Add option
            </button>
          }
        >
          <div className="stack">
            <p className="muted">
              Optional. Leave empty for a single-variant product. Each option needs at least one
              value, e.g. Size with S, M, L.
            </p>
            {options.map((option, index) => (
              <div className="form-grid" key={index}>
                <div className="field">
                  <label className="field__label">Option {index + 1} name</label>
                  <input
                    className="input"
                    value={option.name}
                    onChange={(event) =>
                      setOptions((prev) =>
                        prev.map((entry, i) =>
                          i === index ? { ...entry, name: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label className="field__label">Values (comma-separated)</label>
                  <input
                    className="input"
                    value={option.values}
                    onChange={(event) =>
                      setOptions((prev) =>
                        prev.map((entry, i) =>
                          i === index ? { ...entry, values: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card
          title="3. Variants"
          actions={
            <button
              className="btn btn--sm"
              onClick={() => setVariants((prev) => [...prev, emptyVariant(parsedOptions.length)])}
            >
              Add variant
            </button>
          }
        >
          <div className="stack">
            <p className="muted">
              At least one variant with a price is required, so the product is purchasable and has
              a basis for margin calculations.
            </p>
            {variants.map((variant, index) => (
              <div className="stack" key={index}>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <strong>Variant {index + 1}</strong>
                  {variants.length > 1 && (
                    <button
                      className="btn btn--sm"
                      onClick={() => setVariants((prev) => prev.filter((_, i) => i !== index))}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label className="field__label">Price (required)</label>
                    <input
                      className="input"
                      type="number"
                      step="0.01"
                      min="0"
                      value={variant.price}
                      onChange={(event) =>
                        setVariants((prev) =>
                          prev.map((entry, i) =>
                            i === index ? { ...entry, price: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="field">
                    <label className="field__label">Compare-at price</label>
                    <input
                      className="input"
                      type="number"
                      step="0.01"
                      min="0"
                      value={variant.compareAtPrice}
                      onChange={(event) =>
                        setVariants((prev) =>
                          prev.map((entry, i) =>
                            i === index
                              ? { ...entry, compareAtPrice: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="field">
                    <label className="field__label">SKU</label>
                    <input
                      className="input"
                      value={variant.sku}
                      onChange={(event) =>
                        setVariants((prev) =>
                          prev.map((entry, i) =>
                            i === index ? { ...entry, sku: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="field">
                    <label className="field__label">Barcode</label>
                    <input
                      className="input"
                      value={variant.barcode}
                      onChange={(event) =>
                        setVariants((prev) =>
                          prev.map((entry, i) =>
                            i === index ? { ...entry, barcode: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                  </div>
                  {parsedOptions.map((option, optionIndex) => (
                    <div className="field" key={option.name}>
                      <label className="field__label">{option.name}</label>
                      <select
                        className="select"
                        value={variant.optionValues[optionIndex] ?? ''}
                        onChange={(event) =>
                          setVariants((prev) =>
                            prev.map((entry, i) => {
                              if (i !== index) return entry;
                              const next = [...entry.optionValues];
                              next[optionIndex] = event.target.value;
                              return { ...entry, optionValues: next };
                            }),
                          )
                        }
                      >
                        <option value="">— select —</option>
                        {option.values.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card title="4. Supplier cost">
          <div className="stack">
            <Callout tone="info" title="Why this matters">
              Automation prices from cost. Without a cost the product resolves to{' '}
              <span className="mono">UNKNOWN</span> and is skipped for automatic pricing — it is
              never treated as free. Shopify&apos;s cost per item is used when a dropshipping app
              fills it; enter a manual cost here when it does not.
            </Callout>
            <div className="form-grid">
              <div className="field">
                <label className="field__label">Currency for manual costs</label>
                <input
                  className="input"
                  maxLength={3}
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                />
              </div>
            </div>
            {variants.map((variant, index) => (
              <div className="form-grid" key={index}>
                <div className="field">
                  <label className="field__label">
                    Variant {index + 1} manual cost (optional)
                  </label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={variant.manualCost}
                    onChange={(event) =>
                      setVariants((prev) =>
                        prev.map((entry, i) =>
                          i === index ? { ...entry, manualCost: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                  <div className="field__hint">
                    {variant.price.trim().length > 0 && variant.manualCost.trim().length > 0
                      ? marginHint(variant.price, variant.manualCost)
                      : 'Recorded in Trademart after the product is created.'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card title="5. Media">
          <div className="field">
            <label className="field__label">Image URLs (one per line)</label>
            <textarea
              className="input"
              rows={5}
              value={mediaUrls}
              onChange={(event) => setMediaUrls(event.target.value)}
            />
            <div className="field__hint">
              Each URL becomes an IMAGE media entry. Shopify fetches them, so they must be
              publicly reachable.
            </div>
          </div>
        </Card>
      )}

      {step === 5 && (
        <Card
          title="6. Preview and create"
          actions={
            <button className="btn btn--primary btn--sm" onClick={submit} disabled={!canSubmit}>
              {busy ? 'Creating…' : publish ? 'Create and publish' : 'Create draft'}
            </button>
          }
        >
          <div className="stack">
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Badge tone={publish ? 'warning' : 'info'} dot>
                {publish
                  ? 'created DRAFT, then published + activated'
                  : 'will be DRAFT (hidden)'}
              </Badge>
              <Badge tone="neutral">{pricedVariants} priced variant(s)</Badge>
              <Badge tone="neutral">{parsedOptions.length} option(s)</Badge>
            </div>

            {title.trim().length === 0 && (
              <Callout tone="warning" title="Title is required">
                Go back to step 1 and enter a title.
              </Callout>
            )}
            {pricedVariants === 0 && (
              <Callout tone="warning" title="At least one priced variant is required">
                Go back to step 3 and give a variant a price.
              </Callout>
            )}

            <div className="field">
              <label className="field__label">Publish immediately</label>
              <label className="row" style={{ gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={publish}
                  onChange={(event) => setPublish(event.target.checked)}
                />
                <span className="muted">
                  {publish
                    ? 'Publish to the Online Store and activate. If publication fails the product is left DRAFT (never ACTIVE-but-invisible).'
                    : 'DRAFT — recommended, review it first'}
                </span>
              </label>
            </div>

            <p className="muted">Exactly what will be sent to the backend:</p>
            <pre className="mono" style={{ overflowX: 'auto', maxHeight: 360 }}>
              {JSON.stringify(requestBody, null, 2)}
            </pre>
          </div>
        </Card>
      )}

      <Card title="">
        <div className="row" style={{ gap: 8, justifyContent: 'space-between' }}>
          <button
            className="btn"
            onClick={() => setStep((prev) => Math.max(0, prev - 1))}
            disabled={step === 0}
          >
            Back
          </button>
          <button
            className="btn"
            onClick={() => setStep((prev) => Math.min(STEPS.length - 1, prev + 1))}
            disabled={step === STEPS.length - 1}
          >
            Next
          </button>
        </div>
      </Card>
    </div>
  );
}

/**
 * Maps a form variant to the real Shopify variant id, deterministically.
 *
 * Never assumes the created order matches the form order (Shopify does not
 * guarantee it). SKU is the strongest key; option values are the fallback; a
 * single-variant product with no options resolves to the one created variant.
 * Returns null when no confident match exists, so the caller reports a partial
 * failure instead of writing a cost against the wrong variant.
 */
function matchCreatedVariant(
  draft: VariantDraft,
  created: CreatedVariant[],
  options: { name: string; values: string[] }[],
): string | null {
  const sku = draft.sku.trim();
  if (sku.length > 0) {
    const bySku = created.find((variant) => (variant.sku ?? '') === sku);
    if (bySku !== undefined) return bySku.shopifyVariantId;
  }

  if (options.length > 0) {
    const expected = options
      .map((option, index) => ({ name: option.name, value: (draft.optionValues[index] ?? '').trim() }))
      .filter((pair) => pair.value.length > 0);
    if (expected.length > 0) {
      const byOptions = created.find((variant) =>
        expected.every((pair) =>
          variant.optionValues.some(
            (selected) =>
              selected.name === pair.name &&
              selected.value.toLowerCase() === pair.value.toLowerCase(),
          ),
        ),
      );
      if (byOptions !== undefined) return byOptions.shopifyVariantId;
    }
  }

  // Single-variant product with no options: exactly one created variant.
  if (options.length === 0 && created.length === 1) {
    return created[0]?.shopifyVariantId ?? null;
  }

  return null;
}

/** Projected margin for the cost step, computed only from real numbers. */
function marginHint(price: string, cost: string): string {
  const priceValue = Number(price);
  const costValue = Number(cost);
  if (
    !Number.isFinite(priceValue) ||
    !Number.isFinite(costValue) ||
    priceValue <= 0 ||
    costValue <= 0
  ) {
    return 'Enter a positive price and cost to see the projected margin.';
  }
  const profit = priceValue - costValue;
  const margin = (profit / priceValue) * 100;
  return `Projected profit ${profit.toFixed(2)}, margin ${margin.toFixed(1)}% (before payment/Shopify fees and ad spend).`;
}
