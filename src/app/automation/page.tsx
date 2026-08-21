'use client';

/**
 * Automation Control Center.
 *
 * One page to see automation status, edit the rules, preview exactly what a run
 * would change (writes nothing), apply with an explicit confirmation, and review
 * run history.
 *
 * Flow is deliberate and ENFORCED: edit -> Save -> Preview -> Apply.
 *
 * THE GATE IS SERVER-SIDE. A preview returns a single-use `previewId` bound to
 * the exact action plan the operator is shown; apply must send it back. The
 * backend rebuilds the plan from current Shopify data, compares its fingerprint,
 * and refuses with PREVIEW_STALE if anything moved - so a preview showing
 * £20 -> £25 can never apply £18 -> £23.
 *
 * This page's own disabled-button logic is therefore a CONVENIENCE, not the
 * control. It exists so the operator learns why apply is unavailable without
 * having to submit and read an error. Removing it would not make an unreviewed
 * apply possible; the backend would still refuse.
 *
 * All numbers/logic come from the backend; this page only renders and posts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  Badge,
  Callout,
  Card,
  ConfirmDialog,
  ErrorCallout,
  PageHeader,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { useApi } from '@/hooks/useApi';
import { ApiError, apiPost, apiPut } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import type {
  AutomationReport,
  AutomationRules,
  AutomationRulesResponse,
  AutomationRun,
  AutomationStatus,
  CostResolution,
} from '@/lib/types';

export default function AutomationPage() {
  return (
    <>
      <PageHeader
        title="Automation"
        description="Price and visibility automation for the connected Shopify store. Preview writes nothing; applying changes the live store."
      />
      <AutomationConsole />
    </>
  );
}

/**
 * A successful preview, plus the server token that authorises applying it.
 *
 * `previewId` is the important field: it is what the backend validates. The rest
 * is kept so the page can explain the state of the gate and show a countdown to
 * expiry without another round trip.
 */
interface PreviewGate {
  report: AutomationReport;
  /** Single-use token from the backend. Null when the backend could not issue one. */
  previewId: string | null;
  /** When the token stops being valid, ISO 8601. */
  expiresAt: string | null;
  /** Fingerprint of the action plan, computed by the backend. */
  planHash: string;
  /** Guards against previewing one store and applying to another. */
  shopDomain: string;
}

function AutomationConsole() {
  const status = useApi<AutomationStatus>('/automation/status');
  const rules = useApi<AutomationRulesResponse>('/automation/rules');
  const runs = useApi<{ runs: AutomationRun[] }>('/automation/runs?limit=10');

  // Held here, not inside RunControls, because saving rules must be able to
  // invalidate it - a preview of the previous rules says nothing about the new
  // ones.
  const [gate, setGate] = useState<PreviewGate | null>(null);

  const writesEnabled = status.data?.writesEnabled ?? false;
  const storeDomain = status.data?.storeDomain ?? '';

  return (
    <div className="stack">
      <StatusCard status={status} />
      <RuleEditor
        rules={rules}
        onSaved={() => {
          // Any rule change makes an existing preview meaningless.
          setGate(null);
          rules.refetch();
        }}
        writesEnabled={writesEnabled}
      />
      <RunControls
        writesEnabled={writesEnabled}
        gate={gate}
        storeDomain={storeDomain}
        onPreviewed={setGate}
        onApplied={() => {
          // A preview describes a store state that applying has just changed,
          // so the gate must close again before another apply.
          setGate(null);
          runs.refetch();
          status.refetch();
        }}
      />
      <HistoryCard runs={runs} />
    </div>
  );
}

/* ------------------------------------------------------------- status ----- */

