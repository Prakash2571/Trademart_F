'use client';

/**
 * /suppliers/deodap - the DeoDap overview.
 *
 * DeoDap works the way Tradelle does: its own Shopify app brings products into Shopify
 * and picks up their orders, and Trademart works on the same Shopify store. Nothing
 * here talks to DeoDap.
 *
 * What lives here: how orders reach DeoDap (the app, or the operator), the DeoDap
 * account (stored encrypted, never shown again, unused until DeoDap offers an API),
 * the settings DeoDap CSV imports price with, and the way into the other pages.
 */

import Link from 'next/link';
import { useState, type ChangeEvent, type FormEvent } from 'react';

import { DeodapApiNote, DeodapNav } from '@/components/DeodapUi';
import {
  Badge,
  Callout,
  Card,
  ConfirmDialog,
  ErrorCallout,
  ErrorState,
  KeyValue,
  PageHeader,
  StatCard,
} from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { ApiError, apiDelete, apiPut } from '@/lib/api';
import { ORDER_FLOWS, orderFlowLabel, parsePrefixInput } from '@/lib/deodap';
import { formatDateTime, formatNumber, parseNumericInput } from '@/lib/format';
import type {
  DeodapCredentialKind,
  DeodapCredentialStatus,
  DeodapOrderFlow,
  DeodapPriceRounding,
  DeodapPricingMode,
  DeodapSettings,
  DeodapStatus,
} from '@/lib/types';

function toApiError(caught: unknown, fallback: string): ApiError {
  return caught instanceof ApiError ? caught : new ApiError('UNKNOWN', fallback, 0);
}

export default function DeodapPage() {
  const status = useApi<DeodapStatus>('/suppliers/deodap/status');

  return (
    <>
      <PageHeader
        title="DeoDap"
        description="Work with DeoDap through Shopify, the way Trademart works with Tradelle: recognise DeoDap products, manage them, and watch their orders."
      />
      <DeodapNav />
      {status.error !== null ? (
        <Card title="DeoDap">
          <ErrorState error={status.error} onRetry={status.refetch} />
        </Card>
      ) : status.data === null ? (
        <Card title="DeoDap">
          <p className="muted">Loading…</p>
        </Card>
      ) : (
        <Overview status={status.data} onChanged={status.refetch} />
      )}
    </>
  );
}

function Overview({ status, onChanged }: { status: DeodapStatus; onChanged: () => void }) {
  return (
    <div className="stack">
      <DeodapApiNote api={status.api} />

      {!status.databaseConnected && (
        <Callout tone="danger" title="No database connection">
          DeoDap settings, imports and order records are kept in MongoDB, which the backend
          cannot reach right now. Nothing can be saved until it can.
        </Callout>
      )}

      <div className="grid grid--stats">
        <StatCard
          label="Orders reach DeoDap"
          value={status.settings.orderFlow === 'SHOPIFY_APP' ? "Via DeoDap's app" : 'By hand'}
          hint={
            status.settings.orderFlow === 'SHOPIFY_APP'
              ? 'Like Tradelle - change it in Settings below'
              : 'You place them - change it in Settings below'
          }
          compact
        />
        <StatCard
          label="Imported by Trademart"
          value={formatNumber(status.counts?.importedProducts ?? null)}
          unavailable={status.counts === null}
          hint="Created in Shopify from a DeoDap CSV"
        />
        <StatCard
          label="Orders recorded"
          value={formatNumber(status.counts?.recordedOrders ?? null)}
          unavailable={status.counts === null}
          hint="With a DeoDap status or order number"
        />
        <StatCard
          label="DeoDap account"
          value={status.credentials.stored ? 'Saved' : 'Not saved'}
          hint={status.credentials.maskedIdentifier ?? 'Optional until DeoDap offers an API'}
          compact
        />
        <StatCard
          label="SKU prefixes"
          value={status.activeSkuPrefixes.length > 0 ? status.activeSkuPrefixes.join(', ') : 'None'}
          hint="Extra way to recognise DeoDap products"
          compact
        />
      </div>

      <div className="grid grid--two">
        <NextSteps flow={status.settings.orderFlow} />
        <AccountCard status={status} onChanged={onChanged} />
      </div>

      <SettingsCard
        settings={status.settings}
        updatedAt={status.settingsUpdatedAt}
        disabled={!status.databaseConnected}
        onSaved={onChanged}
      />
    </div>
  );
}

