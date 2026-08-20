'use client';

/**
 * Manual supplier cost editor.
 *
 * Shared by the review queue and the product detail page so the cost-entry
 * rules exist once. Talks to /api/costs (GET/PUT/DELETE); nothing here touches
 * Shopify - a manual cost is Trademart's own record, which the pricing engine
 * then consults through the cost hierarchy.
 *
 * The `override` flag is the subtle part and is spelled out in the UI: by
 * default a manual cost ranks BELOW Shopify's cost per item, because the
 * dropshipping app's value is usually more current than a hand-typed one.
 * Override exists for the case where the Shopify value is simply wrong. It never
 * beats a live supplier API fetch.
 */

import { useState } from 'react';

import { Badge, Callout, Modal } from '@/components/ui';
import { ApiError, apiDelete, apiPut } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { ManualCostRecord } from '@/lib/types';

export function CostSourceBadge({ source }: { source: string }) {
  const label =
    source === 'SUPPLIER_API'
      ? 'Supplier API'
      : source === 'SHOPIFY_UNIT_COST'
        ? 'Shopify Cost Per Item'
        : source === 'MANUAL'
          ? 'Manual'
          : 'Unknown';
  const tone =
    source === 'SUPPLIER_API'
      ? 'success'
      : source === 'SHOPIFY_UNIT_COST'
        ? 'info'
        : source === 'MANUAL'
          ? 'warning'
          : 'danger';
  return <Badge tone={tone as 'success' | 'info' | 'warning' | 'danger'}>{label}</Badge>;
}

export function ManualCostEditor({
  productId,
  variantId,
  existing,
  defaultCurrency,
  onClose,
  onSaved,
}: {
  productId: string;
  variantId: string | null;
  existing: ManualCostRecord | null;
  defaultCurrency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState<string>(
    existing !== null ? String(existing.amount) : '',
  );
  const [shippingCost, setShippingCost] = useState<string>(
    existing?.shippingCost != null ? String(existing.shippingCost) : '',
  );
  const [currencyCode, setCurrencyCode] = useState<string>(
    existing?.currencyCode ?? defaultCurrency,
  );
  const [override, setOverride] = useState<boolean>(existing?.override ?? false);
  const [note, setNote] = useState<string>(existing?.note ?? '');
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const parsed = Number(amount);
  // A cost of 0 is refused here as well as on the backend. Zero is how "unknown"
  // silently becomes "free", which then computes an absurd margin.
  const valid = amount.trim().length > 0 && Number.isFinite(parsed) && parsed > 0;

  const save = async () => {
    if (!valid) return;
    setBusy('save');
    setError(null);
    try {
      const shippingParsed = Number(shippingCost);
      const shippingValid =
        shippingCost.trim().length > 0 && Number.isFinite(shippingParsed) && shippingParsed > 0;
      await apiPut<ManualCostRecord>('/costs', {
        productId,
        variantId,
        amount: parsed,
        // Omitted when blank — never sent as 0, which would read as "free
        // shipping" rather than "unknown".
        ...(shippingValid ? { shippingCost: shippingParsed } : {}),
        currencyCode: currencyCode.toUpperCase(),
        override,
        note: note.trim().length > 0 ? note.trim() : null,
      });
      onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError('UNKNOWN', 'Save failed.', 0));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('delete');
    setError(null);
    try {
      const params = new URLSearchParams({ productId });
      if (variantId !== null) params.set('variantId', variantId);
      await apiDelete<unknown>(`/costs?${params.toString()}`);
      onSaved();
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught : new ApiError('UNKNOWN', 'Delete failed.', 0),
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title="Manual supplier cost" onClose={onClose}>
      <div className="stack">
        {existing !== null && (
          <div className="kv">
            <div className="kv__key">Current</div>
            <div className="kv__value">
              {existing.amount} {existing.currencyCode}{' '}
              {existing.override && <Badge tone="warning">override</Badge>}
            </div>
            <div className="kv__key">Updated</div>
            <div className="kv__value">{formatDateTime(existing.updatedAt)}</div>
            {existing.note !== null && (
              <>
                <div className="kv__key">Note</div>
                <div className="kv__value">{existing.note}</div>
              </>
            )}
          </div>
        )}

        {error !== null && (
          <Callout tone="danger" title={error.code}>
            {error.message}
          </Callout>
        )}

        <div className="form-grid">
          <div className="field">
            <label className="field__label">Cost amount</label>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <div className="field__hint">
              Must be greater than zero. A missing cost stays UNKNOWN rather than becoming 0.
            </div>
          </div>
          <div className="field">
            <label className="field__label">Shipping cost (optional)</label>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              value={shippingCost}
              onChange={(event) => setShippingCost(event.target.value)}
            />
            <div className="field__hint">
              Supplier shipping per unit, if known. Left blank it stays UNKNOWN — not 0.
            </div>
          </div>
          <div className="field">
            <label className="field__label">Currency</label>
            <input
              className="input"
              maxLength={3}
              value={currencyCode}
              onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())}
            />
          </div>
          <div className="field">
            <label className="field__label">Override Shopify cost per item</label>
            <label className="row" style={{ gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={override}
                onChange={(event) => setOverride(event.target.checked)}
              />
              <span className="muted">{override ? 'on' : 'off'}</span>
            </label>
            <div className="field__hint">
              Off: Shopify&apos;s cost per item wins, because the dropshipping app usually keeps it
              more current. On: this value wins — use it when the Shopify cost is wrong. Neither
              beats a live supplier API cost.
            </div>
          </div>
          <div className="field">
            <label className="field__label">Note (optional)</label>
            <input
              className="input"
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>

        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={onClose} disabled={busy !== null}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={save}
            disabled={!valid || busy !== null}
            title={valid ? undefined : 'Enter a cost greater than zero'}
          >
            {busy === 'save' ? 'Saving…' : 'Save cost'}
          </button>
          {existing !== null && (
            <button className="btn" onClick={remove} disabled={busy !== null}>
              {busy === 'delete' ? 'Removing…' : 'Remove manual cost'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