function StatusCard({ status }: { status: ReturnType<typeof useApi<AutomationStatus>> }) {
  const { data, loading, error } = status;
  return (
    <Card title="Status">
      {loading && data === null ? (
        <p className="muted">Loading…</p>
      ) : error !== null ? (
        <Callout tone="danger" title={error.code}>
          {error.message}
        </Callout>
      ) : data !== null ? (
        <div className="stack">
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Badge tone={data.writesEnabled ? 'warning' : 'neutral'} dot>
              {data.writesEnabled ? 'writes ENABLED' : 'writes disabled'}
            </Badge>
            <Badge tone={data.webhookTriggersEnabled ? 'info' : 'neutral'} dot>
              {data.webhookTriggersEnabled ? 'webhook triggers on' : 'webhook triggers off'}
            </Badge>
            <Badge tone="neutral">{data.storeDomain}</Badge>
          </div>
          <p className="muted">{data.note}</p>
          <CostResolutionView resolution={data.costResolution} />
          <p className="muted">Price and visibility writes need {data.writeScopeRequired}.</p>
          {data.ruleProblems.length > 0 && (
            <Callout tone="warning" title="Rule problems">
              <ul className="note-list">
                {data.ruleProblems.map((problem, index) => (
                  <li key={index}>{problem}</li>
                ))}
              </ul>
            </Callout>
          )}
        </div>
      ) : null}
    </Card>
  );
}

/**
 * The cost hierarchy, in the order it is actually applied.
 *
 * Rendered as an ordered list rather than a sentence because the ORDER is the
 * substance: which tier wins decides the price. The UNKNOWN tier is shown too -
 * "this product has no usable cost and was skipped" is information the operator
 * needs, and hiding it invites the assumption that a missing cost means zero.
 */
function CostResolutionView({ resolution }: { resolution: CostResolution }) {
  return (
    <div className="stack">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="muted">Cost resolution order:</span>
        {resolution.order.map((source, index) => (
          <span key={source} className="row" style={{ gap: 8, alignItems: 'center' }}>
            {index > 0 && <span className="muted" aria-hidden="true">→</span>}
            <Badge tone={source === 'UNKNOWN' ? 'neutral' : 'info'}>{source}</Badge>
          </span>
        ))}
      </div>
      <ul className="note-list">
        {resolution.tiers.map((tier) => (
          <li key={tier.source}>
            <span className="mono">{tier.source}</span>
            {!tier.available && <span className="muted"> (unavailable)</span>}
            {tier.requiresScope !== null && (
              <span className="muted"> [needs {tier.requiresScope}]</span>
            )}
            <span className="muted"> — {tier.description}</span>
          </li>
        ))}
      </ul>
      <p className="muted">
        Manual costs {resolution.manualCostSupported ? 'are' : 'are not'} supported. Unknown-cost
        policy: <span className="mono">{resolution.unknownCostPolicy}</span> — a product with no
        usable cost is skipped, never priced as if the cost were zero.
      </p>
      {resolution.suppliers.map((supplier) => (
        <p key={supplier.providerName} className="muted">
          <span className="mono">{supplier.providerName}</span>: direct supplier cost API{' '}
          <strong>{supplier.supplierCostApi ? 'available' : 'unavailable'}</strong>; Shopify
          integration <strong>{supplier.shopifyIntegration ? 'used' : 'not used'}</strong>; manual
          fallback available.
          {supplier.limitation !== null && <> {supplier.limitation}</>}
        </p>
      ))}
    </div>
  );
}

/* --------------------------------------------------------- rule editor ---- */

