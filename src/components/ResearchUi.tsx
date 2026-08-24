'use client';

/**
 * Shared presentation for research scores, factors and evidence.
 *
 * Exists so the list and the detail page cannot drift in how they render a score - two
 * screens disagreeing about whether a candidate is a good one would undermine the whole
 * module.
 *
 * THE TWO RULES
 * -------------
 * 1. The opportunity score and the confidence score are ALWAYS shown together and NEVER
 *    combined. A single number cannot distinguish "this is a mediocre product" from
 *    "this might be excellent but we know almost nothing", and those call for opposite
 *    actions. ScorePair is the only sanctioned way to show either of them.
 *
 * 2. An unscored factor is rendered as "not scored - excluded", never as 0 and never as
 *    a bare dash. Zero would assert the product is bad at that factor; a dash tells the
 *    operator nothing about whether to go and find the data.
 */

import { Badge, type BadgeTone } from '@/components/ui';
import { formatAmount, formatDateTime, formatNumber } from '@/lib/format';
import type {
  CapabilityAvailability,
  DataConfidence,
  DuplicateMatch,
  EvidenceItem,
  FactorScore,
  Freshness,
  PricingScenario,
  PricingScenarioName,
  Recommendation,
  ResearchCapability,
  ScoreFactorKey,
  SeasonState,
  CurrentSourceability,
  SupplierAvailability,
  VariantCoverage,
} from '@/lib/types';

/* ------------------------------------------------------------------ labels -- */

export const FACTOR_LABELS: Record<ScoreFactorKey, string> = {
  demand: 'Demand',
  trend: 'Trend',
  profitability: 'Profitability',
  storeFit: 'Store fit',
  competition: 'Competition',
  shipping: 'Shipping',
  seasonality: 'Seasonality',
  fulfillmentQuality: 'Fulfillment quality',
};

/** Same order the backend reports, so the two never disagree about precedence. */
export const FACTOR_ORDER: ScoreFactorKey[] = [
  'demand',
  'trend',
  'profitability',
  'storeFit',
  'competition',
  'shipping',
  'seasonality',
  'fulfillmentQuality',
];

export const CAPABILITY_LABELS: Record<ResearchCapability, string> = {
  demand: 'Search demand',
  trend: 'Trend direction',
  competition: 'Competition level',
  seasonality: 'Seasonality',
  storePerformance: 'This store\u2019s own sales history',
  fulfillmentHistory: 'Measured delivery performance',
  supplierCommercials: 'Supplier cost lookup',
};

const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  STRONG_CANDIDATE: 'Strong candidate',
  GOOD_CANDIDATE: 'Good candidate',
  WATCH: 'Watch',
  WEAK: 'Weak',
  REJECT: 'Reject',
};

const RECOMMENDATION_TONE: Record<Recommendation, BadgeTone> = {
  STRONG_CANDIDATE: 'success',
  GOOD_CANDIDATE: 'success',
  WATCH: 'info',
  WEAK: 'warning',
  REJECT: 'danger',
};

const SEASON_LABEL: Record<SeasonState, string> = {
  EARLY: 'Season beginning',
  RISING: 'Demand climbing',
  PEAK: 'At peak',
  FALLING: 'Season ending',
  OFF_SEASON: 'Out of season',
  UNKNOWN: 'Seasonality unknown',
};

const FRESHNESS_TONE: Record<Freshness, BadgeTone> = {
  FRESH: 'success',
  AGING: 'info',
  STALE: 'warning',
  UNKNOWN: 'warning',
};

const FRESHNESS_LABEL: Record<Freshness, string> = {
  FRESH: 'fresh',
  AGING: 'ageing',
  STALE: 'stale',
  UNKNOWN: 'age unknown',
};

const CONFIDENCE_TONE: Record<DataConfidence, BadgeTone> = {
  KNOWN: 'success',
  ESTIMATED: 'info',
  UNKNOWN: 'warning',
};

/* ------------------------------------------------------------------ badges -- */

/**
 * The recommendation.
 *
 * `downgraded` renders the reason as a tooltip: a candidate scoring 88 shown as WATCH
 * looks like a bug unless the screen explains that confidence held it back.
 */
export function RecommendationBadge({
  recommendation,
  title,
}: {
  recommendation: Recommendation | null;
  title?: string;
}) {
  if (recommendation === null) {
    return (
      <Badge
        tone="neutral"
        title="This candidate has never been analysed, so it has no recommendation. That is not a poor score."
      >
        not scored
      </Badge>
    );
  }
  return (
    <Badge tone={RECOMMENDATION_TONE[recommendation]} title={title}>
      {RECOMMENDATION_LABEL[recommendation]}
    </Badge>
  );
}

