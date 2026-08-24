'use client';

/**
 * /research - the product research shortlist.
 *
 * Leads with what the module CANNOT measure, before any score is shown.
 *
 * That ordering is deliberate and is the most important decision on this page. Four of
 * the six market signals come only from figures an operator read on a Tradelle page and
 * typed in; Google Ads keyword planning is not built and Google Trends has no public API.
 * A dashboard that opened with "87/100" would imply live market intelligence, and the
 * operator would trust a number they half-remember entering three weeks ago.
 *
 * Every score is shown as a PAIR - opportunity and data confidence, never blended. See
 * ScorePair.
 */

import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';

import {
  CapabilityList,
  RecommendationBadge,
  ScorePair,
  SeasonBadge,
} from '@/components/ResearchUi';
import {
  Badge,
  Callout,
  Card,
  EmptyState,
  ErrorCallout,
  PageHeader,
  SkeletonStats,
  SkeletonTable,
  StatCard,
} from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { ApiError, apiPost } from '@/lib/api';
import { formatDate, formatNumber, parseNumericInput } from '@/lib/format';
import type {
  CandidateStatus,
  ProductCandidate,
  ResearchCapabilitiesReport,
  SeasonState,
  ShopifyStatus,
} from '@/lib/types';

const STATUS_FILTERS: { value: CandidateStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'NEW', label: 'Not analysed' },
  { value: 'ANALYZED', label: 'Analysed' },
  { value: 'WATCHING', label: 'Watching' },
  { value: 'SELECTED', label: 'Selected' },
  { value: 'PUSHED_TO_SHOPIFY', label: 'Pushed as draft' },
  { value: 'REJECTED', label: 'Rejected' },
];

const SEASON_OPTIONS: SeasonState[] = [
  'UNKNOWN',
  'EARLY',
  'RISING',
  'PEAK',
  'FALLING',
  'OFF_SEASON',
];

/** The horizons the trend bands are calibrated for. Others are refused by the API. */
const HORIZONS = [7, 30, 90] as const;