/** Comma-separated string <-> string[] for the tag/vendor inputs. */
function toCsv(values: string[]): string {
  return values.join(', ');
}
function fromCsv(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function RuleEditor({
  rules,
  onSaved,
  writesEnabled,
}: {
  rules: ReturnType<typeof useApi<AutomationRulesResponse>>;
  onSaved: () => void;
  writesEnabled: boolean;
}) {
  const effective = rules.data?.effective ?? null;
  // Local draft mirrors the effective rules once loaded.
  const [draft, setDraft] = useState<AutomationRules | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);

  // Initialise the draft the first time rules arrive.
  const current = useMemo(() => draft ?? effective, [draft, effective]);

  const patchPrice = useCallback(
    (patch: Partial<AutomationRules['price']>) => {
      if (current === null) return;
      setDraft({ ...current, price: { ...current.price, ...patch } });
      setSaved(false);
    },
    [current],
  );
  const patchSelection = useCallback(
    (patch: Partial<AutomationRules['selection']>) => {
      if (current === null) return;
      setDraft({ ...current, selection: { ...current.selection, ...patch } });
      setSaved(false);
    },
    [current],
  );
  const patchVisibility = useCallback(
    (patch: Partial<AutomationRules['visibility']>) => {
      if (current === null) return;
      setDraft({ ...current, visibility: { ...current.visibility, ...patch } });
      setSaved(false);
    },
    [current],
  );
  /** Top-level rule fields (exemptTags, maxItemsPerRun). */
  const patchRoot = useCallback(
    (patch: Partial<Pick<AutomationRules, 'exemptTags' | 'maxItemsPerRun'>>) => {
      if (current === null) return;
      setDraft({ ...current, ...patch });
      setSaved(false);
    },
    [current],
  );

  const save = async () => {
    if (current === null) return;
    setBusy(true);
    setError(null);
    try {
      await apiPut<AutomationRulesResponse>('/automation/rules', { rules: current });
      setSaved(true);
      onSaved();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError('UNKNOWN', 'Save failed.', 0));
    } finally {
      setBusy(false);
    }
  };

  if (rules.loading && effective === null) {
    return (
      <Card title="Rules">
        <p className="muted">Loading…</p>
      </Card>
    );
  }
  if (current === null) {
    return (
      <Card title="Rules">
        <Callout tone="danger" title="Could not load rules">
          {rules.error?.message ?? 'Unknown error.'}
        </Callout>
      </Card>
    );
  }

  return (
    <Card
      title="Rules"
      actions={
        <button className="btn btn--primary btn--sm" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save rules'}
        </button>
      }
    >
      <div className="stack">
        {!writesEnabled && (
          <Callout tone="info" title="Writes are disabled">
            You can edit, save, and preview rules now. Applying changes to the store needs
            <span className="mono"> AUTOMATION_ENABLED=true</span> on the backend.
          </Callout>
        )}
        {saved && (
          <Callout tone="info" title="Saved">
            Webhook-triggered runs and the buttons below now use these rules.
          </Callout>
        )}
        {error !== null && (
          <Callout tone="danger" title={error.code}>
            {error.message}
            {Array.isArray((error.details as { problems?: string[] })?.problems) && (
              <ul className="note-list">
                {((error.details as { problems: string[] }).problems).map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
          </Callout>
        )}

        <h3 className="muted">Pricing</h3>
        <div className="form-grid">
          <Toggle
            label="Price automation enabled"
            checked={current.price.enabled}
            onChange={(v) => patchPrice({ enabled: v })}
          />
          <SelectField
            label="Pricing mode"
            value={current.price.pricingMode}
            options={['margin', 'multiplier', 'fixed_uplift']}
            onChange={(v) => patchPrice({ pricingMode: v as AutomationRules['price']['pricingMode'] })}
            hint="margin = solve for target margin; multiplier = cost × N; fixed_uplift = cost + N"
          />
          <NumberField
            label="Target margin %"
            value={current.price.targetMarginPercentage}
            onChange={(v) => patchPrice({ targetMarginPercentage: v })}
          />
          <NumberField
            label="Minimum margin % (floor)"
            value={current.price.minMarginPercentage}
            onChange={(v) => patchPrice({ minMarginPercentage: v })}
            hint="A price never goes below this margin, even after rounding/clamping."
          />
          <NumberField
            label="Multiplier (×cost)"
            value={current.price.multiplier}
            onChange={(v) => patchPrice({ multiplier: v })}
          />
          <NumberField
            label="Fixed uplift (+cost)"
            value={current.price.fixedUplift}
            onChange={(v) => patchPrice({ fixedUplift: v })}
          />
          <SelectField
            label="Rounding"
            value={current.price.rounding}
            options={['none', 'charm99', 'integer']}
            onChange={(v) => patchPrice({ rounding: v as AutomationRules['price']['rounding'] })}
          />
          <NumberField
            label="Max increase % per run"
            value={current.price.maxIncreasePercentage}
            onChange={(v) => patchPrice({ maxIncreasePercentage: v })}
          />
          <NumberField
            label="Max decrease % per run"
            value={current.price.maxDecreasePercentage}
            onChange={(v) => patchPrice({ maxDecreasePercentage: v })}
          />
          <NumberField
            label="Minimum change amount"
            value={current.price.minChangeAmount}
            onChange={(v) => patchPrice({ minChangeAmount: v })}
            hint="Skip changes smaller than this, so a rounding difference of a penny does not rewrite the catalogue."
          />
          <Toggle
            label="Require a known cost"
            checked={current.price.requireKnownCost}
            onChange={(v) => patchPrice({ requireKnownCost: v })}
          />
        </div>

        <h3 className="muted">Costs and fees</h3>
        <p className="muted">
          Subtracted from revenue before the margin is computed, so the target margin is a real
          margin rather than a gross markup. Percentages apply to the selling price; the two cost
          fields are flat amounts per unit.
        </p>
        <div className="form-grid">
          <NumberField
            label="Payment fee %"
            value={current.price.paymentFeePercentage}
            onChange={(v) => patchPrice({ paymentFeePercentage: v })}
            hint="Card processing, e.g. 2.9."
          />
          <NumberField
            label="Shopify fee %"
            value={current.price.shopifyFeePercentage}
            onChange={(v) => patchPrice({ shopifyFeePercentage: v })}
          />
          <NumberField
            label="Advertising cost per unit"
            value={current.price.advertisingCost}
            onChange={(v) => patchPrice({ advertisingCost: v })}
          />
          <NumberField
            label="Other costs per unit"
            value={current.price.otherCosts}
            onChange={(v) => patchPrice({ otherCosts: v })}
          />
        </div>

        <h3 className="muted">Which products</h3>
        <div className="form-grid">
          <SelectField
            label="Selection mode"
            value={current.selection.mode}
            options={['all', 'tagged', 'vendor']}
            onChange={(v) => patchSelection({ mode: v as AutomationRules['selection']['mode'] })}
            hint="Products outside the selection are never touched."
          />
          <TextField
            label="Include vendors (comma-separated)"
            value={toCsv(current.selection.includeVendors)}
            onChange={(v) => patchSelection({ includeVendors: fromCsv(v) })}
          />
          <TextField
            label="Include tags (comma-separated)"
            value={toCsv(current.selection.includeTags)}
            onChange={(v) => patchSelection({ includeTags: fromCsv(v) })}
          />
          <SelectField
            label="New imported products"
            value={current.selection.newProductPolicy}
            options={['leave', 'draft', 'activate']}
            onChange={(v) =>
              patchSelection({ newProductPolicy: v as AutomationRules['selection']['newProductPolicy'] })
            }
            hint="draft = hold for review (recommended)."
          />
        </div>

        <h3 className="muted">Visibility</h3>
        <div className="form-grid">
          <Toggle
            label="Visibility automation enabled"
            checked={current.visibility.enabled}
            onChange={(v) => patchVisibility({ enabled: v })}
          />
          <Toggle
            label="Hide out of stock"
            checked={current.visibility.hideOutOfStock}
            onChange={(v) => patchVisibility({ hideOutOfStock: v })}
          />
          <Toggle
            label="Restore when back in stock"
            checked={current.visibility.restoreWhenBackInStock}
            onChange={(v) => patchVisibility({ restoreWhenBackInStock: v })}
          />
          <Toggle
            label="Hide below minimum margin"
            checked={current.visibility.hideBelowMinMargin}
            onChange={(v) => patchVisibility({ hideBelowMinMargin: v })}
          />
          <Toggle
            label="Hide products with unknown cost"
            checked={current.visibility.hideUnknownCost}
            onChange={(v) => patchVisibility({ hideUnknownCost: v })}
          />
        </div>

        <h3 className="muted">Safety limits</h3>
        <div className="form-grid">
          <TextField
            label="Exempt tags (comma-separated)"
            value={toCsv(current.exemptTags)}
            onChange={(v) => patchRoot({ exemptTags: fromCsv(v) })}
            hint="Products carrying any of these tags are never touched, whatever the selection says. Use this to protect hand-priced products."
          />
          <NumberField
            label="Max items per run"
            value={current.maxItemsPerRun}
            onChange={(v) => patchRoot({ maxItemsPerRun: v })}
            hint="Hard ceiling on changes in a single run. Start low on a live store: a wrong rule then affects a handful of products instead of the whole catalogue."
          />
        </div>
      </div>
    </Card>
  );
}

/* --------------------------------------------------- preview / apply ------ */

function RunControls({
  writesEnabled,
  gate,
  storeDomain,
  onPreviewed,
  onApplied,
}: {
  writesEnabled: boolean;
  gate: PreviewGate | null;
  storeDomain: string;
  onPreviewed: (gate: PreviewGate | null) => void;
  onApplied: () => void;
}) {
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Ticks only while a preview is open, so the expiry countdown stays honest.
  // A preview that silently lapsed while the operator read it would otherwise
  // present as a confusing PREVIEW_EXPIRED on apply.
  useEffect(() => {
    if (gate?.expiresAt === null || gate === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [gate]);

  const secondsLeft =
    gate?.expiresAt == null
      ? null
      : Math.max(0, Math.round((new Date(gate.expiresAt).getTime() - now) / 1000));

  /**
   * Why Apply is unavailable, or null when it is available.
   *
   * A sentence rather than a boolean so the button can explain itself - a
   * disabled control with no reason is its own support ticket. Note this mirrors
   * the backend's checks for the operator's benefit; it does not replace them.
   */
  const blockedReason = ((): string | null => {
    if (!writesEnabled) {
      return 'Writes are disabled on the backend (AUTOMATION_ENABLED is not true).';
    }
    if (gate === null) {
      return 'Run a preview first. Apply stays disabled until a preview succeeds.';
    }
    if (gate.previewId === null) {
      return 'This preview could not be recorded by the backend, so it cannot be applied. Check the database connection and preview again.';
    }
    if (secondsLeft !== null && secondsLeft <= 0) {
      return 'This preview has expired. Preview again to see the current plan.';
    }
    if (storeDomain !== '' && gate.shopDomain !== storeDomain) {
      return `The preview ran against ${gate.shopDomain}, but the backend is now connected to ${storeDomain}. Preview again.`;
    }
    if (gate.report.summary.priceChanges + gate.report.summary.visibilityChanges === 0) {
      return 'The preview found nothing to change, so there is nothing to apply.';
    }
    return null;
  })();

  const canApply = blockedReason === null && busy === null;

  const preview = async () => {
    setBusy('preview');
    setError(null);
    try {
      const response = await apiPost<AutomationReport>('/automation/preview', {});
      onPreviewed({
        report: response.data,
        previewId: response.data.preview?.previewId ?? null,
        expiresAt: response.data.preview?.expiresAt ?? null,
        planHash: response.data.planHash,
        shopDomain: response.data.shopDomain,
      });
      setNow(Date.now());
    } catch (caught) {
      // A failed preview must not leave a previous successful one in place.
      onPreviewed(null);
      setError(
        caught instanceof ApiError ? caught : new ApiError('UNKNOWN', 'Preview failed.', 0),
      );
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    if (gate?.previewId == null) return;
    setBusy('apply');
    setError(null);
    try {
      // previewId is what makes this apply legal. The backend re-derives the plan
      // and refuses if it no longer matches what this preview described.
      await apiPost<AutomationReport>(
        '/automation/apply',
        { previewId: gate.previewId },
        // A stable key for this one apply, so a retry after a dropped response
        // returns the original outcome instead of attempting the work twice.
        { idempotencyKey: `apply-${gate.previewId}` },
      );
      onPreviewed(null);
      onApplied();
    } catch (caught) {
      const apiError =
        caught instanceof ApiError ? caught : new ApiError('UNKNOWN', 'Apply failed.', 0);
      // A stale/expired/consumed preview is spent either way - clear the gate so
      // the only available action is to preview again.
      if (apiError.isStaleStateProblem) onPreviewed(null);
      setError(apiError);
    } finally {
      setBusy(null);
      setConfirmOpen(false);
    }
  };

  const report = gate?.report ?? null;
  const summary = report?.summary ?? null;

  return (
    <Card
      title="Preview & apply"
      actions={
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn--sm" onClick={preview} disabled={busy !== null}>
            {busy === 'preview' ? 'Previewing…' : 'Preview'}
          </button>
          <button
            className="btn btn--primary btn--sm"
            onClick={() => setConfirmOpen(true)}
            disabled={!canApply}
            title={blockedReason ?? undefined}
          >
            Apply…
          </button>
        </div>
      }
    >
      <div className="stack">
        {error !== null && (
          <ErrorCallout error={error} onRetry={preview} onRefresh={preview} />
        )}
        {blockedReason !== null && error === null && (
          <Callout tone={writesEnabled ? 'warning' : 'info'} title="Apply is disabled">
            {blockedReason}
          </Callout>
        )}

        {gate !== null && gate.previewId !== null && secondsLeft !== null && (
          <Callout
            tone={secondsLeft <= 60 ? 'warning' : 'info'}
            title={
              secondsLeft <= 0
                ? 'This preview has expired'
                : `Preview valid for another ${formatCountdown(secondsLeft)}`
            }
          >
            Applying will execute <strong>exactly</strong> the changes listed below, and nothing
            else. If product or cost data changes in Shopify before you apply, the backend refuses
            the apply rather than writing different values.
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              plan <span className="mono">{gate.planHash.slice(0, 12)}</span> · preview{' '}
              <span className="mono">{gate.previewId.slice(0, 8)}</span> · single use
            </div>
          </Callout>
        )}

        {report === null ? (
          <p className="muted">
            Preview reports exactly what would change and writes nothing. Read it before applying.
          </p>
        ) : (
          <ReportView report={report} />
        )}
      </div>

      {confirmOpen && report !== null && summary !== null && (
        <ConfirmDialog
          title="Apply automation to the live store?"
          intent={`Apply ${formatNumber(summary.priceChanges)} price change(s) and ${formatNumber(
            summary.visibilityChanges,
          )} visibility change(s) to ${report.shopDomain}.`}
          changes={[
            { label: 'Price changes', to: formatNumber(summary.priceChanges) },
            { label: 'Visibility changes', to: formatNumber(summary.visibilityChanges) },
            { label: 'Skipped (no action)', to: formatNumber(summary.skipped) },
            {
              label: 'Plan fingerprint',
              to: gate?.planHash.slice(0, 12) ?? '—',
            },
          ]}
          consequence={
            'Customers see the result immediately. Every applied action is recorded in audit history with its previous value, but there is no one-click rollback - undoing means editing the affected products. The backend will refuse this apply if the plan no longer matches the preview above.'
          }
          confirmLabel="Yes, apply now"
          tone="warning"
          busy={busy === 'apply'}
          onConfirm={apply}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </Card>
  );
}

/** mm:ss for short durations, so a countdown reads naturally. */
function formatCountdown(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${String(rest).padStart(2, '0')}s`;
}

function ReportView({ report }: { report: AutomationReport }) {
  const columns: Column<AutomationReport['plan']['actions'][number]>[] = [
    { key: 'type', header: 'Type', render: (row) => <Badge tone={row.type === 'price' ? 'info' : 'warning'}>{row.type}</Badge> },
    { key: 'title', header: 'Product', render: (row) => <span className="truncate">{row.title}{row.variantTitle ? ` — ${row.variantTitle}` : ''}</span> },
    { key: 'from', header: 'From', align: 'right', render: (row) => <span className="mono">{String(row.from)}</span> },
    { key: 'to', header: 'To', align: 'right', render: (row) => <span className="mono table__strong">{String(row.to)}</span> },
    {
      key: 'why',
      header: 'Why',
      render: (row) => <span className="muted truncate">{row.reasons.join(' ')}</span>,
    },
  ];

  const s = report.summary;
  return (
    <div className="stack">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Badge tone={report.dryRun ? 'info' : 'success'} dot>
          {report.dryRun ? 'preview (no changes made)' : 'applied'}
        </Badge>
        <Badge tone="neutral">{formatNumber(s.priceChanges)} price</Badge>
        <Badge tone="neutral">{formatNumber(s.visibilityChanges)} visibility</Badge>
        <Badge tone="neutral">{formatNumber(s.skipped)} skipped</Badge>
        {typeof s.applied === 'number' && <Badge tone="success">{formatNumber(s.applied)} applied</Badge>}
        {typeof s.failed === 'number' && s.failed > 0 && <Badge tone="danger">{formatNumber(s.failed)} failed</Badge>}
        {s.truncated && <Badge tone="warning">truncated (max per run hit)</Badge>}
      </div>
      {report.notes.map((note, index) => (
        <p key={index} className="muted">{note}</p>
      ))}
      <DataTable
        columns={columns}
        rows={report.plan.actions}
        getRowKey={(row) =>
          `${row.type}-${row.shopifyProductId}-${row.shopifyVariantId ?? ''}-${row.from}-${row.to}`
        }
        emptyTitle="No changes"
        emptyDescription="Nothing matched the rules this run."
      />
    </div>
  );
}

/* -------------------------------------------------------------- history --- */

function HistoryCard({ runs }: { runs: ReturnType<typeof useApi<{ runs: AutomationRun[] }>> }) {
  const columns: Column<AutomationRun>[] = [
    { key: 'startedAt', header: 'When', render: (row) => formatDateTime(row.startedAt) },
    { key: 'trigger', header: 'Trigger', render: (row) => <Badge tone="neutral">{row.trigger}</Badge> },
    { key: 'mode', header: 'Mode', render: (row) => <Badge tone={row.dryRun ? 'info' : 'success'}>{row.dryRun ? 'preview' : 'live'}</Badge> },
    { key: 'applied', header: 'Applied', align: 'right', render: (row) => formatNumber(row.summary?.applied ?? 0) },
    { key: 'failed', header: 'Failed', align: 'right', render: (row) => formatNumber(row.summary?.failed ?? 0) },
    { key: 'skipped', header: 'Skipped', align: 'right', render: (row) => formatNumber(row.summary?.skipped ?? 0) },
  ];
  return (
    <Card title="Run history">
      <DataTable
        columns={columns}
        rows={runs.data?.runs ?? null}
        loading={runs.loading}
        error={runs.error}
        onRetry={runs.refetch}
        getRowKey={(row) => row._id ?? row.startedAt}
        emptyTitle="No runs yet"
        emptyDescription="Runs appear here once you preview or apply (requires a database)."
      />
    </Card>
  );
}

/* --------------------------------------------------------- form fields ---- */

function NumberField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
}) {
  return (
    <div className="field">
      <label className="field__label">{label}</label>
      <input
        className="input"
        type="number"
        step="0.01"
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
      {hint && <div className="field__hint">{hint}</div>}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <div className="field">
      <label className="field__label">{label}</label>
      <input className="input" value={value} onChange={(event) => onChange(event.target.value)} />
      {hint && <div className="field__hint">{hint}</div>}
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <div className="field">
      <label className="field__label">{label}</label>
      <select className="select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {hint && <div className="field__hint">{hint}</div>}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="field">
      <label className="field__label">{label}</label>
      <label className="row" style={{ gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span className="muted">{checked ? 'on' : 'off'}</span>
      </label>
    </div>
  );
}