const STEP_LIST = { fontSize: 13.5, color: 'var(--text)' } as const;

function NextSteps({ flow }: { flow: DeodapOrderFlow }) {
  if (flow === 'SHOPIFY_APP') {
    return (
      <Card title="How it works - with DeoDap's Shopify app">
        <p className="muted" style={{ marginTop: 0 }}>
          The same way Trademart works with Tradelle: DeoDap&apos;s app and Trademart both work
          on your Shopify store, and never talk to each other directly.
        </p>
        <ol className="note-list" style={STEP_LIST}>
          <li>
            <strong>Import through DeoDap&apos;s app.</strong> Install DeoDap&apos;s app from the
            Shopify App Store and add products with it. Only products it imports are sent to
            DeoDap automatically.
          </li>
          <li>
            <strong>Check they are recognised.</strong> On{' '}
            <Link href="/products">Products</Link> they should show as DEODAP. If they
            don&apos;t, add their SKU prefix below, or tag them <span className="mono">DeoDap</span>{' '}
            in Shopify.
          </li>
          <li>
            <strong>Manage them here.</strong> Prices, publishing, the{' '}
            <Link href="/products/review">review queue</Link> and automation work on them like any
            other product. If DeoDap&apos;s app also updates prices, leave pricing to one side
            so the two don&apos;t overwrite each other.
          </li>
          <li>
            <strong>Watch the orders.</strong> DeoDap&apos;s app picks up the orders.{' '}
            <Link href="/suppliers/deodap/orders">DeoDap orders</Link> shows each one&apos;s
            progress and tracking from Shopify, and flags any that have not shipped in time.
          </li>
        </ol>
      </Card>
    );
  }

  return (
    <Card title="How it works - placing orders yourself">
      <ol className="note-list" style={STEP_LIST}>
        <li>
          <strong>Import products.</strong> Download a product list from DeoDap as a CSV and{' '}
          <Link href="/suppliers/deodap/import">import it</Link>. You check the prices first;
          products are created as <strong>drafts</strong> with DeoDap&apos;s cost recorded.
        </li>
        <li>
          <strong>Review and publish.</strong> Imported drafts wait in the{' '}
          <Link href="/products/review">review queue</Link> until you publish them.
        </li>
        <li>
          <strong>Keep costs current.</strong> When DeoDap changes prices,{' '}
          <Link href="/suppliers/deodap/sync">upload the new list</Link> to update the recorded
          costs, so margins stay right.
        </li>
        <li>
          <strong>Place orders.</strong> <Link href="/suppliers/deodap/orders">DeoDap orders</Link>{' '}
          lists what customers bought from DeoDap. Place each order with DeoDap, then record
          DeoDap&apos;s order number and tracking there.
        </li>
      </ol>
    </Card>
  );
}

const KIND_LABELS: Record<DeodapCredentialKind, string> = {
  API_KEY: 'API key',
  ACCOUNT_LOGIN: 'DeoDap login',
};

