'use client';

/**
 * /suppliers/deodap/sync - update recorded DeoDap costs from a newer price list.
 *
 * DeoDap changes its prices; every margin Trademart shows for a DeoDap product is
 * wrong until the recorded cost follows. Upload the new list, check what changed, and
 * save the changes you accept.
 *
 * Only Trademart's recorded supplier cost changes. Shopify selling prices are not
 * touched - the pricing and automation pages use the new costs, and repricing stays a
 * decision the operator makes there.
 */

import Link from 'next/link';
import { useState } from 'react';

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
import { ApiError, apiPost, newIdempotencyKey } from '@/lib/api';
import { DEODAP_SYNC_BATCH, chunk, formatChange, syncKindLabel } from '@/lib/deodap';
import { formatAmount, formatNumber } from '@/lib/format';
import type {
  DeodapCatalogField,
  DeodapMappingOverride,
  DeodapSyncApplyResult,
  DeodapSyncChange,
  DeodapSyncPreview,
} from '@/lib/types';

type FieldOverrides = DeodapMappingOverride['fields'];

function toApiError(caught: unknown, fallback: string): ApiError {
  return caught instanceof ApiError ? caught : new ApiError('UNKNOWN', fallback, 0);
}

/** Changes that can be saved: a readable new cost that differs from the recorded one. */
function applicable(change: DeodapSyncChange): boolean {
  return change.kind === 'COST_CHANGED' && change.newCost !== null;
}

