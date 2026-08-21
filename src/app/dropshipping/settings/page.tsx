'use client';

/**
 * /dropshipping/settings - the numbers every other figure is computed with.
 *
 * These decide which orders get flagged, what a margin MEANS, and what price Research
 * recommends. They change no price in Shopify — repricing existing variants stays in
 * Automation, behind its own preview and apply steps.
 *
 * TWO KINDS OF FEEDBACK, KEPT APART
 * --------------------------------
 * Errors block the save. Risks do not: excluding supplier shipping, running with no
 * advertising allowance, or disabling the contribution floor are all VALID configurations
 * that are likely to mislead, and the operator may know something the software does not.
 * Blocking them would be presumptuous; staying silent about them is how a dashboard ends
 * up reporting margins nobody can explain. So they are shown, prominently, and the save
 * proceeds.
 */

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';

import {
  Badge,
  Callout,
  Card,
  ErrorCallout,
  KeyValue,
  PageHeader,
  SkeletonStats,
} from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { ApiError, apiPut } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type {
  DropshipSettings,
  EffectiveSettings,
  PriceRounding,
  PricingStrategy,
} from '@/lib/types';

const STRATEGIES: { value: PricingStrategy; label: string; note: string }[] = [
  {
    value: 'TARGET_MARGIN',
    label: 'Target margin',
    note: 'Solves for the price that achieves a margin AFTER fees. The only mode that accounts for percentage costs.',
  },
  {
    value: 'MARKUP_MULTIPLIER',
    label: 'Markup (cost × N)',
    note: 'The classic dropshipping markup. Blind to fees — 2.5× is not a 60% margin once payment processing and acquisition are paid for.',
  },
  {
    value: 'FIXED_UPLIFT',
    label: 'Fixed uplift (cost + N)',
    note: 'Suits a catalogue with a consistent handling cost and little price variation.',
  },
];

const ROUNDINGS: { value: PriceRounding; label: string }[] = [
  { value: 'charm99', label: 'Charm (.99)' },
  { value: 'integer', label: 'Whole units' },
  { value: 'none', label: 'Exact' },
];

/** Numeric fields are strings so a cleared box is not silently a 0. */
interface FormState {
  includeSupplierShipping: boolean;
  includePaymentFees: boolean;
  includeShopifyFees: boolean;
  includeAdvertisingAllowance: boolean;
  paymentFeePercentage: string;
  shopifyFeePercentage: string;
  advertisingAllowancePercentage: string;
  otherCommercialCostPerOrder: string;
  minimumMarginPercentage: string;
  minimumProfitAmount: string;
  processingWarningHours: string;
  trackingWarningHours: string;
  deliveryDelayDays: string;
  strategy: PricingStrategy;
  targetMarginPercentage: string;
  markupMultiplier: string;
  fixedUplift: string;
  rounding: PriceRounding;
}

function fromSettings(settings: DropshipSettings): FormState {
  return {
    includeSupplierShipping: settings.cost.includeSupplierShipping,
    includePaymentFees: settings.cost.includePaymentFees,
    includeShopifyFees: settings.cost.includeShopifyFees,
    includeAdvertisingAllowance: settings.cost.includeAdvertisingAllowance,
    paymentFeePercentage: String(settings.cost.paymentFeePercentage),
    shopifyFeePercentage: String(settings.cost.shopifyFeePercentage),
    advertisingAllowancePercentage: String(settings.cost.advertisingAllowancePercentage),
    otherCommercialCostPerOrder: String(settings.cost.otherCommercialCostPerOrder),
    minimumMarginPercentage: String(settings.cost.minimumMarginPercentage),
    minimumProfitAmount: String(settings.cost.minimumProfitAmount),
    processingWarningHours: String(settings.sla.processingWarningHours),
    trackingWarningHours: String(settings.sla.trackingWarningHours),
    deliveryDelayDays: String(settings.sla.deliveryDelayDays),
    // Pricing overrides start unset: the fees and floors above already imply a policy, and
    // pre-filling a copy of them would create a second place for the same number to live.
    strategy: 'TARGET_MARGIN',
    targetMarginPercentage: '',
    markupMultiplier: '',
    fixedUplift: '',
    rounding: 'charm99',
  };
}

