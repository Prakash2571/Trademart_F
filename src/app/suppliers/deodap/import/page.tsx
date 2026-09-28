'use client';

/**
 * /suppliers/deodap/import - a DeoDap CSV into Shopify drafts.
 *
 *   1. choose the file     read here, parsed by the backend (one CSV reader, tested)
 *   2. check the columns   every mapping change re-runs the preview
 *   3. check the prices    markup, rounding and MRP; every change re-runs the preview
 *   4. choose and import   batches of 10, each request with its own Idempotency-Key
 *
 * Nothing reaches Shopify before step 4, and even then only as DRAFTS - publishing is
 * the review queue's job. The backend's import ledger makes a double click, a retry or
 * a second tab harmless: a product that was already imported comes back SKIPPED.
 */

import Link from 'next/link';
import { useState, type ChangeEvent } from 'react';

import { CsvFilePicker, DeodapNav, MappingEditor, type LoadedCsv } from '@/components/DeodapUi';
import {
  Badge,
  Callout,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorCallout,
  PageHeader,
} from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { ApiError, apiPost, newIdempotencyKey } from '@/lib/api';
import {
  DEODAP_IMPORT_BATCH,
  chunk,
  importOutcomeLabel,
  importOutcomeTone,
  previewStatusLabel,
  previewStatusTone,
} from '@/lib/deodap';
import { formatAmount, formatDateTime, formatNumber, parseNumericInput } from '@/lib/format';
import type {
  DeodapCatalogField,
  DeodapImportBatchResult,
  DeodapImportDraft,
  DeodapImportItemResult,
  DeodapImportPreview,
  DeodapImportRecord,
  DeodapMappingOverride,
  DeodapPreviewProduct,
  DeodapPreviewStatus,
  DeodapPriceRounding,
  DeodapPricingMode,
  DeodapPricingRule,
  DeodapStatus,
} from '@/lib/types';

type Filter = 'ALL' | DeodapPreviewStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'READY', label: 'Ready' },
  { key: 'NEEDS_ATTENTION', label: 'Needs attention' },
  { key: 'ALREADY_IMPORTED', label: 'Already imported' },
];

/** Rows rendered at once. A DeoDap export can hold thousands of products. */
const PAGE_ROWS = 200;

type FieldOverrides = DeodapMappingOverride['fields'];

function toApiError(caught: unknown, fallback: string): ApiError {
  return caught instanceof ApiError ? caught : new ApiError('UNKNOWN', fallback, 0);
}

function moneyRange(min: number | null, max: number | null, currency: string | null): string {
  if (min === null || max === null) return '—';
  return min === max
    ? formatAmount(min, currency)
    : `${formatAmount(min, currency)} – ${formatAmount(max, currency)}`;
}