export default function ResearchPage() {
  const [status, setStatus] = useState<CandidateStatus | 'ALL'>('ALL');
  const [sort, setSort] = useState<'score' | 'recent'>('score');
  const [showForm, setShowForm] = useState(false);

  const path = `/intelligence/candidates?limit=100&sort=${sort}${
    status === 'ALL' ? '' : `&status=${status}`
  }`;
  const candidates = useApi<ProductCandidate[]>(path, [status, sort]);
  const capabilities = useApi<ResearchCapabilitiesReport>('/intelligence/capabilities');

  const rows = candidates.data ?? [];
  const meta = candidates.meta as
    | { count?: number; unscored?: number; lowConfidence?: number }
    | undefined;

  return (
    <>
      <PageHeader
        title="Product research"
        description="Candidates recorded, scored and pushed to Shopify as drafts. Scoring is deterministic — every number can be reproduced by hand from the figures below it."
        actions={
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setShowForm((open) => !open)}
          >
            {showForm ? 'Close' : 'Record a candidate'}
          </button>
        }
      />

      {/* Capabilities FIRST. What we cannot measure matters more than any score. */}
      <Card title="What this can and cannot measure">
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          Read this before trusting a score. Trademart measures what THIS STORE has done; it
          does not measure the market.
        </p>
        {capabilities.loading && <SkeletonStats count={3} />}
        {capabilities.error !== null && <ErrorCallout error={capabilities.error} />}
        {capabilities.data !== null && (
          <>
            <Callout tone="warning" title="Market data is entered by hand">
              {capabilities.data.tradelle.modes.DIRECT_API_UNAVAILABLE} Demand, trend,
              competition and seasonality therefore come from figures you record yourself,
              and are scored as estimates with you named as the source.
            </Callout>

            <div style={{ marginTop: 12 }}>
              <CapabilityList capabilities={capabilities.data.capabilities} />
            </div>

            {capabilities.data.unbuiltIntegrations.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  Integrations that would make these measurements real, and are not built:
                </div>
                <ul className="note-list">
                  {capabilities.data.unbuiltIntegrations.map((integration) => (
                    <li key={integration.key}>
                      <strong>{integration.displayName}</strong> —{' '}
                      {integration.requiredEnv.length === 0
                        ? 'there is no official API to configure.'
                        : `would need ${integration.requiredEnv.join(', ')}.`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </Card>

      {showForm && (
        <CandidateForm
          onCreated={() => {
            setShowForm(false);
            candidates.refetch();
          }}
        />
      )}

      {candidates.error !== null && <ErrorCallout error={candidates.error} />}

      {meta !== undefined && rows.length > 0 && (
        <div className="grid grid--stats">
          <StatCard label="Candidates" value={formatNumber(meta.count ?? rows.length)} />
          <StatCard
            label="Never analysed"
            value={formatNumber(meta.unscored ?? 0)}
            hint="No score at all — not a low score"
          />
          <StatCard
            label="Low confidence"
            value={formatNumber(meta.lowConfidence ?? 0)}
            hint="Scored, but on data that cannot be trusted yet"
          />
        </div>
      )}

      <Card
        title="Shortlist"
        actions={
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <label className="muted" htmlFor="rs-status" style={{ fontSize: 12 }}>
              Status
            </label>
            <select
              id="rs-status"
              className="select"
              value={status}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setStatus(event.target.value as CandidateStatus | 'ALL')
              }
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <label className="muted" htmlFor="rs-sort" style={{ fontSize: 12 }}>
              Sort
            </label>
            <select
              id="rs-sort"
              className="select"
              value={sort}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setSort(event.target.value as 'score' | 'recent')
              }
            >
              <option value="score">Best score first</option>
              <option value="recent">Recently updated</option>
            </select>
          </div>
        }
      >
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          Opportunity and data confidence are shown separately and are never combined.
        </p>

        {candidates.loading && <SkeletonTable rows={5} columns={6} />}

        {!candidates.loading && rows.length === 0 && (
          <EmptyState
            title="No candidates yet"
            description="Record a product you are considering, with whatever figures you have. Missing figures stay missing — nothing is guessed on your behalf."
          />
        )}

        {rows.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Score / confidence</th>
                  <th>Recommendation</th>
                  <th>Market</th>
                  <th>Season</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((candidate) => (
                  <tr key={candidate.id}>
                    <td>
                      <Link href={`/research/${encodeURIComponent(candidate.id)}`}>
                        {candidate.title}
                      </Link>
                      {candidate.category !== null && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {candidate.category}
                        </div>
                      )}
                    </td>
                    <td>
                      <ScorePair
                        overallScore={candidate.overallScore}
                        confidenceScore={candidate.confidenceScore}
                        compact
                      />
                    </td>
                    <td>
                      <RecommendationBadge recommendation={candidate.recommendation} />
                    </td>
                    <td className="mono">
                      {candidate.market.countryCode}
                      {candidate.market.region === null ? '' : ` / ${candidate.market.region}`}
                    </td>
                    <td>
                      <SeasonBadge state={candidate.seasonState} />
                    </td>
                    <td>
                      <StatusBadge candidate={candidate} />
                    </td>
                    <td>{formatDate(candidate.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

/**
 * Status, with the push state made unambiguous.
 *
 * PUSHED_TO_SHOPIFY says "draft in Shopify" rather than "pushed", because nothing in this
 * module publishes and the word must not imply a live product.
 */
function StatusBadge({ candidate }: { candidate: ProductCandidate }) {
  if (candidate.status === 'PUSHED_TO_SHOPIFY') {
    return (
      <Badge
        tone="info"
        title={`A DRAFT product exists in Shopify (${candidate.pushedShopifyProductId ?? 'unknown id'}). It is not published.`}
      >
        draft in Shopify
      </Badge>
    );
  }
  if (candidate.status === 'REJECTED') return <Badge tone="neutral">rejected</Badge>;
  if (candidate.status === 'WATCHING') {
    return (
      <Badge
        tone="info"
        title={
          candidate.watchUntil === null
            ? undefined
            : `Watching until ${formatDate(candidate.watchUntil)}`
        }
      >
        watching
      </Badge>
    );
  }
  if (candidate.status === 'NEW') return <Badge tone="warning">not analysed</Badge>;
  if (candidate.status === 'SELECTED') return <Badge tone="success">selected</Badge>;
  return <Badge tone="neutral">analysed</Badge>;
}

/* ===========================================================================
 * The form
 * ======================================================================== */

interface FormState {
  title: string;
  category: string;
  sourceProductId: string;
  sourceUrl: string;
  keywords: string;
  countryCode: string;
  region: string;
  horizonDays: number;
  supplierCost: string;
  supplierCurrency: string;
  shippingCost: string;
  shippingCurrency: string;
  shippingDays: string;
  expectedSellingPrice: string;
  sellingCurrency: string;
  averageMonthlySearches: string;
  momentumPercentage: string;
  competitionIndex: string;
  seasonState: SeasonState;
  observedAt: string;
  geographyCountryCode: string;
  geographyRegion: string;
  sourceNote: string;
}

/*
 * No GB/GBP here.
 *
 * The target country and the currencies used to default to 'GB'/'GBP' - literals that were
 * right for whoever wrote the form and wrong for everyone else, and worse, invisible: an
 * operator in another market would submit GB/GBP without noticing the boxes were already
 * filled. Target country is now required and starts blank.
 *
 * The three money amounts each carry their OWN currency, because a supplier can genuinely
 * bill in USD while the store sells in INR. They are independent fields; supplier and
 * shipping mirror each other only as an untouched convenience, and the selling currency is
 * prefilled from the connected store (see CandidateForm) and left blank when unknown - so
 * every value is either the operator's or the store's, never a guess baked into the code.
 */
const EMPTY_FORM: FormState = {
  title: '',
  category: '',
  sourceProductId: '',
  sourceUrl: '',
  keywords: '',
  countryCode: '',
  region: '',
  horizonDays: 30,
  supplierCost: '',
  supplierCurrency: '',
  shippingCost: '',
  shippingCurrency: '',
  shippingDays: '',
  expectedSellingPrice: '',
  sellingCurrency: '',
  averageMonthlySearches: '',
  momentumPercentage: '',
  competitionIndex: '',
  seasonState: 'UNKNOWN',
  observedAt: '',
  geographyCountryCode: '',
  geographyRegion: '',
  sourceNote: '',
};

function textOrNull(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Records a candidate.
 *
 * Every numeric field is a STRING in state so an empty box stays empty. Binding them to
 * numbers would turn "I do not know the shipping cost" into 0, which is the single
 * failure the whole module is built to avoid - a zero cost produces a beautiful margin
 * and a confident, wrong purchase.
 */
function CandidateForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  /** Per-field parse errors, so a typo like "12x" is refused where it was typed. */
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);

  /*
   * The store's own currency, used to prefill the SELLING currency - "shop config or
   * blank", never a hard-coded GBP. Prefilled only while the selling field is untouched,
   * so it can never overwrite what the operator typed, and it stays blank if the store
   * currency is unknown (an unlabelled amount is refused downstream rather than guessed).
   */
  const shop = useApi<ShopifyStatus>('/shopify/status');
  const storeCurrency = shop.data?.shop?.currencyCode ?? null;
  /*
   * Which currency fields the operator has touched. Supplier and shipping mirror each
   * other as a convenience UNTIL the operator edits shipping independently; selling is
   * prefilled from the shop until touched. All three remain independent in state - the
   * mirroring is a UI nicety, not a shared value, so a USD supplier / INR selling case is
   * always expressible.
   */
  const [shippingCurrencyTouched, setShippingCurrencyTouched] = useState(false);
  const [sellingCurrencyTouched, setSellingCurrencyTouched] = useState(false);

  useEffect(() => {
    if (!sellingCurrencyTouched && form.sellingCurrency === '' && storeCurrency !== null) {
      setForm((current) =>
        current.sellingCurrency === ''
          ? { ...current, sellingCurrency: storeCurrency }
          : current,
      );
    }
  }, [storeCurrency, sellingCurrencyTouched, form.sellingCurrency]);

  const set = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) =>
      setForm((current) => ({ ...current, [key]: value })),
    [],
  );

  /*
   * Supplier currency drives the shipping currency for convenience, but only while the
   * operator has not set shipping independently. Once they do, the two never re-couple -
   * they are genuinely separate fields.
   */
  const setSupplierCurrency = useCallback(
    (value: string) =>
      setForm((current) => ({
        ...current,
        supplierCurrency: value,
        ...(shippingCurrencyTouched ? {} : { shippingCurrency: value }),
      })),
    [shippingCurrencyTouched],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    /*
     * Parse every numeric field STRICTLY before anything is sent.
     *
     * parseNumericInput rejects "12x" instead of quietly turning it into "unknown", so a
     * mistyped cost is caught here rather than silently dropped and then discovered as a
     * blocked price recommendation later. Blank stays blank - unknown is always allowed.
     */
    const supplierCost = parseNumericInput(form.supplierCost, { label: 'Supplier cost' });
    const shippingCost = parseNumericInput(form.shippingCost, { label: 'Supplier shipping' });
    const shippingDays = parseNumericInput(form.shippingDays, {
      label: 'Transit days',
      integer: true,
    });
    const expectedSellingPrice = parseNumericInput(form.expectedSellingPrice, {
      label: 'Intended price',
    });
    const averageMonthlySearches = parseNumericInput(form.averageMonthlySearches, {
      label: 'Average monthly searches',
      integer: true,
    });
    // Trend may be negative - a declining product is a real observation, not an error.
    const momentumPercentage = parseNumericInput(form.momentumPercentage, {
      label: 'Trend %',
      allowNegative: true,
    });
    const competitionIndex = parseNumericInput(form.competitionIndex, {
      label: 'Competition',
      integer: true,
    });

    const parseErrors = [
      supplierCost,
      shippingCost,
      shippingDays,
      expectedSellingPrice,
      averageMonthlySearches,
      momentumPercentage,
      competitionIndex,
    ]
      .map((parsed) => parsed.error)
      .filter((message): message is string => message !== null);

    if (parseErrors.length > 0) {
      // Refuse locally - the numbers never reach the API, so a typo cannot become a stored
      // figure or a silent blank.
      setFieldErrors(parseErrors);
      setError(null);
      return;
    }
    setFieldErrors([]);

    setSaving(true);
    setError(null);

    try {
      await apiPost('/intelligence/candidates', {
        title: form.title.trim(),
        source: form.sourceProductId.trim() === '' ? 'MANUAL' : 'TRADELLE',
        sourceProductId: textOrNull(form.sourceProductId),
        sourceUrl: textOrNull(form.sourceUrl),
        category: textOrNull(form.category),
        keywords: form.keywords
          .split(',')
          .map((keyword) => keyword.trim())
          .filter((keyword) => keyword !== ''),
        market: {
          countryCode: form.countryCode.trim().toUpperCase(),
          region: textOrNull(form.region),
          horizonDays: form.horizonDays,
        },
        commercials: {
          // Each amount carries its OWN currency - no shared field, so a USD supplier cost
          // against an INR selling price is stored truthfully. The backend blocks PRICING
          // across mismatched currencies (CURRENCY_MISMATCH); it never relabels one as
          // another, and neither does this form.
          supplierCost: supplierCost.value,
          supplierCurrency: textOrNull(form.supplierCurrency),
          shippingCost: shippingCost.value,
          shippingCurrency: textOrNull(form.shippingCurrency),
          shippingDays: shippingDays.value,
          expectedSellingPrice: expectedSellingPrice.value,
          expectedSellingCurrency: textOrNull(form.sellingCurrency),
          costObservedAt: textOrNull(form.observedAt),
        },
        manualResearch: {
          averageMonthlySearches: averageMonthlySearches.value,
          momentumPercentage: momentumPercentage.value,
          competitionIndex: competitionIndex.value,
          competitorCount: null,
          seasonState: form.seasonState,
          peakMonths: null,
          geography: {
            // Stays null unless the operator states it - a figure with no stated geography
            // is treated as unknown, never assumed to describe the target market.
            countryCode: textOrNull(form.geographyCountryCode),
            region: textOrNull(form.geographyRegion),
          },
          observedAt: textOrNull(form.observedAt),
          sourceNote: textOrNull(form.sourceNote),
        },
      });

      setForm(EMPTY_FORM);
      setShippingCurrencyTouched(false);
      setSellingCurrencyTouched(false);
      onCreated();
    } catch (caught: unknown) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError('UNKNOWN', 'Could not record the candidate.', 0),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Record a candidate">
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
        Leave anything you do not know BLANK. A blank field stays unknown; it never becomes
        zero.
      </p>
      <form onSubmit={submit} className="stack">
        {error !== null && <ErrorCallout error={error} />}

        {fieldErrors.length > 0 && (
          <Callout tone="warning" title="Check these figures">
            <ul className="note-list" style={{ marginBottom: 0 }}>
              {fieldErrors.map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
          </Callout>
        )}

        <Field label="Product title" required>
          <input
            className="select"
            value={form.title}
            required
            onChange={(event: ChangeEvent<HTMLInputElement>) => set('title', event.target.value)}
            placeholder="Portable neck fan"
          />
        </Field>

        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <Field label="Category" hint="Shopify product type. Drives store fit.">
            <input
              className="select"
              value={form.category}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                set('category', event.target.value)
              }
              placeholder="Home"
            />
          </Field>
          <Field label="Supplier reference" hint="Tradelle product id, if you have one">
            <input
              className="select"
              value={form.sourceProductId}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                set('sourceProductId', event.target.value)
              }
            />
          </Field>
          <Field label="Source URL">
            <input
              className="select"
              value={form.sourceUrl}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                set('sourceUrl', event.target.value)
              }
            />
          </Field>
        </div>

        <Field label="Keywords" hint="Comma separated. What people would search for.">
          <input
            className="select"
            value={form.keywords}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              set('keywords', event.target.value)
            }
            placeholder="neck fan, portable fan"
          />
        </Field>

        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <Field label="Target country" required hint="Two-letter code. Region isolation depends on it.">
            <input
              className="select"
              value={form.countryCode}
              required
              maxLength={2}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                set('countryCode', event.target.value)
              }
            />
          </Field>
          <Field label="Region" hint="Optional. Leave blank for country-wide.">
            <input
              className="select"
              value={form.region}
              onChange={(event: ChangeEvent<HTMLInputElement>) => set('region', event.target.value)}
            />
          </Field>
          <Field label="Horizon">
            <select
              className="select"
              value={form.horizonDays}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                set('horizonDays', Number(event.target.value))
              }
            >
              {HORIZONS.map((days) => (
                <option key={days} value={days}>
                  {days} days
                </option>
              ))}
            </select>
          </Field>
        </div>

        <hr />
        <div className="muted" style={{ fontSize: 12 }}>
          <strong>Costs.</strong> An unknown supplier cost blocks the price recommendation
          entirely, which is deliberate — pricing from a guess produces a flattering margin
          and a loss-making product.
        </div>

        <p className="muted" style={{ fontSize: 11, marginTop: 0 }}>
          Each amount has its own currency. A supplier can bill in one currency while you
          sell in another — that is stored exactly as entered. Trademart has no exchange-rate
          source, so if the currencies differ it will refuse to calculate a margin rather
          than guess one; it never relabels a cost as a different currency.
        </p>

        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <Field label="Supplier cost">
            <input
              className="select"
              value={form.supplierCost}
              inputMode="decimal"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                set('supplierCost', event.target.value)
              }
            />
          </Field>
          <Field label="Supplier cost currency" hint="e.g. USD. What the supplier bills in.">
            <input
              className="select"
              value={form.supplierCurrency}
              maxLength={3}
              placeholder="USD"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setSupplierCurrency(event.target.value)
              }
            />
          </Field>
          <Field label="Supplier shipping" hint="Blank = unknown, NOT free">
            <input
              className="select"
              value={form.shippingCost}
              inputMode="decimal"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                set('shippingCost', event.target.value)
              }
            />
          </Field>
          <Field
            label="Shipping currency"
            hint={
              shippingCurrencyTouched
                ? 'Independent of the supplier cost currency.'
                : 'Follows the supplier currency until you change it.'
            }
          >
            <input
              className="select"
              value={form.shippingCurrency}
              maxLength={3}
              placeholder="USD"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setShippingCurrencyTouched(true);
                set('shippingCurrency', event.target.value);
              }}
            />
          </Field>
          <Field label="Transit days">
            <input
              className="select"
              value={form.shippingDays}
              inputMode="numeric"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                set('shippingDays', event.target.value)
              }
            />
          </Field>
          <Field label="Intended price" hint="Optional. Store fit is judged against this.">
            <input
              className="select"
              value={form.expectedSellingPrice}
              inputMode="decimal"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                set('expectedSellingPrice', event.target.value)
              }
            />
          </Field>
          <Field
            label="Selling currency"
            hint={
              storeCurrency === null
                ? 'The currency the product will sell in.'
                : `The currency the product will sell in. Prefilled from your store (${storeCurrency}).`
            }
          >
            <input
              className="select"
              value={form.sellingCurrency}
              maxLength={3}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setSellingCurrencyTouched(true);
                set('sellingCurrency', event.target.value);
              }}
            />
          </Field>
        </div>

        <hr />
        <div className="muted" style={{ fontSize: 12 }}>
          <strong>Market figures you read elsewhere.</strong> These are recorded as YOUR
          observation, not as something Trademart measured. The date is when you read them —
          freshness ages from it, so a figure from an old screenshot will be marked stale.
        </div>

        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <Field label="Avg monthly searches">
            <input
              className="select"
              value={form.averageMonthlySearches}
              inputMode="numeric"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                set('averageMonthlySearches', event.target.value)
              }
            />
          </Field>
          <Field label="Trend %" hint="Change over the horizon. Negative for declining.">
            <input
              className="select"
              value={form.momentumPercentage}
              inputMode="decimal"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                set('momentumPercentage', event.target.value)
              }
            />
          </Field>
          <Field label="Competition 0-100">
            <input
              className="select"
              value={form.competitionIndex}
              inputMode="numeric"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                set('competitionIndex', event.target.value)
              }
            />
          </Field>
          <Field label="Season">
            <select
              className="select"
              value={form.seasonState}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                set('seasonState', event.target.value as SeasonState)
              }
            >
              {SEASON_OPTIONS.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <Field
            label="Which country do these figures describe?"
            hint="Leave blank if unstated. A figure for another country is DISCARDED, not down-weighted."
          >
            <input
              className="select"
              value={form.geographyCountryCode}
              maxLength={2}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                set('geographyCountryCode', event.target.value)
              }
              placeholder="US"
            />
          </Field>
          <Field
            label="Region these figures describe"
            hint="Optional. Only meaningful once a country is stated above."
          >
            <input
              className="select"
              value={form.geographyRegion}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                set('geographyRegion', event.target.value)
              }
              placeholder="California"
            />
          </Field>
          <Field label="When did you read them?" hint="Freshness ages from this date">
            <input
              className="select"
              type="date"
              value={form.observedAt.slice(0, 10)}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                set(
                  'observedAt',
                  event.target.value === ''
                    ? ''
                    : new Date(`${event.target.value}T00:00:00.000Z`).toISOString(),
                )
              }
            />
          </Field>
          <Field label="Where from?" hint="Recorded alongside the figures">
            <input
              className="select"
              value={form.sourceNote}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                set('sourceNote', event.target.value)
              }
              placeholder="Tradelle product page"
            />
          </Field>
        </div>

        <div className="row" style={{ gap: 8 }}>
          <button type="submit" className="btn btn--sm" disabled={saving}>
            {saving ? 'Recording…' : 'Record candidate'}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            Recording does not score it. Analyse it afterwards, so a half-entered candidate
            never produces a verdict.
          </span>
        </div>
      </form>
    </Card>
  );
}

function Field({
  label,
  hint,
  required = false,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="stack" style={{ gap: 3, minWidth: 180, flex: '1 1 180px' }}>
      <span style={{ fontSize: 12 }}>
        {label}
        {required && <span className="muted"> *</span>}
      </span>
      {children}
      {hint !== undefined && (
        <span className="muted" style={{ fontSize: 11 }}>
          {hint}
        </span>
      )}
    </label>
  );
}