/** Blank stays blank. An omitted override means "use what the cost settings imply". */
function numberOrUndefined(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

function requiredNumber(raw: string, fallback: number): number {
  const value = numberOrUndefined(raw);
  return value === undefined ? fallback : value;
}

export default function DropshippingSettingsPage() {
  const current = useApi<DropshipSettings>('/dropshipping/settings');
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState<EffectiveSettings | null>(null);
  const [changed, setChanged] = useState<string[]>([]);
  const [risks, setRisks] = useState<string[]>([]);

  // Seeded once the current settings arrive. Not on every render, or typing would be
  // overwritten by the next refetch.
  useEffect(() => {
    if (current.data !== null && form === null) setForm(fromSettings(current.data));
  }, [current.data, form]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((state) => (state === null ? state : { ...state, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form === null || current.data === null) return;

    setSaving(true);
    setError(null);

    try {
      const result = await apiPut<EffectiveSettings>('/dropshipping/settings', {
        cost: {
          includeSupplierShipping: form.includeSupplierShipping,
          includePaymentFees: form.includePaymentFees,
          includeShopifyFees: form.includeShopifyFees,
          includeAdvertisingAllowance: form.includeAdvertisingAllowance,
          paymentFeePercentage: requiredNumber(
            form.paymentFeePercentage,
            current.data.cost.paymentFeePercentage,
          ),
          shopifyFeePercentage: requiredNumber(
            form.shopifyFeePercentage,
            current.data.cost.shopifyFeePercentage,
          ),
          advertisingAllowancePercentage: requiredNumber(
            form.advertisingAllowancePercentage,
            current.data.cost.advertisingAllowancePercentage,
          ),
          otherCommercialCostPerOrder: requiredNumber(
            form.otherCommercialCostPerOrder,
            current.data.cost.otherCommercialCostPerOrder,
          ),
          minimumMarginPercentage: requiredNumber(
            form.minimumMarginPercentage,
            current.data.cost.minimumMarginPercentage,
          ),
          minimumProfitAmount: requiredNumber(
            form.minimumProfitAmount,
            current.data.cost.minimumProfitAmount,
          ),
        },
        sla: {
          processingWarningHours: requiredNumber(
            form.processingWarningHours,
            current.data.sla.processingWarningHours,
          ),
          trackingWarningHours: requiredNumber(
            form.trackingWarningHours,
            current.data.sla.trackingWarningHours,
          ),
          deliveryDelayDays: requiredNumber(
            form.deliveryDelayDays,
            current.data.sla.deliveryDelayDays,
          ),
        },
        // Only the overrides actually filled in are sent. undefined fields are stripped by
        // the API, so an empty box means "use the store default" rather than zero.
        pricing: {
          strategy: form.strategy,
          rounding: form.rounding,
          targetMarginPercentage: numberOrUndefined(form.targetMarginPercentage),
          markupMultiplier: numberOrUndefined(form.markupMultiplier),
          fixedUplift: numberOrUndefined(form.fixedUplift),
        },
      });

      setSaved(result.data);
      const meta = result.meta as { changed?: string[]; risks?: string[] } | undefined;
      setChanged(meta?.changed ?? []);
      setRisks(meta?.risks ?? []);
      current.refetch();
    } catch (caught: unknown) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError('UNKNOWN', 'Could not save the settings.', 0),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Dropshipping settings"
        description="What is folded into cost, when an order counts as late, and how prices are recommended. Nothing here changes a price in Shopify."
        actions={
          <Link href="/dropshipping" className="btn btn--sm">
            Back to dropshipping
          </Link>
        }
      />

      {current.error !== null && <ErrorCallout error={current.error} />}
      {error !== null && <ErrorCallout error={error} />}
      {current.loading && form === null && <SkeletonStats count={3} />}

      {saved !== null && (
        <Card title="Saved">
          <Callout tone="success" title="Settings updated">
            {changed.length === 0
              ? 'Nothing changed, so nothing was written.'
              : `${changed.length} setting(s) changed.`}
          </Callout>

          {changed.length > 0 && (
            <ul className="note-list">
              {changed.map((change, index) => (
                <li key={index} className="mono" style={{ fontSize: 12 }}>
                  {change}
                </li>
              ))}
            </ul>
          )}

          {/* Valid but likely to mislead. Shown, never blocking. */}
          {risks.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                These settings are valid, and worth knowing about:
              </div>
              <ul className="note-list">
                {risks.map((risk, index) => (
                  <li key={index}>
                    <Badge tone="warning">note</Badge> {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              The pricing policy these settings now produce:
            </div>
            <KeyValue
              items={[
                { key: 'Strategy', value: saved.effectivePricingPolicy.strategy },
                {
                  key: 'Target margin',
                  value: `${saved.effectivePricingPolicy.targetMarginPercentage}%`,
                },
                {
                  key: 'Minimum margin floor',
                  value: `${saved.effectivePricingPolicy.minimumMarginPercentage}%`,
                },
                {
                  key: 'Minimum contribution floor',
                  value:
                    saved.effectivePricingPolicy.minimumProfitAmount === 0 ? (
                      <span className="muted">disabled</span>
                    ) : (
                      String(saved.effectivePricingPolicy.minimumProfitAmount)
                    ),
                },
                {
                  key: 'Percentage costs priced in',
                  value: `${saved.effectivePricingPolicy.paymentFeePercentage}% payment + ${saved.effectivePricingPolicy.shopifyFeePercentage}% platform + ${saved.effectivePricingPolicy.advertisingAllowancePercentage}% advertising`,
                },
                {
                  key: 'Last changed',
                  value:
                    saved.updatedAt === null ? (
                      <span className="muted">unknown</span>
                    ) : (
                      formatDateTime(saved.updatedAt)
                    ),
                },
              ]}
            />
          </div>
        </Card>
      )}

      {form !== null && (
        <form onSubmit={submit}>
          <Card title="What counts as cost">
            <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
              Excluding a component is not the same as it being unknown: an excluded component
              contributes a <strong>known zero</strong> by policy, whereas an unknown one makes
              the whole total unknown.
            </p>

            <div className="stack" style={{ gap: 8 }}>
              <Toggle
                label="Include supplier shipping in cost"
                hint="Off means every margin shown is an upper bound."
                checked={form.includeSupplierShipping}
                onChange={(value) => set('includeSupplierShipping', value)}
              />
              <Toggle
                label="Include payment fees"
                checked={form.includePaymentFees}
                onChange={(value) => set('includePaymentFees', value)}
              />
              <Toggle
                label="Include platform fees"
                checked={form.includeShopifyFees}
                onChange={(value) => set('includeShopifyFees', value)}
              />
              <Toggle
                label="Include an advertising allowance"
                hint="Off means reported margins — and recommended prices — assume customers arrive at no acquisition cost."
                checked={form.includeAdvertisingAllowance}
                onChange={(value) => set('includeAdvertisingAllowance', value)}
              />
            </div>

            <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
              <NumberField
                label="Payment fee %"
                value={form.paymentFeePercentage}
                onChange={(value) => set('paymentFeePercentage', value)}
              />
              <NumberField
                label="Platform fee %"
                value={form.shopifyFeePercentage}
                onChange={(value) => set('shopifyFeePercentage', value)}
              />
              <NumberField
                label="Advertising allowance %"
                hint="Of revenue. An allowance, not measured spend."
                value={form.advertisingAllowancePercentage}
                onChange={(value) => set('advertisingAllowancePercentage', value)}
              />
              <NumberField
                label="Other cost per order"
                hint="Packaging, support, subscriptions"
                value={form.otherCommercialCostPerOrder}
                onChange={(value) => set('otherCommercialCostPerOrder', value)}
              />
            </div>
          </Card>

          <Card title="Profit floors">
            <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
              Both are needed, because neither covers the other. A percentage floor misses a
              thin contribution on a cheap item — 15% of 3.00 is 45p, which does not cover one
              support email. An absolute floor misses a poor percentage on an expensive one.
              Whichever binds harder wins.
            </p>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <NumberField
                label="Minimum margin %"
                hint="0 disables it — nothing will be flagged as thin"
                value={form.minimumMarginPercentage}
                onChange={(value) => set('minimumMarginPercentage', value)}
              />
              <NumberField
                label="Minimum contribution per unit"
                hint="0 disables it"
                value={form.minimumProfitAmount}
                onChange={(value) => set('minimumProfitAmount', value)}
              />
            </div>
          </Card>

          <Card title="When an order is late">
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <NumberField
                label="Processing warning (hours)"
                hint="Paid, but the supplier has not started"
                value={form.processingWarningHours}
                onChange={(value) => set('processingWarningHours', value)}
              />
              <NumberField
                label="Tracking warning (hours)"
                hint="Fulfilled, but still no tracking number"
                value={form.trackingWarningHours}
                onChange={(value) => set('trackingWarningHours', value)}
              />
              <NumberField
                label="Delivery grace (days)"
                hint="Past the carrier's OWN estimate. 0 means their promise is the deadline."
                value={form.deliveryDelayDays}
                onChange={(value) => set('deliveryDelayDays', value)}
              />
            </div>
          </Card>

          <Card title="How prices are recommended">
            <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
              Research uses these to recommend a price. Leave an override blank to use whatever
              the cost settings above imply — a blank box is not a zero.
            </p>

            <div className="stack" style={{ gap: 6 }}>
              {STRATEGIES.map((option) => (
                <label key={option.value} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <input
                    type="radio"
                    name="strategy"
                    value={option.value}
                    checked={form.strategy === option.value}
                    onChange={() => set('strategy', option.value)}
                  />
                  <span>
                    {option.label}
                    <span className="muted" style={{ display: 'block', fontSize: 11 }}>
                      {option.note}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
              <NumberField
                label="Target margin % override"
                hint="Blank = store default. Must clear the floor above."
                value={form.targetMarginPercentage}
                onChange={(value) => set('targetMarginPercentage', value)}
              />
              <NumberField
                label="Markup multiplier"
                hint="Used by the markup strategy. Must be above 1."
                value={form.markupMultiplier}
                onChange={(value) => set('markupMultiplier', value)}
              />
              <NumberField
                label="Fixed uplift"
                hint="Used by the fixed-uplift strategy"
                value={form.fixedUplift}
                onChange={(value) => set('fixedUplift', value)}
              />
              <label className="stack" style={{ gap: 3, minWidth: 180, flex: '1 1 180px' }}>
                <span style={{ fontSize: 12 }}>Rounding</span>
                <select
                  className="select"
                  value={form.rounding}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    set('rounding', event.target.value as PriceRounding)
                  }
                >
                  {ROUNDINGS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="muted" style={{ fontSize: 11 }}>
                  Charm pricing rounds DOWN, so the floors are re-checked afterwards.
                </span>
              </label>
            </div>
          </Card>

          <Card title="Save">
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <button type="submit" className="btn btn--sm" disabled={saving}>
                {saving ? 'Saving…' : 'Save settings'}
              </button>
              <span className="muted" style={{ fontSize: 12 }}>
                Saving requires a database. These settings never change a price in Shopify.
              </span>
            </div>
          </Card>
        </form>
      )}
    </>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)}
      />
      <span>
        {label}
        {hint !== undefined && (
          <span className="muted" style={{ display: 'block', fontSize: 11 }}>
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="stack" style={{ gap: 3, minWidth: 180, flex: '1 1 180px' }}>
      <span style={{ fontSize: 12 }}>{label}</span>
      <input
        className="select"
        inputMode="decimal"
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
      {hint !== undefined && (
        <span className="muted" style={{ fontSize: 11 }}>
          {hint}
        </span>
      )}
    </label>
  );
}