export function FreshnessBadge({ freshness }: { freshness: Freshness }) {
  return (
    <Badge
      tone={FRESHNESS_TONE[freshness]}
      title={
        freshness === 'UNKNOWN'
          ? 'No timestamp was recorded for this figure, so its age is unknown. That is a different problem from an old figure - it means nobody knows when it was true.'
          : freshness === 'STALE'
            ? 'This figure is old enough that it should be refreshed before acting on it.'
            : undefined
      }
    >
      {FRESHNESS_LABEL[freshness]}
    </Badge>
  );
}

/* ---- supplier sourceability ---- */

const SOURCEABILITY_TONE: Record<CurrentSourceability, BadgeTone> = {
  SOURCEABLE: 'success',
  PARTIALLY_SOURCEABLE: 'info',
  NEEDS_RECHECK: 'warning',
  NOT_SOURCEABLE: 'danger',
  UNVERIFIED: 'warning',
};

const SOURCEABILITY_LABEL: Record<CurrentSourceability, string> = {
  SOURCEABLE: '✓ Available',
  PARTIALLY_SOURCEABLE: '◐ Partial',
  NEEDS_RECHECK: '⚠ Needs recheck',
  NOT_SOURCEABLE: '✕ Unavailable',
  UNVERIFIED: '? Unverified',
};

const SOURCEABILITY_HINT: Record<CurrentSourceability, string> = {
  SOURCEABLE: 'Verified available from the supplier, and the check is current.',
  PARTIALLY_SOURCEABLE: 'Available, but some variants are unavailable or unverified.',
  NEEDS_RECHECK: 'Was verified available, but the check is now stale. Re-verify before pushing.',
  NOT_SOURCEABLE: 'The supplier cannot source this product. It cannot be pushed.',
  UNVERIFIED: 'Availability has not been verified. Record a supplier verification before pushing.',
};

/**
 * The supplier sourceability badge.
 *
 * `current` (the freshness-aware verdict) not `availability`: a check can be AVAILABLE yet
 * NEEDS_RECHECK, and the operator needs the live verdict, not the historical value.
 */
export function SupplierBadge({
  provider,
  current,
}: {
  provider?: string | null;
  current: CurrentSourceability;
}) {
  return (
    <Badge tone={SOURCEABILITY_TONE[current]} title={SOURCEABILITY_HINT[current]}>
      {provider && provider !== 'UNKNOWN' ? `${titleCase(provider)} ` : ''}
      {SOURCEABILITY_LABEL[current]}
    </Badge>
  );
}

export const VARIANT_COVERAGE_LABEL: Record<VariantCoverage, string> = {
  FULL: 'all variants available',
  PARTIAL: 'some variants unavailable',
  NONE: 'no variants available',
  UNKNOWN: 'variants not itemised',
};

export const AVAILABILITY_LABEL: Record<SupplierAvailability, string> = {
  AVAILABLE: 'Available',
  UNAVAILABLE: 'Unavailable',
  UNKNOWN: 'Unknown',
};

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export function SeasonBadge({ state }: { state: SeasonState }) {
  return (
    <Badge
      tone={
        state === 'EARLY' || state === 'RISING'
          ? 'success'
          : state === 'PEAK'
            ? 'info'
            : state === 'UNKNOWN'
              ? 'neutral'
              : 'warning'
      }
      title={
        state === 'PEAK'
          ? 'Good for selling today, but demand falls from here - expect a short window.'
          : undefined
      }
    >
      {SEASON_LABEL[state]}
    </Badge>
  );
}

/* --------------------------------------------------------------- the pair -- */

/**
 * The opportunity score and the data confidence, side by side.
 *
 * The ONLY component that renders either number. Deliberately impossible to show one
 * without the other, because "87" on its own is the exact impression this module exists
 * to avoid giving.
 */
