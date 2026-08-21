'use client';

/**
 * Create a product.
 *
 * Posts to POST /api/shopify/products.
 *
 * STATUS AND PUBLICATION ARE SEPARATE FIELDS, because they are separate things.
 * `status: 'ACTIVE'` does NOT make a product visible - a product can be ACTIVE and
 * published to no sales channel, or published while DRAFT, and both are invisible.
 * So this form sends `{ status, publish }` and the backend does:
 *
 *     create as DRAFT -> variants -> publish -> VERIFY -> set ACTIVE -> VERIFY
 *
 * If publication fails the product is deliberately left as a DRAFT and the
 * response is HTTP 207 with `partialSuccess` and warnings. This page reports that
 * honestly instead of showing a success screen, and it never claims customers can
 * see the product unless `visibleToCustomers` came back true.
 *
 * A stepped layout keeps the decisions in a sensible order (identity, then
 * options, then priced variants, then media) and ends on a preview of the exact
 * request body, so nothing is sent that the operator has not seen.
 *
 * DRAFT PERSISTENCE: the form autosaves to localStorage, because this wizard
 * takes real time to fill in and a refresh used to discard all of it. Only the
 * product fields are stored - never a token, a session or a cost credential.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  Badge,
  Callout,
  Card,
  ErrorCallout,
  PageHeader,
  VisibilityBadge,
} from '@/components/ui';
import { ApiError, apiPost, apiPut, newIdempotencyKey } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { ProductCreateResult } from '@/lib/types';

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

/* ------------------------------------------------------- draft persistence -- */

/**
 * localStorage key for the in-progress product form.
 *
 * Versioned so a future change to the draft shape cannot resurrect a stale
 * structure into a form that no longer matches it.
 */
const DRAFT_KEY = 'trademart:product-draft:v1';

/**
 * The subset of the form that is saved.
 *
 * ONLY product fields. Deliberately no session, no CSRF token, no API key and no
 * operator identity - localStorage is readable by any script on the origin, so
 * nothing sensitive belongs in it. Everything here is data the operator typed and
 * is about to send to Shopify anyway.
 */
interface ProductDraft {
  savedAt: string;
  title: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  tags: string;
  publish: boolean;
  options: OptionDraft[];
  variants: VariantDraft[];
  currency: string;
  mediaUrls: string;
}

function readDraft(): ProductDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<ProductDraft>;
    // Only offer a restore when there is something worth restoring.
    if (typeof parsed.title !== 'string' || !Array.isArray(parsed.variants)) return null;
    if (parsed.title.trim().length === 0 && parsed.variants.length <= 1) return null;
    return {
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
      title: parsed.title,
      descriptionHtml: parsed.descriptionHtml ?? '',
      vendor: parsed.vendor ?? '',
      productType: parsed.productType ?? '',
      tags: parsed.tags ?? '',
      // Publication intent is deliberately NOT restored as true. Recovering a
      // draft should never carry a "make this live" decision the operator has
      // forgotten they made.
      publish: false,
      options: Array.isArray(parsed.options) ? parsed.options : [],
      variants: parsed.variants as VariantDraft[],
      currency: parsed.currency ?? 'GBP',
      mediaUrls: parsed.mediaUrls ?? '',
    };
  } catch {
    // Corrupt draft: discard rather than fail the page.
    return null;
  }
}

function clearDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // A full or blocked localStorage must not break the form.
  }
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

  /** A recovered draft, offered but not applied until the operator asks. */
  const [recoverable, setRecoverable] = useState<ProductDraft | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  /**
   * Idempotency key for THIS submission.
   *
   * Generated once per mounted form, so pressing Create twice - or retrying after
   * a dropped response - reuses the same key and the backend replays the first
   * outcome rather than creating a second product. A fresh key per click would
   * provide no protection at all.
   */
  const submissionKeyRef = useRef<string>(newIdempotencyKey());

  // Offer a recovered draft on mount. Never applied automatically: silently
  // repopulating a form is disorienting, and the operator may have deliberately
  // started fresh.
  useEffect(() => {
    const draft = readDraft();
    if (draft !== null) setRecoverable(draft);
  }, []);

  const restoreDraft = useCallback(() => {
    if (recoverable === null) return;
    setTitle(recoverable.title);
    setDescription(recoverable.descriptionHtml);
    setVendor(recoverable.vendor);
    setProductType(recoverable.productType);
    setTags(recoverable.tags);
    setOptions(recoverable.options);
    setVariants(recoverable.variants.length > 0 ? recoverable.variants : [emptyVariant(0)]);
    setCurrency(recoverable.currency);
    setMediaUrls(recoverable.mediaUrls);
    setRecoverable(null);
  }, [recoverable]);

  const discardDraft = useCallback(() => {
    clearDraft();
    setRecoverable(null);
    setDraftSavedAt(null);
  }, []);

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
      // Two independent fields. `status` is the DESIRED end status and `publish`
      // is the storefront intent; the backend grants each only after verifying
      // the preceding step. Sending status:'ACTIVE' alone would NOT publish.
      status: publish ? 'ACTIVE' : 'DRAFT',
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

  /**
   * Autosave, debounced.
   *
   * Debounced rather than saved on every keystroke so typing a description does
   * not write to localStorage on every character. Skipped once the product has
   * been created - at that point the draft is finished business.
   */
  useEffect(() => {
    if (created !== null) return;
    if (typeof window === 'undefined') return;
    // Nothing worth saving yet, and writing an empty draft would make the
    // restore prompt appear for no reason on the next visit.
    if (title.trim().length === 0 && variants.length <= 1 && mediaUrls.trim().length === 0) return;

    const timer = setTimeout(() => {
      const draft: ProductDraft = {
        savedAt: new Date().toISOString(),
        title,
        descriptionHtml,
        vendor,
        productType,
        tags,
        publish,
        options,
        variants,
        currency,
        mediaUrls,
      };
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        setDraftSavedAt(draft.savedAt);
      } catch {
        // Quota exceeded or storage disabled. The form still works; it just will
        // not survive a refresh, which is the pre-existing behaviour.
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [
    created,
    title,
    descriptionHtml,
    vendor,
    productType,
    tags,
    publish,
    options,
    variants,
    currency,
    mediaUrls,
  ]);

  /**
   * Warn before leaving with unsaved work.
   *
   * The draft is autosaved, so this is a second line of defence for the case
   * where localStorage is unavailable - and a useful signal regardless.
   */
  useEffect(() => {
    if (created !== null) return;
    const dirty = title.trim().length > 0 || pricedVariants > 0;
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Browsers ignore custom text now, but returnValue must be set for the
      // native prompt to appear at all.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [created, title, pricedVariants]);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setCostWarning(null);
    try {
      // A stable idempotency key per submission attempt sequence: if the response
      // is lost and the operator presses Create again, the backend replays the
      // original result instead of creating a second product.
      const response = await apiPost<ProductCreateResult>(
        '/shopify/products',
        requestBody,
        { idempotencyKey: submissionKeyRef.current },
      );
      const product = response.data;
      setCreated(product);
      // The wizard's work is done; a leftover draft would prompt a pointless
      // restore next time.
      clearDraft();
      setDraftSavedAt(null);

      // Manual costs are a separate concern (/api/costs), so they are recorded
      // after creation. A failure here must NOT read as "product creation
      // failed" - the product exists either way.
      // Do not attach costs to a product whose variants failed - the prices are
      // not the ones the operator entered, so a cost against them would be wrong.
      const withCost =
        product.variantsCreated === 0
          ? []
          : variants.filter(
              (variant) =>
                variant.price.trim().length > 0 && variant.manualCost.trim().length > 0,
            );
      if (withCost.length > 0) {
        const failures: string[] = [];
        for (let index = 0; index < withCost.length; index += 1) {
          const draft = withCost[index] as VariantDraft;
          const amount = Number(draft.manualCost);
          if (!Number.isFinite(amount) || amount <= 0) {
            failures.push(`variant ${index + 1}: cost must be greater than zero`);
            continue;
          }
          // ProductCreateResult reports how many variants were created but not
          // their ids, so the cost is attached at PRODUCT level. A product-level
          // cost applies to every variant, which is the right default here and is
          // adjustable per variant from the product page.
          const variantId = null;
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
            failures.push(
              `variant ${index + 1}: ${caught instanceof ApiError ? caught.message : 'failed'}`,
            );
          }
        }
        if (failures.length > 0) {
          setCostWarning(
            `The product was created, but some manual costs were not saved: ${failures.join('; ')}. Set them from the product page.`,
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
      <Card title={created.partialSuccess ? 'Product created, with problems' : 'Product created'}>
        <div className="stack">
          {/*
            Visibility is stated ONLY from created.visibleToCustomers, which the
            backend sets from a verified read of both the status and the Online
            Store publication. Inferring it from status here is exactly the bug
            this whole flow was rebuilt to remove.
          */}
          <Callout
            tone={created.visibleToCustomers ? 'success' : created.partialSuccess ? 'warning' : 'info'}
            title={
              created.visibleToCustomers
                ? 'Live: customers can see this product'
                : `Created as ${created.status} — NOT visible to customers`
            }
          >
            <strong>{created.title}</strong> now exists in Shopify.
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <Badge tone={created.status === 'ACTIVE' ? 'success' : 'neutral'}>
                status {created.status}
              </Badge>
              <VisibilityBadge
                status={created.status}
                publishedToOnlineStore={
                  created.publication.requested ? created.publication.published : null
                }
              />
              <Badge tone="neutral">{created.variantsCreated} variant(s)</Badge>
              {created.mediaAttached > 0 && (
                <Badge tone="neutral">{created.mediaAttached} image(s)</Badge>
              )}
            </div>
            {created.desiredStatus !== created.status && (
              <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
                You asked for <span className="mono">{created.desiredStatus}</span> but Shopify
                reports <span className="mono">{created.status}</span>.
              </p>
            )}
          </Callout>

          {created.warnings.length > 0 && (
            <Callout tone="warning" title="Not everything completed">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {created.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
              {created.publication.requested && !created.publication.published && (
                <p style={{ marginBottom: 0, marginTop: 8 }}>
                  The product was left as a <strong>DRAFT</strong> on purpose, so nothing
                  half-finished is on sale. Publish it from the product page once the cause is
                  fixed.
                </p>
              )}
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

      {recoverable !== null && (
        <Callout tone="info" title="An unfinished product was recovered">
          You have a draft saved
          {recoverable.savedAt.length > 0 ? ` from ${formatDateTime(recoverable.savedAt)}` : ''}
          {recoverable.title.trim().length > 0 ? `: "${recoverable.title.trim()}"` : ''}. Restoring
          fills this form back in. Publication is not restored - you will be asked again before
          anything goes live.
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn btn--sm btn--primary" onClick={restoreDraft}>
              Restore draft
            </button>
            <button className="btn btn--sm" onClick={discardDraft}>
              Discard it
            </button>
          </div>
        </Callout>
      )}

      {error !== null && <ErrorCallout error={error} />}

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
                {publish ? 'will be ACTIVE (visible)' : 'will be DRAFT (hidden)'}
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
                    ? 'ACTIVE — customers can see it as soon as it is created'
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