function AccountCard({ status, onChanged }: { status: DeodapStatus; onChanged: () => void }) {
  const credentials = status.credentials;
  const [editing, setEditing] = useState(!credentials.stored);
  const [kind, setKind] = useState<DeodapCredentialKind>(credentials.kind ?? 'API_KEY');
  const [apiKey, setApiKey] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [accountLabel, setAccountLabel] = useState(credentials.accountLabel ?? '');
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const canSave =
    status.encryptionConfigured &&
    status.databaseConnected &&
    (kind === 'API_KEY'
      ? apiKey.trim().length >= 8
      : username.trim().length >= 3 && password.length >= 6);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSave || busy !== null) return;
    setBusy('save');
    setError(null);
    setSaved(false);
    const label = accountLabel.trim().length > 0 ? accountLabel.trim() : null;
    try {
      await apiPut<DeodapCredentialStatus>(
        '/suppliers/deodap/credentials',
        kind === 'API_KEY'
          ? { kind, apiKey: apiKey.trim(), accountLabel: label }
          : { kind, username: username.trim(), password, accountLabel: label },
      );
      // Cleared straight away: once stored, the secret has no reason to stay in the page.
      setApiKey('');
      setPassword('');
      setSaved(true);
      setEditing(false);
      onChanged();
    } catch (caught) {
      setError(toApiError(caught, 'Saving the DeoDap account failed.'));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('remove');
    setError(null);
    try {
      await apiDelete<{ removed: boolean }>('/suppliers/deodap/credentials');
      setConfirmingRemove(false);
      setSaved(false);
      setEditing(true);
      onChanged();
    } catch (caught) {
      setError(toApiError(caught, 'Removing the DeoDap account failed.'));
    } finally {
      setBusy(null);
    }
  };

  const badge = !credentials.stored ? (
    <Badge tone="neutral">not saved</Badge>
  ) : credentials.readable === false ? (
    <Badge tone="danger">cannot be decrypted</Badge>
  ) : (
    <Badge tone="info" title="Stored encrypted. Not verified with DeoDap: there is no DeoDap API to verify against.">
      saved, not verified
    </Badge>
  );

  return (
    <Card title="DeoDap account" actions={badge}>
      <div className="stack" style={{ gap: 12 }}>
        <p className="muted" style={{ margin: 0 }}>
          Optional. Stored encrypted and never shown again. Nothing uses it yet, because
          DeoDap has no API Trademart can call; it is kept so an integration can use it once
          DeoDap provides one. If DeoDap gives you an API key, prefer it to your password.
        </p>

        {!status.encryptionConfigured && (
          <Callout tone="warning" title="Encryption key not set">
            The backend has no TOKEN_ENCRYPTION_KEY, so an account cannot be saved - it is never
            stored readable. Generate one with <span className="mono">openssl rand -base64 32</span>,
            set it on the backend and restart it.
          </Callout>
        )}
        {credentials.readable === false && (
          <Callout tone="danger" title="The saved account cannot be read">
            TOKEN_ENCRYPTION_KEY has changed since it was saved. Save the account again.
          </Callout>
        )}

        {credentials.stored && (
          <KeyValue
            items={[
              { key: 'Type', value: credentials.kind === null ? '—' : KIND_LABELS[credentials.kind] },
              { key: 'Label', value: credentials.accountLabel ?? '—' },
              {
                key: 'Identifier',
                value: <span className="mono">{credentials.maskedIdentifier ?? '—'}</span>,
              },
              { key: 'Saved', value: formatDateTime(credentials.updatedAt) },
            ]}
          />
        )}

        {error !== null && <ErrorCallout error={error} />}
        {saved && (
          <Callout tone="success" title="Saved">
            The DeoDap account is stored encrypted.
          </Callout>
        )}

        {editing ? (
          <form className="stack" style={{ gap: 12 }} onSubmit={(event) => void save(event)}>
            <div className="field">
              <label className="field__label" htmlFor="deodap-kind">
                How you sign in to DeoDap
              </label>
              <select
                id="deodap-kind"
                className="select"
                value={kind}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setKind(event.target.value as DeodapCredentialKind)
                }
              >
                <option value="API_KEY">API key from DeoDap</option>
                <option value="ACCOUNT_LOGIN">Email or mobile number and password</option>
              </select>
            </div>

            {kind === 'API_KEY' ? (
              <div className="field">
                <label className="field__label" htmlFor="deodap-api-key">
                  API key
                </label>
                <input
                  id="deodap-api-key"
                  className="input"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </div>
            ) : (
              <div className="form-grid">
                <div className="field">
                  <label className="field__label" htmlFor="deodap-username">
                    Email or mobile number
                  </label>
                  <input
                    id="deodap-username"
                    className="input"
                    autoComplete="off"
                    spellCheck={false}
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="deodap-password">
                    Password
                  </label>
                  <input
                    id="deodap-password"
                    className="input"
                    type="password"
                    autoComplete="off"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="field">
              <label className="field__label" htmlFor="deodap-label">
                Label (optional)
              </label>
              <input
                id="deodap-label"
                className="input"
                maxLength={100}
                value={accountLabel}
                onChange={(event) => setAccountLabel(event.target.value)}
                placeholder="e.g. your DeoDap reseller ID"
              />
              <div className="field__hint">Not secret - shown so you know which account is saved.</div>
            </div>

            <div className="row" style={{ gap: 8 }}>
              <button type="submit" className="btn btn--primary" disabled={!canSave || busy !== null}>
                {busy === 'save' ? 'Saving…' : 'Save encrypted'}
              </button>
              {credentials.stored && (
                <button type="button" className="btn" onClick={() => setEditing(false)} disabled={busy !== null}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn--sm" onClick={() => setEditing(true)}>
              Replace
            </button>
            <button type="button" className="btn btn--sm" onClick={() => setConfirmingRemove(true)}>
              Remove
            </button>
          </div>
        )}

        {confirmingRemove && (
          <ConfirmDialog
            title="Remove the DeoDap account?"
            intent="Trademart will forget the stored DeoDap account."
            changes={[
              { label: 'DeoDap account', from: credentials.maskedIdentifier ?? 'saved', to: 'removed' },
            ]}
            consequence="Only the stored account is removed. Imported products, recorded costs and order records stay as they are."
            confirmLabel="Remove account"
            tone="danger"
            busy={busy === 'remove'}
            onConfirm={() => void remove()}
            onCancel={() => setConfirmingRemove(false)}
          />
        )}
      </div>
    </Card>
  );
}

function SettingsCard({
  settings,
  updatedAt,
  disabled,
  onSaved,
}: {
  settings: DeodapSettings;
  updatedAt: string | null;
  disabled: boolean;
  onSaved: () => void;
}) {
  const [orderFlow, setOrderFlow] = useState<DeodapOrderFlow>(settings.orderFlow);
  const [prefixes, setPrefixes] = useState(settings.skuPrefixes.join(', '));
  const [currency, setCurrency] = useState(settings.currencyCode);
  const [vendor, setVendor] = useState(settings.vendorName);
  const [mode, setMode] = useState<DeodapPricingMode>(settings.pricingMode);
  const [markup, setMarkup] = useState(String(settings.markupPercent));
  const [rounding, setRounding] = useState<DeodapPriceRounding>(settings.priceRounding);
  const [includeShipping, setIncludeShipping] = useState(settings.includeShippingInPrice);
  const [compareAt, setCompareAt] = useState(settings.compareAtFromRetail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const markupParsed = parseNumericInput(markup, { label: 'Markup' });
  const markupProblem =
    markupParsed.error ??
    (markupParsed.value === null
      ? 'Enter a markup, for example 50.'
      : markupParsed.value > 1000
        ? 'Markup must be at most 1000%.'
        : null);
  const currencyValid = /^[A-Za-z]{3}$/.test(currency.trim());
  const canSave = !disabled && !busy && markupProblem === null && currencyValid && vendor.trim().length > 0;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSave || markupParsed.value === null) return;
    setBusy(true);
    setError(null);
    try {
      const response = await apiPut<{ settings: DeodapSettings; updatedAt: string }>(
        '/suppliers/deodap/settings',
        {
          orderFlow,
          skuPrefixes: parsePrefixInput(prefixes),
          currencyCode: currency.trim().toUpperCase(),
          vendorName: vendor.trim(),
          pricingMode: mode,
          markupPercent: markupParsed.value,
          priceRounding: rounding,
          includeShippingInPrice: includeShipping,
          compareAtFromRetail: compareAt,
        },
      );
      setPrefixes(response.data.settings.skuPrefixes.join(', '));
      setSavedAt(response.data.updatedAt);
      onSaved();
    } catch (caught) {
      setError(toApiError(caught, 'Saving the DeoDap settings failed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Settings">
      <form className="stack" style={{ gap: 14 }} onSubmit={(event) => void save(event)}>
        {error !== null && <ErrorCallout error={error} />}
        {savedAt !== null && (
          <Callout tone="success" title="Settings saved">
            Saved {formatDateTime(savedAt)}. They apply from now on.
          </Callout>
        )}

        <fieldset className="stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label" style={{ marginBottom: 6 }}>
            How orders reach DeoDap
          </legend>
          {ORDER_FLOWS.map((value) => (
            <label key={value} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <input
                type="radio"
                name="deodap-order-flow"
                value={value}
                checked={orderFlow === value}
                onChange={() => setOrderFlow(value)}
              />
              <span>
                {orderFlowLabel(value)}
                <span className="field__hint" style={{ display: 'block' }}>
                  {value === 'SHOPIFY_APP'
                    ? "Trademart watches each order in Shopify and flags any that have not shipped within your dropshipping processing time. Products from Trademart's CSV import still need placing by hand."
                    : 'Every DeoDap order is flagged until you record it as placed with DeoDap.'}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="divider" style={{ margin: 0 }} />

        <div className="form-grid">
          <div className="field">
            <label className="field__label" htmlFor="deodap-currency">
              DeoDap currency
            </label>
            <input
              id="deodap-currency"
              className="input"
              maxLength={3}
              value={currency}
              onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            />
            <div className="field__hint">
              The currency of the costs in DeoDap files. It must match your Shopify store
              currency - Trademart does not convert.
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="deodap-vendor">
              Vendor on imported products
            </label>
            <input
              id="deodap-vendor"
              className="input"
              maxLength={100}
              value={vendor}
              onChange={(event) => setVendor(event.target.value)}
            />
            <div className="field__hint">
              Many themes show the vendor to customers. Use your own brand if you prefer; products
              always get the DeoDap tag, so they are still recognised.
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="deodap-prefixes">
              SKU prefixes (optional)
            </label>
            <input
              id="deodap-prefixes"
              className="input"
              value={prefixes}
              onChange={(event) => setPrefixes(event.target.value)}
              placeholder="e.g. DD-, DEO"
            />
            <div className="field__hint">
              Products whose SKU starts with one of these are treated as DeoDap products, even
              without the vendor or tag. Separate with commas.
            </div>
          </div>
        </div>

        <div className="divider" style={{ margin: 0 }} />
        <p className="muted" style={{ margin: 0 }}>
          Default pricing for Trademart&apos;s CSV import (products DeoDap&apos;s app imports are
          priced by the app). You can change it for each import before anything is created.
        </p>

        <div className="form-grid">
          <div className="field">
            <label className="field__label" htmlFor="deodap-mode">
              Selling price
            </label>
            <select
              id="deodap-mode"
              className="select"
              value={mode}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setMode(event.target.value as DeodapPricingMode)
              }
            >
              <option value="MARKUP">DeoDap cost + markup</option>
              <option value="RETAIL">The MRP from the file</option>
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="deodap-markup">
              Markup %
            </label>
            <input
              id="deodap-markup"
              className="input"
              inputMode="decimal"
              value={markup}
              onChange={(event) => setMarkup(event.target.value)}
            />
            <div className="field__hint">{markupProblem ?? 'Added to the DeoDap cost.'}</div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="deodap-rounding">
              Rounding
            </label>
            <select
              id="deodap-rounding"
              className="select"
              value={rounding}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setRounding(event.target.value as DeodapPriceRounding)
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
            checked={includeShipping}
            onChange={(event) => setIncludeShipping(event.target.checked)}
          />
          Add DeoDap&apos;s shipping charge to the cost before the markup
        </label>
        <label className="row" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={compareAt}
            onChange={(event) => setCompareAt(event.target.checked)}
          />
          Show the MRP as the &quot;compare at&quot; price when it is higher
        </label>

        <div className="row" style={{ gap: 12 }}>
          <button type="submit" className="btn btn--primary" disabled={!canSave}>
            {busy ? 'Saving…' : 'Save settings'}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            Last saved {formatDateTime(updatedAt)}
          </span>
        </div>
      </form>
    </Card>
  );
}