export function ScorePair({
  overallScore,
  confidenceScore,
  compact = false,
}: {
  overallScore: number | null;
  confidenceScore: number | null;
  compact?: boolean;
}) {
  if (overallScore === null) {
    return (
      <span className="muted" title="Not analysed yet. This is not a score of zero.">
        not scored
      </span>
    );
  }

  const confidence = confidenceScore ?? 0;
  const lowConfidence = confidence < 60;

  if (compact) {
    return (
      <span className="row" style={{ gap: 6, alignItems: 'center' }}>
        <span className="mono" title="How good the opportunity looks, out of 100">
          {overallScore}
        </span>
        <span className="muted" aria-hidden="true">
          /
        </span>
        <Badge
          tone={lowConfidence ? 'warning' : 'neutral'}
          title={
            lowConfidence
              ? `Data confidence is only ${confidence}/100. The score rests on values nobody has observed.`
              : `Data confidence ${confidence}/100`
          }
        >
          {`${confidence}% conf.`}
        </Badge>
      </span>
    );
  }

  return (
    <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
      <div>
        <div className="muted" style={{ fontSize: 12 }}>
          Opportunity
        </div>
        <div className="mono" style={{ fontSize: 28, lineHeight: 1.1 }}>
          {overallScore}
          <span className="muted" style={{ fontSize: 14 }}>
            /100
          </span>
        </div>
        <div className="muted" style={{ fontSize: 11 }}>
          how good this looks
        </div>
      </div>

      <div>
        <div className="muted" style={{ fontSize: 12 }}>
          Data confidence
        </div>
        <div className="mono" style={{ fontSize: 28, lineHeight: 1.1 }}>
          {confidence}
          <span className="muted" style={{ fontSize: 14 }}>
            /100
          </span>
        </div>
        <div className="muted" style={{ fontSize: 11 }}>
          how much to trust it
        </div>
      </div>

      {lowConfidence && (
        <div style={{ maxWidth: 320 }}>
          <Badge tone="warning">low confidence</Badge>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            These two numbers are deliberately separate and are never combined. A high
            opportunity score on thin data is a reason to go and find the missing figures,
            not a reason to buy.
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- factors -- */

/**
 * Every factor, including the ones that were not scored.
 *
 * Unscored factors are listed rather than hidden. A candidate scored on five of eight
 * factors is a partial assessment, and hiding the three absences would make it look
 * complete.
 */
export function FactorTable({ factors }: { factors: FactorScore[] }) {
  const byKey = new Map(factors.map((factor) => [factor.factor, factor]));

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Factor</th>
            <th>Score</th>
            <th>Data</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          {FACTOR_ORDER.map((key) => {
            const factor = byKey.get(key);
            if (factor === undefined) return null;
            const unscored = factor.value === null;

            return (
              <tr key={key}>
                <td>{FACTOR_LABELS[key]}</td>
                <td>
                  {unscored ? (
                    // NEVER 0, and never a bare dash.
                    <span
                      className="muted"
                      title="No data for this factor, so it was excluded from the average. It is not a score of zero - zero would assert the product is bad at this."
                    >
                      not scored — excluded
                    </span>
                  ) : (
                    <span className="mono">{factor.value}</span>
                  )}
                </td>
                <td>
                  <Badge tone={CONFIDENCE_TONE[factor.confidence]}>
                    {factor.confidence.toLowerCase()}
                  </Badge>
                </td>
                <td style={{ maxWidth: 520 }}>
                  {factor.reasons.length === 0 ? (
                    <span className="muted">—</span>
                  ) : (
                    <ul className="note-list">
                      {factor.reasons.map((reason, index) => (
                        <li key={index}>{reason}</li>
                      ))}
                    </ul>
                  )}
                  {factor.risks.length > 0 && (
                    <ul className="note-list" style={{ marginTop: 6 }}>
                      {factor.risks.map((risk, index) => (
                        <li key={index}>
                          <Badge tone="warning">risk</Badge> {risk}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------------- evidence -- */

/**
 * The figures a score was built from.
 *
 * Shown because an operator who disagrees with a score needs the number that drove it,
 * not just the verdict. `source` is the load-bearing column: "Operator entry (read from
 * an external tool)" is a very different basis from "This store's own Shopify orders".
 */
export function EvidenceList({ evidence }: { evidence: EvidenceItem[] }) {
  if (evidence.length === 0) {
    return (
      <span className="muted">
        No evidence recorded. Nothing here rests on an observed figure.
      </span>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Figure</th>
            <th>Value</th>
            <th>Source</th>
            <th>Observed</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody>
          {evidence.map((item, index) => (
            <tr key={`${item.code}-${index}`}>
              <td>{item.label}</td>
              <td className="mono">{item.value ?? '—'}</td>
              <td style={{ maxWidth: 320 }}>{item.source}</td>
              <td>
                {item.observedAt === null ? (
                  <span
                    className="muted"
                    title="No observation date was recorded, so this figure's age is unknown."
                  >
                    unrecorded
                  </span>
                ) : (
                  formatDateTime(item.observedAt)
                )}
              </td>
              <td>
                <FreshnessBadge freshness={item.freshness} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------------- scenarios -- */

/**
 * The three price scenarios.
 *
 * A breaching scenario is shown as computed and marked NOT viable, with the price that
 * would clear the floors. Hiding it would conceal the most useful thing the calculation
 * found out: that the operator's conservative position is not available on this product.
 */
export function ScenarioTable({
  scenarios,
  recommended,
  currencyCode,
}: {
  scenarios: PricingScenario[];
  recommended: PricingScenarioName | null;
  currencyCode: string | null;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Scenario</th>
            <th>Price</th>
            <th>Margin</th>
            <th>Contribution</th>
            <th>Viable</th>
            <th>What it is for</th>
          </tr>
        </thead>
        <tbody>
          {scenarios.map((scenario) => (
            <tr key={scenario.name}>
              <td>
                <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                  {scenario.label}
                  {recommended === scenario.name && <Badge tone="info">recommended</Badge>}
                </span>
              </td>
              <td className="mono">{formatAmount(scenario.price, currencyCode)}</td>
              <td className="mono">
                {scenario.marginPercentage === null
                  ? '—'
                  : `${scenario.marginPercentage.toFixed(1)}%`}
              </td>
              <td className="mono">{formatAmount(scenario.contribution, currencyCode)}</td>
              <td>
                {scenario.viable ? (
                  <Badge tone="success">clears floors</Badge>
                ) : (
                  <Badge
                    tone="danger"
                    title={scenario.guardBreaches.join('; ')}
                  >
                    breaches floor
                  </Badge>
                )}
              </td>
              <td style={{ maxWidth: 380 }}>
                <div className="muted" style={{ fontSize: 12 }}>
                  {scenario.intent}
                </div>
                {!scenario.viable && (
                  <div className="note-list" style={{ marginTop: 6 }}>
                    {scenario.guardBreaches.map((breach, index) => (
                      <div key={index}>It {breach}.</div>
                    ))}
                    {scenario.minimumViablePrice !== null && (
                      <div>
                        Lowest price that clears both floors:{' '}
                        <span className="mono">
                          {formatAmount(scenario.minimumViablePrice, currencyCode)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------ capabilities -- */

/**
 * What research can and cannot measure.
 *
 * The most important panel in the module. Four of the six gatherable signals come only
 * from figures an operator typed in, and a screen that did not say so would imply live
 * market data - which is how a score built on a half-remembered number gets trusted.
 */
export function CapabilityList({
  capabilities,
}: {
  capabilities: CapabilityAvailability[];
}) {
  return (
    <div className="stack">
      {capabilities.map((entry) => (
        <div key={entry.capability} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 210 }}>
            {CAPABILITY_LABELS[entry.capability] ?? entry.capability}
          </div>
          <div style={{ minWidth: 120 }}>
            {entry.available ? (
              <Badge tone="success">available</Badge>
            ) : (
              <Badge tone="warning">not available</Badge>
            )}
          </div>
          <div className="muted" style={{ fontSize: 12, flex: 1 }}>
            {entry.available ? (
              <>From: {entry.providers.join(', ')}</>
            ) : entry.limitations.length === 0 ? (
              'No provider supplies this.'
            ) : (
              <ul className="note-list">
                {entry.limitations.map((limitation, index) => (
                  <li key={index}>{limitation}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- duplicates -- */

export function DuplicateList({ matches }: { matches: DuplicateMatch[] }) {
  if (matches.length === 0) {
    return <span className="muted">No possible duplicates found.</span>;
  }

  return (
    <div className="stack">
      {matches.map((match) => (
        <div key={`${match.target}-${match.id}`} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
          <Badge tone={match.blocking ? 'danger' : match.strength === 'EXACT' ? 'warning' : 'neutral'}>
            {match.blocking ? 'blocks push' : match.strength.toLowerCase()}
          </Badge>
          <div style={{ flex: 1 }}>
            <div>{match.title}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {match.reason}
            </div>
            <div className="muted mono" style={{ fontSize: 11 }}>
              {match.target === 'SHOPIFY_PRODUCT' ? 'Shopify product' : 'Research candidate'}{' '}
              {match.id}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Formats a search volume without implying more precision than a typed figure has. */
export function formatSearchVolume(value: number | null): string {
  return value === null ? 'not recorded' : `${formatNumber(value)} / month`;
}
