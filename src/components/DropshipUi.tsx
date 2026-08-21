'use client';

/**
 * Shared presentation for dropshipping figures and states.
 *
 * Exists so the dashboard and the order detail cannot drift in how they render a
 * confidence or a fulfillment state - two screens disagreeing about whether a cost
 * is known would undermine the entire point of tracking confidence.
 *
 * THE ONE RULE
 * ------------
 * An UNKNOWN figure is never rendered as 0, and never as a bare dash. It shows
 * "unknown" with the REASON attached, because "-" tells an operator nothing about
 * whether to go and enter a cost or to ignore it.
 */

import { Badge, type BadgeTone } from '@/components/ui';
import { formatAmount, formatNumber } from '@/lib/format';
import type {
  Aggregate,
  DataConfidence,
  DropshipFulfillmentState,
  Figure,
} from '@/lib/types';

/* ------------------------------------------------------------- confidence -- */

const CONFIDENCE_TONE: Record<DataConfidence, BadgeTone> = {
  KNOWN: 'success',
  ESTIMATED: 'info',
  UNKNOWN: 'warning',
};

const CONFIDENCE_LABEL: Record<DataConfidence, string> = {
  KNOWN: 'known',
  ESTIMATED: 'estimated',
  UNKNOWN: 'unknown',
};

/**
 * The confidence of a figure, as a badge.
 *
 * KNOWN is shown too, not just the problems: an operator needs to be able to tell at
 * a glance that a number IS solid, and a badge that only ever appears when something
 * is wrong makes its absence ambiguous.
 */
export function ConfidenceBadge({
  confidence,
  title,
}: {
  confidence: DataConfidence;
  title?: string;
}) {
  return (
    <Badge tone={CONFIDENCE_TONE[confidence]} title={title}>
      {CONFIDENCE_LABEL[confidence]}
    </Badge>
  );
}

/**
 * A monetary figure with its confidence.
 *
 * An UNKNOWN figure renders the word "unknown" rather than a number, and the
 * figure's own `source` becomes the tooltip - so hovering explains WHY, e.g. "no
 * supplier cost recorded for Neck Fan".
 */
export function FigureValue({ figure }: { figure: Figure }) {
  if (figure.confidence === 'UNKNOWN' || figure.amount === null) {
    return (
      <span className="row" style={{ gap: 6, alignItems: 'center' }}>
        <span className="muted" title={figure.source}>
          unknown
        </span>
        <ConfidenceBadge confidence="UNKNOWN" title={figure.source} />
      </span>
    );
  }

  return (
    <span className="row" style={{ gap: 6, alignItems: 'center' }}>
      <span title={figure.source}>{formatAmount(figure.amount, figure.currencyCode)}</span>
      {/* KNOWN is the common case and would be noise on every row, so only a
          non-observed figure carries a badge here. The tooltip still states the
          provenance either way. */}
      {figure.confidence !== 'KNOWN' && (
        <ConfidenceBadge confidence={figure.confidence} title={figure.source} />
      )}
    </span>
  );
}

/**
 * An aggregate, with its coverage.
 *
 * When orders were excluded this says so inline - a total that silently covers 40 of
 * 50 orders is the aggregate version of treating unknown as zero.
 */
export function AggregateValue({ aggregate }: { aggregate: Aggregate }) {
  const incomplete = aggregate.ordersExcluded > 0;
  return (
    <span className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <span title={aggregate.source}>
        {formatAmount(aggregate.amount, aggregate.currencyCode)}
      </span>
      {incomplete && (
        <Badge tone="warning" title={aggregate.source}>
          {`at least \u2014 ${formatNumber(aggregate.ordersExcluded)} order(s) excluded`}
        </Badge>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ state -- */

const STATE_LABEL: Record<DropshipFulfillmentState, string> = {
  ORDER_RECEIVED: 'Order received',
  AWAITING_SUPPLIER: 'Awaiting supplier',
  SUPPLIER_PROCESSING: 'Supplier processing',
  FULFILLED: 'Fulfilled',
  LABEL_CREATED: 'Label created',
  CARRIER_PICKED_UP: 'Carrier picked up',
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  DELAYED: 'Delayed',
  DELIVERY_FAILED: 'Delivery failed',
  CANCELLED: 'Cancelled',
  UNKNOWN: 'Unknown',
};

const STATE_TONE: Record<DropshipFulfillmentState, BadgeTone> = {
  ORDER_RECEIVED: 'neutral',
  AWAITING_SUPPLIER: 'warning',
  SUPPLIER_PROCESSING: 'info',
  FULFILLED: 'info',
  // A label is not a shipment, so this is deliberately NOT a success tone - it
  // would read as "on its way" when nothing has physically moved.
  LABEL_CREATED: 'neutral',
  CARRIER_PICKED_UP: 'info',
  IN_TRANSIT: 'info',
  OUT_FOR_DELIVERY: 'info',
  DELIVERED: 'success',
  DELAYED: 'warning',
  DELIVERY_FAILED: 'danger',
  CANCELLED: 'neutral',
  UNKNOWN: 'warning',
};

/** Human label for a state. Exported so tables can sort/filter on the same words. */
export function describeState(state: DropshipFulfillmentState): string {
  return STATE_LABEL[state] ?? 'Unknown';
}

export function StateBadge({
  state,
  title,
}: {
  state: DropshipFulfillmentState;
  title?: string;
}) {
  return (
    <Badge
      tone={STATE_TONE[state] ?? 'neutral'}
      dot={state === 'DELIVERED' || state === 'DELIVERY_FAILED'}
      title={
        title ??
        (state === 'LABEL_CREATED'
          ? 'A shipping label exists, but nothing has physically moved yet'
          : state === 'UNKNOWN'
            ? 'Shopify did not report a status Trademart could interpret. This does NOT mean the order is being processed.'
            : undefined)
      }
    >
      {describeState(state)}
    </Badge>
  );
}

/** Supplier classification badge. UNKNOWN is a real answer, not a failure. */
export function SupplierBadge({
  supplier,
  evidence,
}: {
  supplier: string;
  evidence: string[];
}) {
  if (supplier === 'TRADELLE') {
    return (
      <Badge
        tone="success"
        title={
          evidence.length > 0
            ? `Identified from: ${evidence.join(', ')}`
            : 'Identified as Tradelle'
        }
      >
        Tradelle
      </Badge>
    );
  }
  if (supplier === 'UNKNOWN') {
    return (
      <Badge
        tone="warning"
        title="No vendor, tag or fulfillment service identified the supplier. Trademart will not guess."
      >
        supplier unknown
      </Badge>
    );
  }
  return (
    <Badge
      tone="neutral"
      title={evidence.length > 0 ? `Identified from: ${evidence.join(', ')}` : undefined}
    >
      other supplier
    </Badge>
  );
}