export default function DeodapImportPage() {
  const [file, setFile] = useState<LoadedCsv | null>(null);
  const [fields, setFields] = useState<FieldOverrides>({});
  const [pricing, setPricing] = useState<DeodapPricingRule | null>(null);
  const [markupInput, setMarkupInput] = useState('');
  const [preview, setPreview] = useState<DeodapImportPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<ApiError | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState<Filter>('ALL');
  const [visibleRows, setVisibleRows] = useState(PAGE_ROWS);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<DeodapImportItemResult[] | null>(null);
  const [importError, setImportError] = useState<ApiError | null>(null);
  const history = useApi<DeodapImportRecord[]>('/suppliers/deodap/imports?limit=50');
  // For the order flow: with DeoDap's app placing orders, products created here are the
  // exception, and the operator should know that before choosing a file.
  const status = useApi<DeodapStatus>('/suppliers/deodap/status');
  const appFlow = (preview?.orderFlow ?? status.data?.settings.orderFlow) === 'SHOPIFY_APP';

  /**
   * Re-reads the file with the current mapping and pricing. `keep` narrows the new
   * selection to what was selected before; null selects every ready product.
   */
  const runPreview = async (
    next: { file: LoadedCsv; fields: FieldOverrides; pricing: DeodapPricingRule | null },
    keep: ReadonlySet<string> | null,
  ) => {
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const response = await apiPost<DeodapImportPreview>('/suppliers/deodap/import/preview', {
        csv: next.file.text,
        sourceFile: next.file.name,
        ...(Object.keys(next.fields).length > 0 ? { mapping: { fields: next.fields } } : {}),
        ...(next.pricing !== null ? { pricing: next.pricing } : {}),
      });
      const data = response.data;
      setPreview(data);
      setPricing(data.pricing);
      setMarkupInput(String(data.pricing.markupPercent));
      const ready = data.products
        .filter((product) => product.status === 'READY' && product.ref !== null)
        .map((product) => product.ref as string);
      setSelected(new Set(keep === null ? ready : ready.filter((ref) => keep.has(ref))));
      setVisibleRows(PAGE_ROWS);
    } catch (caught) {
      setPreviewError(toApiError(caught, 'The preview failed.'));
    } finally {
      setPreviewBusy(false);
    }
  };

  /** Keep the operator's selection across a re-preview, once there was one to keep. */
  const selectionToKeep = (): ReadonlySet<string> | null =>
    preview !== null && preview.summary.ready > 0 ? selected : null;

  const onFile = (loaded: LoadedCsv) => {
    setFile(loaded);
    setFields({});
    setPricing(null);
    setPreview(null);
    setResults(null);
    setImportError(null);
    setFilter('ALL');
    void runPreview({ file: loaded, fields: {}, pricing: null }, null);
  };

  const onMapping = (field: DeodapCatalogField, header: string | null) => {
    if (file === null) return;
    const next: FieldOverrides = { ...fields, [field]: header };
    setFields(next);
    void runPreview({ file, fields: next, pricing }, selectionToKeep());
  };

  const markupParsed = parseNumericInput(markupInput, { label: 'Markup' });
  const markupProblem =
    markupParsed.error ??
    (markupParsed.value === null
      ? 'Enter a markup, for example 50.'
      : markupParsed.value > 1000
        ? 'Markup must be at most 1000%.'
        : null);

  const onPricing = (patch: Partial<DeodapPricingRule>) => {
    if (file === null || pricing === null) return;
    if (markupProblem !== null || markupParsed.value === null) return;
    const next: DeodapPricingRule = { ...pricing, markupPercent: markupParsed.value, ...patch };
    setPricing(next);
    void runPreview({ file, fields, pricing: next }, selectionToKeep());
  };

  const readyProducts =
    preview === null
      ? []
      : preview.products.filter(
          (product) => product.status === 'READY' && product.draft !== null && product.ref !== null,
        );
  const chosen = readyProducts.filter((product) => selected.has(product.ref as string));
  const busy = previewBusy || progress !== null;
  const canImport =
    preview !== null && preview.currencyProblem === null && chosen.length > 0 && !busy;

  const toggle = (ref: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  };

  const runImport = async () => {
    setConfirming(false);
    if (preview === null || file === null || !canImport) return;
    setImportError(null);

    const drafts = chosen
      .map((product) => product.draft)
      .filter((draft): draft is DeodapImportDraft => draft !== null);
    const collected: DeodapImportItemResult[] = [];
    setResults([]);
    setProgress({ done: 0, total: drafts.length });
    try {
      for (const batch of chunk(drafts, DEODAP_IMPORT_BATCH)) {
        const response = await apiPost<DeodapImportBatchResult>(
          '/suppliers/deodap/import',
          { products: batch, currencyCode: preview.currencyCode, sourceFile: file.name },
          { idempotencyKey: newIdempotencyKey() },
        );
        collected.push(...response.data.results);
        setResults([...collected]);
        setProgress({ done: collected.length, total: drafts.length });
        // The backend stops a batch when the rest would fail the same way (Shopify
        // throttled, credentials missing). Sending the next batch would only repeat it.
        if (response.data.summary.NOT_ATTEMPTED > 0) break;
      }
    } catch (caught) {
      setImportError(toApiError(caught, 'The import failed.'));
    } finally {
      setProgress(null);
      history.refetch();
      // Read the file again, so what was just imported shows as imported.
      await runPreview({ file, fields, pricing }, null);
    }
  };

  const shown =
    preview === null
      ? []
      : preview.products.filter((product) => filter === 'ALL' || product.status === filter);

  return (
    <>
      <PageHeader
        title="Import from DeoDap"
        description="Turn a DeoDap product file into Shopify draft products, with DeoDap's cost recorded for each one."
      />
      <DeodapNav />

      <div className="stack">
        {/* Before a file is read. Afterwards the backend says the same thing first in its
            own warnings, so showing both would repeat it. */}
        {appFlow && preview === null && (
          <Callout tone="warning" title="You are set up to use DeoDap's Shopify app">
            DeoDap&apos;s app only sends orders to DeoDap for products it imported itself.
            Products created here are <strong>not</strong> known to the app, so you would place
            their orders with DeoDap yourself on the{' '}
            <Link href="/suppliers/deodap/orders">DeoDap orders</Link> page. To have orders sent
            automatically, import the product through DeoDap&apos;s app instead. The order flow is
            set on the <Link href="/suppliers/deodap">DeoDap page</Link>.
          </Callout>
        )}

        <Card title="1. Choose a DeoDap product file">
          <div className="stack" style={{ gap: 12 }}>
            <CsvFilePicker
              id="deodap-import-file"
              label="DeoDap CSV file"
              disabled={busy}
              onLoaded={onFile}
            />
            <p className="muted" style={{ margin: 0 }}>
              Both shapes work: one row per product (title, SKU, DeoDap price, MRP, stock,
              images), or a Shopify-style export where rows share a <span className="mono">Handle</span>{' '}
              and add variants or images.
            </p>
            {file !== null && (
              <p style={{ margin: 0 }}>
                <strong>{file.name}</strong>
                {preview !== null && (
                  <span className="muted">
                    {' '}
                    - {formatNumber(preview.file.recordCount)} rows,{' '}
                    {formatNumber(preview.summary.products)} products, {preview.file.delimiter}{' '}
                    separated
                  </span>
                )}
                {previewBusy && <span className="muted"> - reading…</span>}
              </p>
            )}
            {previewError !== null && (
              <ErrorCallout
                error={previewError}
                onRetry={
                  file === null ? undefined : () => void runPreview({ file, fields, pricing }, null)
                }
              />
            )}
          </div>
        </Card>

        {preview !== null && file !== null && (
          <>
            {preview.warnings.length > 0 && (
              <Callout tone="warning" title="Check before importing">
                <ul className="note-list" style={{ color: 'inherit' }}>
                  {preview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Callout>
            )}
            {preview.currencyProblem !== null && (
              <Callout tone="danger" title="Currency mismatch - importing is blocked">
                {preview.currencyProblem}{' '}
                <Link href="/suppliers/deodap">Change the DeoDap currency</Link>.
              </Callout>
            )}

            <Card title="2. Check the columns">
              <MappingEditor
                fields={preview.fields}
                headers={preview.file.headers}
                mapping={preview.mapping}
                disabled={busy}
                onChange={onMapping}
              />
            </Card>

            {pricing !== null && (
              <Card title="3. Check the prices">
                <div className="stack" style={{ gap: 12 }}>
                  <div className="form-grid">
                    <div className="field">
                      <label className="field__label" htmlFor="import-mode">
                        Selling price
                      </label>
                      <select
                        id="import-mode"
                        className="select"
                        value={pricing.mode}
                        disabled={busy}
                        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                          onPricing({ mode: event.target.value as DeodapPricingMode })
                        }
                      >
                        <option value="MARKUP">DeoDap cost + markup</option>
                        <option value="RETAIL">The MRP from the file</option>
                      </select>
                    </div>
                    <div className="field">
                      <label className="field__label" htmlFor="import-markup">
                        Markup %
                      </label>
                      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                        <input
                          id="import-markup"
                          className="input"
                          inputMode="decimal"
                          value={markupInput}
                          disabled={busy}
                          onChange={(event) => setMarkupInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') onPricing({});
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn--sm"
                          disabled={busy || markupProblem !== null}
                          onClick={() => onPricing({})}
                        >
                          Update
                        </button>
                      </div>
                      <div className="field__hint">
                        {markupProblem ??
                          (pricing.mode === 'RETAIL'
                            ? 'Used for rows without an MRP.'
                            : 'Added to the DeoDap cost.')}
                      </div>
                    </div>
                    <div className="field">
                      <label className="field__label" htmlFor="import-rounding">
                        Rounding
                      </label>
                      <select
                        id="import-rounding"
                        className="select"
                        value={pricing.rounding}
                        disabled={busy}
                        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                          onPricing({ rounding: event.target.value as DeodapPriceRounding })
                        }
                      >
                        <option value="integer">Whole amounts (e.g. 299)</option>
                        <option value="charm99">Ending in .99 (e.g. 298.99)</option>
                        <option value="none">Exact (e.g. 298.50)</option>
                      </select>
                    </div>
                  </div>
                  <label className="row" style={{ gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={pricing.includeShipping}
                      disabled={busy}
                      onChange={(event) => onPricing({ includeShipping: event.target.checked })}
                    />
                    Add DeoDap&apos;s shipping charge to the cost before the markup
                  </label>
                  <label className="row" style={{ gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={pricing.compareAtFromRetail}
                      disabled={busy}
                      onChange={(event) => onPricing({ compareAtFromRetail: event.target.checked })}
                    />
                    Show the MRP as the &quot;compare at&quot; price when it is higher
                  </label>
                  <p className="muted" style={{ margin: 0 }}>
                    Costs are in <strong>{preview.currencyCode}</strong>
                    {preview.shopCurrency !== null && (
                      <>
                        ; your store sells in <strong>{preview.shopCurrency}</strong>
                      </>
                    )}
                    . Products are created with the vendor <strong>{preview.vendor}</strong> and the
                    tag <strong>DeoDap</strong>. Defaults are set on the{' '}
                    <Link href="/suppliers/deodap">DeoDap page</Link>.
                  </p>
                </div>
              </Card>
            )}

            <Card
              title="4. Choose products"
              actions={
                <div className="row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={busy || readyProducts.length === 0}
                    onClick={() =>
                      setSelected(new Set(readyProducts.map((product) => product.ref as string)))
                    }
                  >
                    Select all ready
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={busy || selected.size === 0}
                    onClick={() => setSelected(new Set())}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={!canImport}
                    onClick={() => setConfirming(true)}
                  >
                    Import {formatNumber(chosen.length)} as drafts
                  </button>
                </div>
              }
            >
              <div className="stack" style={{ gap: 12 }}>
                <p className="muted" style={{ margin: 0 }}>
                  {formatNumber(preview.summary.ready)} ready ·{' '}
                  {formatNumber(preview.summary.needsAttention)} need attention ·{' '}
                  {formatNumber(preview.summary.alreadyImported)} already imported
                  {preview.summary.inProgress > 0 &&
                    ` · ${formatNumber(preview.summary.inProgress)} being imported elsewhere`}
                  {!preview.ledgerChecked && ' · already-imported check unavailable'}
                </p>

                {progress !== null && (
                  <Callout tone="info" title="Importing…">
                    {formatNumber(progress.done)} of {formatNumber(progress.total)} done. Keep this
                    page open until it finishes.
                  </Callout>
                )}
                {importError !== null && <ErrorCallout error={importError} />}

                <div className="row" style={{ gap: 6 }}>
                  {FILTERS.map((entry) => (
                    <button
                      key={entry.key}
                      type="button"
                      className={`btn btn--sm${filter === entry.key ? ' btn--primary' : ''}`}
                      aria-pressed={filter === entry.key}
                      onClick={() => {
                        setFilter(entry.key);
                        setVisibleRows(PAGE_ROWS);
                      }}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>

                {shown.length === 0 ? (
                  <EmptyState title="Nothing to show" description="No products match this filter." />
                ) : (
                  <>
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th aria-label="Selected" />
                            <th>Product</th>
                            <th className="table__num">Variants</th>
                            <th className="table__num">DeoDap cost</th>
                            <th className="table__num">Your price</th>
                            <th className="table__num">Margin</th>
                            <th>Stock</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shown.slice(0, visibleRows).map((product) => (
                            <PreviewRow
                              key={`${product.ref ?? 'no-ref'}-${product.lines[0] ?? 0}`}
                              product={product}
                              costCurrency={preview.currencyCode}
                              priceCurrency={preview.shopCurrency ?? preview.currencyCode}
                              selected={product.ref !== null && selected.has(product.ref)}
                              disabled={busy}
                              onToggle={toggle}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {shown.length > visibleRows && (
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={() => setVisibleRows((count) => count + PAGE_ROWS)}
                      >
                        Show {formatNumber(Math.min(PAGE_ROWS, shown.length - visibleRows))} more of{' '}
                        {formatNumber(shown.length - visibleRows)}
                      </button>
                    )}
                  </>
                )}
              </div>
            </Card>
          </>
        )}

        {results !== null && results.length > 0 && <ResultsCard results={results} />}

        <HistoryCard history={history.data} error={history.error} onRetry={history.refetch} />
      </div>

      {confirming && preview !== null && (
        <ConfirmDialog
          title={`Import ${formatNumber(chosen.length)} products?`}
          intent={`${formatNumber(chosen.length)} DeoDap products will be created in Shopify.`}
          changes={[
            { label: 'Shopify products', to: `${formatNumber(chosen.length)} new drafts` },
            { label: 'Vendor', to: preview.vendor },
            { label: 'Tag', to: 'DeoDap' },
            { label: 'Supplier cost', to: `DeoDap cost recorded (${preview.currencyCode})` },
          ]}
          consequence={`They are created as DRAFTS, so customers cannot see them until you publish them from the review queue. A product already in Shopify with the same SKU is skipped, not duplicated.${
            appFlow
              ? " DeoDap's Shopify app will not send their orders to DeoDap - you place those yourself."
              : ''
          }`}
          confirmLabel="Import as drafts"
          tone="info"
          onConfirm={() => void runImport()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}

function PreviewRow({
  product,
  costCurrency,
  priceCurrency,
  selected,
  disabled,
  onToggle,
}: {
  product: DeodapPreviewProduct;
  costCurrency: string;
  priceCurrency: string;
  selected: boolean;
  disabled: boolean;
  onToggle: (ref: string) => void;
}) {
  const selectable = product.status === 'READY' && product.ref !== null && product.draft !== null;
  const existingProductId = product.existing?.shopifyProductId ?? null;
  const firstLine = product.lines[0];
  const lineLabel =
    firstLine === undefined
      ? ''
      : product.lines.length > 1
        ? `lines ${firstLine}-${product.lines[product.lines.length - 1] ?? firstLine}`
        : `line ${firstLine}`;

  return (
    <tr>
      <td>
        {selectable && (
          <input
            type="checkbox"
            aria-label={`Import ${product.title ?? product.ref ?? 'this product'}`}
            checked={selected}
            disabled={disabled}
            onChange={() => onToggle(product.ref as string)}
          />
        )}
      </td>
      <td>
        <div className="row" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          {product.imageUrls[0] !== undefined && (
            // Plain <img>: a preview thumbnail from the supplier's CDN, which next/image
            // would need a loader configured for.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrls[0]}
              alt=""
              width={40}
              height={40}
              loading="lazy"
              referrerPolicy="no-referrer"
              style={{ objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
            />
          )}
          <div>
            <div className="table__strong">
              {product.title ?? <span className="muted">No title</span>}
            </div>
            <div className="muted mono" style={{ fontSize: 12 }}>
              {product.ref ?? 'no reference'} · {lineLabel}
              {product.optionNames.length > 0 && ` · ${product.optionNames.join(' / ')}`}
            </div>
            {product.issues.length > 0 && (
              <ul className="note-list" style={{ color: 'var(--danger)' }}>
                {product.issues.slice(0, 4).map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
                {product.issues.length > 4 && <li>…and {product.issues.length - 4} more</li>}
              </ul>
            )}
            {product.warnings.length > 0 && (
              <ul className="note-list">
                {product.warnings.slice(0, 3).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
                {product.warnings.length > 3 && <li>…and {product.warnings.length - 3} more</li>}
              </ul>
            )}
          </div>
        </div>
      </td>
      <td className="table__num">{formatNumber(product.variantCount)}</td>
      <td className="table__num nowrap">{moneyRange(product.costMin, product.costMax, costCurrency)}</td>
      <td className="table__num nowrap">
        {moneyRange(product.priceMin, product.priceMax, priceCurrency)}
        {product.compareAtMax !== null && (
          <div className="muted" style={{ fontSize: 12 }}>
            MRP {formatAmount(product.compareAtMax, priceCurrency)}
          </div>
        )}
      </td>
      <td className="table__num">
        {product.marginMin === null ? '—' : `${product.marginMin.toFixed(1)}%`}
      </td>
      <td>
        {product.inStock === false ? (
          <Badge tone="warning">out of stock</Badge>
        ) : product.stock !== null ? (
          formatNumber(product.stock)
        ) : product.inStock === true ? (
          'in stock'
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td>
        <Badge tone={previewStatusTone(product.status)}>{previewStatusLabel(product.status)}</Badge>
        {existingProductId !== null && product.status === 'ALREADY_IMPORTED' && (
          <div style={{ marginTop: 4 }}>
            <Link href={`/products/${encodeURIComponent(existingProductId)}`}>Open product</Link>
          </div>
        )}
      </td>
    </tr>
  );
}

function ResultsCard({ results }: { results: DeodapImportItemResult[] }) {
  const created = results.filter((result) => result.outcome === 'CREATED' || result.outcome === 'PARTIAL');
  return (
    <Card
      title="Import results"
      actions={
        created.length > 0 ? (
          <Link href="/products/review" className="btn btn--sm">
            Open the review queue
          </Link>
        ) : undefined
      }
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Result</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.ref}>
                <td>
                  {result.shopifyProductId !== null ? (
                    <Link href={`/products/${encodeURIComponent(result.shopifyProductId)}`}>
                      {result.title}
                    </Link>
                  ) : (
                    result.title
                  )}
                  <div className="muted mono" style={{ fontSize: 12 }}>
                    {result.ref}
                  </div>
                </td>
                <td>
                  <Badge tone={importOutcomeTone(result.outcome)}>
                    {importOutcomeLabel(result.outcome)}
                  </Badge>
                </td>
                <td className="muted">
                  {result.reason !== null && <div>{result.reason}</div>}
                  {result.warnings.length > 0 && (
                    <ul className="note-list">
                      {result.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                  {result.outcome === 'CREATED' && (
                    <div>
                      DeoDap cost recorded for {formatNumber(result.costsRecorded)} variant
                      {result.costsRecorded === 1 ? '' : 's'}.
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function HistoryCard({
  history,
  error,
  onRetry,
}: {
  history: DeodapImportRecord[] | null;
  error: ApiError | null;
  onRetry: () => void;
}) {
  return (
    <Card title="Recently imported from DeoDap">
      {error !== null ? (
        <ErrorCallout error={error} onRetry={onRetry} />
      ) : history === null ? (
        <p className="muted">Loading…</p>
      ) : history.length === 0 ? (
        <EmptyState title="Nothing imported yet" description="Imported products appear here." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Status</th>
                <th className="table__num">Variants</th>
                <th className="table__num">DeoDap cost</th>
                <th>From</th>
                <th>Imported</th>
              </tr>
            </thead>
            <tbody>
              {history.map((record) => (
                <tr key={record.supplierRef}>
                  <td>
                    {record.shopifyProductId !== null ? (
                      <Link href={`/products/${encodeURIComponent(record.shopifyProductId)}`}>
                        {record.title}
                      </Link>
                    ) : (
                      record.title
                    )}
                    <div className="muted mono" style={{ fontSize: 12 }}>
                      {record.supplierRef}
                    </div>
                  </td>
                  <td>
                    <Badge
                      tone={
                        record.status === 'CREATED'
                          ? 'success'
                          : record.status === 'FAILED'
                            ? 'danger'
                            : 'warning'
                      }
                      title={record.error ?? undefined}
                    >
                      {record.status.toLowerCase()}
                    </Badge>
                  </td>
                  <td className="table__num">{formatNumber(record.variantCount)}</td>
                  <td className="table__num nowrap">
                    {moneyRange(record.costMin, record.costMax, record.currencyCode)}
                  </td>
                  <td className="muted">
                    {record.sourceFile ?? '—'}
                    {record.sourceLine !== null && `, line ${record.sourceLine}`}
                  </td>
                  <td className="nowrap">{formatDateTime(record.importedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
