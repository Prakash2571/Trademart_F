'use client';

/**
 * Pricing calculator.
 *
 * Two independent tools backed by the backend pricing engine:
 *  1. Margin calculator - profit from a selling price and costs
 *  2. Suggested price   - the price needed to hit a desired margin
 *
 * Works with no Shopify connection and no database, and every result is clearly
 * labelled an estimate when any input was omitted.
 */

import { useState } from 'react';

import { Callout, Card, PageHeader, StatCard } from '@/components/ui';
import { ApiError, apiPost } from '@/lib/api';
import { formatNumber, formatPercent } from '@/lib/format';
import type { PricingResult, SuggestedPriceResult } from '@/lib/types';

type FormState = Record<string, string>;

/** Empty strings are omitted so the backend can report them as missing. */
function toPayload(form: FormState): Record<string, number> {
  const payload: Record<string, number> = {};
  for (const [key, value] of Object.entries(form)) {
    if (value.trim() === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) payload[key] = parsed;
  }
  return payload;
}

export default function PricingPage() {
  return (
    <>
      <PageHeader
        title="Pricing"
        description="Standalone margin and price calculators. Results are estimates - unknown costs are never invented."
      />
      <div className="grid grid--two">
        <MarginCalculator />
        <SuggestedPriceCalculator />
      </div>
    </>
  );
}

/* ------------------------------------------------------- margin calculator -- */

const MARGIN_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: 'sellingPrice', label: 'Selling price *' },
  { key: 'supplierProductCost', label: 'Supplier product cost' },
  { key: 'supplierShippingCost', label: 'Supplier shipping cost' },
  { key: 'paymentFee', label: 'Payment fee' },
  { key: 'shopifyFee', label: 'Platform / Shopify fee' },
  { key: 'advertisingCost', label: 'Advertising cost (CPA)' },
  { key: 'taxes', label: 'Taxes' },
  { key: 'otherCosts', label: 'Other costs' },
];

function MarginCalculator() {
  const [form, setForm] = useState<FormState>({ sellingPrice: '2999', supplierProductCost: '1000', supplierShippingCost: '300', paymentFee: '90', advertisingCost: '500' });
  const [result, setResult] = useState<PricingResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await apiPost<PricingResult>('/pricing/calculate', toPayload(form));
      setResult(response.data);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught : new ApiError('UNKNOWN', 'Calculation failed.', 0),
      );
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Margin calculator">
      <form onSubmit={submit}>
        <div className="form-grid">
          {MARGIN_FIELDS.map((field) => (
            <div className="field" key={field.key}>
              <label className="field__label" htmlFor={`margin-${field.key}`}>
                {field.label}
              </label>
              <input
                id={`margin-${field.key}`}
                className="input"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="—"
                value={form[field.key] ?? ''}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, [field.key]: event.target.value }))
                }
              />
            </div>
          ))}
        </div>

        <div className="toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Calculating…' : 'Calculate'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setForm({});
              setResult(null);
              setError(null);
            }}
          >
            Clear
          </button>
        </div>
      </form>

      {error && (
        <>
          <div className="divider" />
          <Callout tone="danger" title={error.code}>
            {error.message}
          </Callout>
        </>
      )}

      {result && (
        <>
          <div className="divider" />
          <div className="grid grid--stats">
            <StatCard label="Total cost" value={formatNumber(result.totalCost)} />
            <StatCard
              label={result.isEstimate ? 'Estimated profit' : 'Gross profit'}
              value={formatNumber(result.grossProfit)}
            />
            <StatCard
              label="Profit margin"
              value={formatPercent(result.profitMarginPercentage)}
              unavailable={result.profitMarginPercentage === null}
            />
          </div>

          <div className="divider" />
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Cost component</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {result.breakdown.map((entry) => (
                  <tr key={entry.key}>
                    <td>{entry.label}</td>
                    <td className="table__num">{formatNumber(entry.amount)}</td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {entry.provided ? 'provided' : 'not supplied (treated as 0)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.isEstimate && (
            <>
              <div className="divider" />
              <Callout tone="warning" title="This is an estimate">
                Missing inputs were treated as zero: <code>{result.missingInputs.join(', ')}</code>.
              </Callout>
            </>
          )}

          <ul className="note-list" style={{ marginTop: 12 }}>
            {result.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

/* --------------------------------------------------- suggested price tool -- */

const SUGGEST_FIELDS: { key: string; label: string }[] = [
  { key: 'desiredMarginPercentage', label: 'Desired margin % *' },
  { key: 'supplierProductCost', label: 'Supplier product cost' },
  { key: 'supplierShippingCost', label: 'Supplier shipping cost' },
  { key: 'advertisingCost', label: 'Advertising cost (CPA)' },
  { key: 'taxes', label: 'Taxes' },
  { key: 'otherCosts', label: 'Other costs' },
  { key: 'paymentFeePercentage', label: 'Payment fee %' },
  { key: 'shopifyFeePercentage', label: 'Platform fee %' },
];

function SuggestedPriceCalculator() {
  const [form, setForm] = useState<FormState>({ desiredMarginPercentage: '30', supplierProductCost: '1000', supplierShippingCost: '300', paymentFeePercentage: '3' });
  const [result, setResult] = useState<SuggestedPriceResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await apiPost<SuggestedPriceResult>(
        '/pricing/suggest-price',
        toPayload(form),
      );
      setResult(response.data);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught : new ApiError('UNKNOWN', 'Calculation failed.', 0),
      );
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Suggested price">
      <form onSubmit={submit}>
        <div className="form-grid">
          {SUGGEST_FIELDS.map((field) => (
            <div className="field" key={field.key}>
              <label className="field__label" htmlFor={`suggest-${field.key}`}>
                {field.label}
              </label>
              <input
                id={`suggest-${field.key}`}
                className="input"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="—"
                value={form[field.key] ?? ''}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, [field.key]: event.target.value }))
                }
              />
            </div>
          ))}
        </div>

        <div className="toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Calculating…' : 'Suggest price'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setForm({});
              setResult(null);
              setError(null);
            }}
          >
            Clear
          </button>
        </div>
      </form>

      {error && (
        <>
          <div className="divider" />
          <Callout tone="danger" title={error.code}>
            {error.message}
          </Callout>
        </>
      )}

      {result && (
        <>
          <div className="divider" />
          <div className="grid grid--stats">
            <StatCard
              label="Suggested selling price"
              value={formatNumber(result.suggestedPrice)}
              hint={`to achieve ${result.desiredMarginPercentage}% margin`}
            />
            <StatCard
              label="Projected profit"
              value={formatNumber(result.projection.grossProfit)}
            />
            <StatCard
              label="Projected margin"
              value={formatPercent(result.projection.profitMarginPercentage)}
              unavailable={result.projection.profitMarginPercentage === null}
            />
          </div>

          <div className="divider" />
          <div className="kv">
            <div className="kv__key">Absolute costs</div>
            <div className="kv__value">{formatNumber(result.absoluteCosts)}</div>
            <div className="kv__key">Percentage-based fees</div>
            <div className="kv__value">{formatPercent(result.percentageCosts)}</div>
          </div>

          <ul className="note-list" style={{ marginTop: 12 }}>
            {result.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