export default function DeodapSyncPage() {
  const [file, setFile] = useState<LoadedCsv | null>(null);
  const [fields, setFields] = useState<FieldOverrides>({});
  const [preview, setPreview] = useState<DeodapSyncPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<ApiError | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<ApiError | null>(null);
  const [applied, setApplied] = useState<DeodapSyncApplyResult | null>(null);

  const runPreview = async (next: { file: LoadedCsv; fields: FieldOverrides }) => {
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const response = await apiPost<DeodapSyncPreview>('/suppliers/deodap/sync/preview', {
        csv: next.file.text,
        sourceFile: next.file.name,
        ...(Object.keys(next.fields).length > 0 ? { mapping: { fields: next.fields } } : {}),
      });
      setPreview(response.data);
      setSelected(
        new Set(response.data.changes.filter(applicable).map((change) => change.shopifyVariantId)),
      );
    } catch (caught) {
      setPreviewError(toApiError(caught, 'Matching the price list failed.'));
    } finally {
      setPreviewBusy(false);
    }
  };

  const onFile = (loaded: LoadedCsv) => {
    setFile(loaded);
    setFields({});
    setPreview(null);
    setApplied(null);
    setApplyError(null);
    void runPreview({ file: loaded, fields: {} });
  };

  const onMapping = (field: DeodapCatalogField, header: string | null) => {
    if (file === null) return;
    const next: FieldOverrides = { ...fields, [field]: header };
    setFields(next);
    void runPreview({ file, fields: next });
  };

  const chosen =
    preview === null
      ? []
      : preview.changes.filter(
          (change) => applicable(change) && selected.has(change.shopifyVariantId),
        );
  const busy = previewBusy || applying;

  const toggle = (variantId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  };

  const apply = async () => {
    setConfirming(false);
    if (preview === null || file === null || chosen.length === 0) return;
    setApplying(true);
    setApplyError(null);
    const combined: DeodapSyncApplyResult = {
      results: [],
      summary: { updated: 0, skipped: 0, failed: 0 },
    };
    try {
      const updates = chosen.map((change) => ({
        shopifyVariantId: change.shopifyVariantId,
        cost: change.newCost,
        shippingCost: change.newShipping,
      }));
      for (const batch of chunk(updates, DEODAP_SYNC_BATCH)) {
        const response = await apiPost<DeodapSyncApplyResult>(
          '/suppliers/deodap/sync',
          { updates: batch, currencyCode: preview.currencyCode },
          { idempotencyKey: newIdempotencyKey() },
        );
        combined.results.push(...response.data.results);
        combined.summary.updated += response.data.summary.updated;
        combined.summary.skipped += response.data.summary.skipped;
        combined.summary.failed += response.data.summary.failed;
      }
      setApplied(combined);
    } catch (caught) {
      setApplyError(toApiError(caught, 'Saving the costs failed.'));
      if (combined.results.length > 0) setApplied(combined);
    } finally {
      setApplying(false);
      await runPreview({ file, fields });
    }
  };

  const rows =
    preview === null
      ? []
      : preview.changes.filter((change) => showUnchanged || change.kind !== 'UNCHANGED');
  const currency = preview?.currencyCode ?? null;

  return (
    <>
      <PageHeader
        title="DeoDap cost sync"
        description="Upload a newer DeoDap price list to update the supplier cost Trademart has recorded for products you imported."
      />
      <DeodapNav />

      <div className="stack">
        <Callout tone="info" title="What this changes">
          Only the DeoDap cost recorded in Trademart - the number margins, pricing suggestions
          and automation are worked out from. <strong>Shopify selling prices are not changed.</strong>{' '}
          Stock in the file is shown for information only.
        </Callout>

        <Card title="Price list">
          <div className="stack" style={{ gap: 12 }}>
            <CsvFilePicker
              id="deodap-sync-file"
              label="DeoDap price list (CSV)"
              disabled={busy}
              onLoaded={onFile}
            />
            {file !== null && (
              <p style={{ margin: 0 }}>
                <strong>{file.name}</strong>
                {preview !== null && (
                  <span className="muted"> - {formatNumber(preview.file.recordCount)} rows</span>
                )}
                {previewBusy && <span className="muted"> - matching…</span>}
              </p>
            )}
            {previewError !== null && (
              <ErrorCallout
                error={previewError}
                onRetry={file === null ? undefined : () => void runPreview({ file, fields })}
              />
            )}
          </div>
        </Card>

        {applied !== null && (
          <Callout
            tone={applied.summary.failed > 0 ? 'warning' : 'success'}
            title={`${formatNumber(applied.summary.updated)} cost(s) updated`}
          >
            {applied.summary.skipped > 0 && `${formatNumber(applied.summary.skipped)} skipped. `}
            {applied.summary.failed > 0 &&
              `${formatNumber(applied.summary.failed)} failed: ${applied.results
                .filter((result) => result.outcome === 'FAILED')
                .map((result) => result.reason ?? 'unknown reason')
                .slice(0, 3)
                .join('; ')}`}
          </Callout>
        )}
        {applyError !== null && <ErrorCallout error={applyError} />}

        {preview !== null && file !== null && (
          <>
            {preview.warnings.length > 0 && (
              <Callout tone="warning" title="Check before saving">
                <ul className="note-list" style={{ color: 'inherit' }}>
                  {preview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Callout>
            )}

            <Card
              title="Cost changes"
              actions={
                <div className="row" style={{ gap: 8 }}>
                  <label className="row muted" style={{ gap: 6, fontSize: 12.5 }}>
                    <input
                      type="checkbox"
                      checked={showUnchanged}
                      onChange={(event) => setShowUnchanged(event.target.checked)}
                    />
                    Show unchanged
                  </label>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={busy || chosen.length === 0}
                    onClick={() => setConfirming(true)}
                  >
                    Save {formatNumber(chosen.length)} cost change(s)
                  </button>
                </div>
              }
            >
              <div className="stack" style={{ gap: 12 }}>
                <p className="muted" style={{ margin: 0 }}>
                  {formatNumber(preview.summary.changed)} changed ·{' '}
                  {formatNumber(preview.summary.unchanged)} unchanged ·{' '}
                  {formatNumber(preview.summary.noCost)} without a readable cost ·{' '}
                  {formatNumber(preview.summary.outOfStock)} out of stock at DeoDap
                </p>
                {rows.length === 0 ? (
                  <EmptyState
                    title="No cost changes"
                    description="Nothing in this file differs from the costs Trademart has recorded for imported DeoDap products."
                  />
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th aria-label="Selected" />
                          <th>Product</th>
                          <th className="table__num">Recorded cost</th>
                          <th className="table__num">New cost</th>
                          <th className="table__num">Change</th>
                          <th>DeoDap stock</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((change) => (
                          <tr key={change.shopifyVariantId}>
                            <td>
                              {applicable(change) && (
                                <input
                                  type="checkbox"
                                  aria-label={`Update the cost of ${change.title}`}
                                  checked={selected.has(change.shopifyVariantId)}
                                  disabled={busy}
                                  onChange={() => toggle(change.shopifyVariantId)}
                                />
                              )}
                            </td>
                            <td>
                              <Link href={`/products/${encodeURIComponent(change.shopifyProductId)}`}>
                                {change.title}
                              </Link>
                              <div className="muted mono" style={{ fontSize: 12 }}>
                                {change.sku ?? change.supplierRef} · line {change.line}
                              </div>
                            </td>
                            <td className="table__num nowrap">
                              {formatAmount(change.currentCost, change.currentCurrency ?? currency)}
                              {change.currentShipping !== null && (
                                <div className="muted" style={{ fontSize: 12 }}>
                                  + {formatAmount(change.currentShipping, change.currentCurrency ?? currency)}{' '}
                                  shipping
                                </div>
                              )}
                            </td>
                            <td className="table__num nowrap">
                              {formatAmount(change.newCost, currency)}
                              {change.newShipping !== null && (
                                <div className="muted" style={{ fontSize: 12 }}>
                                  + {formatAmount(change.newShipping, currency)} shipping
                                </div>
                              )}
                            </td>
                            <td className="table__num">{formatChange(change.changePercent)}</td>
                            <td>
                              {change.inStock === false ? (
                                <Badge tone="warning">out of stock</Badge>
                              ) : change.stock !== null ? (
                                formatNumber(change.stock)
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                            <td>
                              <Badge
                                tone={
                                  change.kind === 'COST_CHANGED'
                                    ? 'info'
                                    : change.kind === 'UNCHANGED'
                                      ? 'neutral'
                                      : 'danger'
                                }
                              >
                                {syncKindLabel(change.kind)}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </Card>

            <Card title="Column mapping">
              <MappingEditor
                fields={preview.fields}
                headers={preview.file.headers}
                mapping={preview.mapping}
                disabled={busy}
                onChange={onMapping}
              />
            </Card>

            {(preview.unmatched.length > 0 || preview.missing.length > 0) && (
              <Card title="Not matched">
                <div className="grid grid--two">
                  <div>
                    <h3 className="card__title" style={{ fontSize: 14 }}>
                      In the file, not imported ({formatNumber(preview.unmatched.length)})
                    </h3>
                    <p className="muted">
                      These rows match nothing Trademart imported from DeoDap.{' '}
                      <Link href="/suppliers/deodap/import">Import them</Link> to start tracking them.
                    </p>
                    <ul className="note-list">
                      {preview.unmatched.slice(0, 20).map((row) => (
                        <li key={`${row.line}-${row.ref ?? ''}`}>
                          Line {row.line}: {row.title ?? row.ref ?? 'untitled'}
                        </li>
                      ))}
                      {preview.unmatched.length > 20 && (
                        <li>…and {formatNumber(preview.unmatched.length - 20)} more</li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <h3 className="card__title" style={{ fontSize: 14 }}>
                      Imported, not in the file ({formatNumber(preview.missing.length)})
                    </h3>
                    <p className="muted">
                      Their recorded costs stay as they are. A product missing from a full DeoDap
                      list may have been discontinued.
                    </p>
                    <ul className="note-list">
                      {preview.missing.slice(0, 20).map((row) => (
                        <li key={row.supplierRef}>
                          <Link href={`/products/${encodeURIComponent(row.shopifyProductId)}`}>
                            {row.title}
                          </Link>{' '}
                          <span className="mono">({row.supplierRef})</span>
                        </li>
                      ))}
                      {preview.missing.length > 20 && (
                        <li>…and {formatNumber(preview.missing.length - 20)} more</li>
                      )}
                    </ul>
                  </div>
                </div>
              </Card>
            )}
          </>
        )}
      </div>

      {confirming && preview !== null && (
        <ConfirmDialog
          title={`Update ${formatNumber(chosen.length)} DeoDap cost(s)?`}
          intent="The recorded DeoDap cost of these products will change."
          changes={chosen.slice(0, 8).map((change) => ({
            label: change.sku ?? change.title,
            from:
              change.currentCost === null
                ? null
                : formatAmount(change.currentCost, change.currentCurrency ?? currency),
            to: formatAmount(change.newCost, currency),
          }))}
          consequence={`${
            chosen.length > 8 ? `…and ${formatNumber(chosen.length - 8)} more. ` : ''
          }Shopify selling prices are not changed. Margins, pricing suggestions and automation use the new costs from now on.`}
          confirmLabel="Save costs"
          tone="warning"
          onConfirm={() => void apply()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
