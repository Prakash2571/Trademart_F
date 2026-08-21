'use client';

/**
 * "What needs my attention right now?"
 *
 * The dashboard's totals answer how big the store is. This answers what to do,
 * which is the question an operator actually opens the page with.
 *
 * DESIGN RULES
 * ------------
 * 1. Every card is a COUNT plus a LINK to the thing that resolves it. A number
 *    with nowhere to click is a nag, not a tool.
 * 2. A card only appears when its count is non-zero. A wall of zeroes trains
 *    people to ignore the panel, which is exactly when a real one gets missed.
 * 3. Each source degrades independently. A missing read_publications scope must
 *    not blank the review-queue count; it just hides the publication cards and
 *    says why.
 * 4. Nothing is inferred. Counts come from endpoints that measure the thing
 *    being counted - the publication mismatches come from the integrity check,
 *    which asks Shopify directly, rather than from guessing at `status`.
 */

import Link from 'next/link';

import { Badge, Callout, Card } from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { formatNumber } from '@/lib/format';
import type {
  IntegrityReport,
  ProductDto,
  WebhookEventsResponse,
} from '@/lib/types';

/** The tag automation applies to hold a product for review. */
const REVIEW_TAG = 'trademart:needs-review';

interface AttentionItem {
  key: string;
  count: number;
  label: string;
  href: string;
  tone: 'danger' | 'warning' | 'info';
  /** Why this matters, one line. */
  detail: string;
}

export function AttentionPanel() {
  // Scoped, cheap queries rather than one aggregate endpoint: each can fail on
  // its own, and a partial answer is worth more than none.
  const review = useApi<{ products: ProductDto[] }>(
    `/shopify/products?limit=50&query=${encodeURIComponent(`tag:'${REVIEW_TAG}'`)}`,
  );
  const integrity = useApi<IntegrityReport>('/diagnostics/integrity');
  const webhooks = useApi<WebhookEventsResponse>('/webhooks/events?status=FAILED&limit=1');

  const items: AttentionItem[] = [];

  // ---- Review queue ---------------------------------------------------------
  const awaitingReview = review.data?.products.length ?? 0;
  if (awaitingReview > 0) {
    items.push({
      key: 'review',
      count: awaitingReview,
      label: awaitingReview === 1 ? 'product awaiting review' : 'products awaiting review',
      href: '/products/review',
      tone: 'warning',
      detail: 'Held back from the storefront until a human approves them.',
    });
  }

  // ---- Unknown cost --------------------------------------------------------
  //
  // Counted from the review queue's own data rather than a catalogue scan: these
  // are the products about to be priced, so an unknown cost here is the one that
  // will actually block something.
  const unknownCost =
    review.data?.products.filter((product) =>
      product.variants.every(
        (variant) => variant.unitCost === null || variant.unitCost.amount <= 0,
      ),
    ).length ?? 0;
  if (unknownCost > 0) {
    items.push({
      key: 'cost',
      count: unknownCost,
      label: 'awaiting review with UNKNOWN cost',
      href: '/products/review',
      tone: 'warning',
      detail: 'Automation will refuse to price these. Enter a cost, or set Cost per item.',
    });
  }

  // ---- Shopify state inconsistencies --------------------------------------
  const counts = integrity.data?.counts ?? {};
  const activeNotPublished = counts['ACTIVE_NOT_PUBLISHED'] ?? 0;
  const draftButPublished = counts['DRAFT_BUT_PUBLISHED'] ?? 0;
  const staleReviewTag = counts['REVIEW_TAG_ON_ACTIVE'] ?? 0;
  const orphanedCost = counts['ORPHANED_MANUAL_COST'] ?? 0;

  if (activeNotPublished > 0) {
    items.push({
      key: 'active-not-published',
      count: activeNotPublished,
      label: 'ACTIVE but not published',
      href: '/system',
      tone: 'danger',
      detail: 'These look live in the Shopify admin but customers cannot see them.',
    });
  }
  if (draftButPublished > 0) {
    items.push({
      key: 'draft-published',
      count: draftButPublished,
      label: 'published but still DRAFT',
      href: '/system',
      tone: 'info',
      detail: 'Hidden only by their status - one status change from being live.',
    });
  }
  if (staleReviewTag > 0) {
    items.push({
      key: 'stale-review-tag',
      count: staleReviewTag,
      label: 'ACTIVE but still tagged for review',
      href: '/products/review',
      tone: 'info',
      detail: 'They keep reappearing in the queue. Approving again clears the tag.',
    });
  }
  if (orphanedCost > 0) {
    items.push({
      key: 'orphaned-cost',
      count: orphanedCost,
      label: 'cost overrides for missing products',
      href: '/system',
      tone: 'warning',
      detail: 'The product was deleted in Shopify, so the override applies to nothing.',
    });
  }

  // ---- Webhook failures ----------------------------------------------------
  const failedWebhooks = webhooks.data?.stats.failed ?? 0;
  if (failedWebhooks > 0) {
    items.push({
      key: 'webhooks',
      count: failedWebhooks,
      label: failedWebhooks === 1 ? 'failed webhook delivery' : 'failed webhook deliveries',
      href: '/system',
      tone: 'danger',
      detail: 'These exhausted their automatic retries. Shopify told us something we did not act on.',
    });
  }

  const loading = review.loading || integrity.loading || webhooks.loading;

  // Checks that could not run at all - surfaced so "nothing needs attention" is
  // never mistaken for "nothing was looked at".
  const blindSpots: string[] = [];
  if (review.error !== null) blindSpots.push('the review queue could not be read');
  if (integrity.error !== null) blindSpots.push('Shopify state consistency could not be checked');
  if (webhooks.error !== null) blindSpots.push('webhook delivery health could not be read');
  for (const skipped of integrity.data?.skipped ?? []) {
    blindSpots.push(`${skipped.check} was skipped (${skipped.reason})`);
  }

  if (loading && items.length === 0 && blindSpots.length === 0) {
    return (
      <Card title="Needs attention">
        <p className="muted" style={{ margin: 0 }}>
          Checking…
        </p>
      </Card>
    );
  }

  return (
    <Card
      title="Needs attention"
      actions={
        <button
          className="btn btn--sm"
          onClick={() => {
            review.refetch();
            integrity.refetch();
            webhooks.refetch();
          }}
          disabled={loading}
        >
          {loading ? 'Checking…' : 'Re-check'}
        </button>
      }
    >
      <div className="stack">
        {items.length === 0 && blindSpots.length === 0 && (
          <Callout tone="success" title="Nothing needs attention">
            No products awaiting review, no Shopify state inconsistencies, and no failed webhook
            deliveries.
          </Callout>
        )}

        {items.length > 0 && (
          <div className="grid grid--stats">
            {items.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="card"
                style={{ padding: 14, textDecoration: 'none', display: 'block' }}
              >
                <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                  <strong style={{ fontSize: 26, lineHeight: 1 }}>
                    {formatNumber(item.count)}
                  </strong>
                  <Badge tone={item.tone} dot>
                    {item.tone === 'danger' ? 'act now' : item.tone === 'warning' ? 'review' : 'check'}
                  </Badge>
                </div>
                <div style={{ marginTop: 6, fontWeight: 500 }}>{item.label}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {item.detail}
                </div>
              </Link>
            ))}
          </div>
        )}

        {blindSpots.length > 0 && (
          <Callout tone="info" title="Some checks could not run">
            This panel is therefore incomplete — do not read it as &quot;all clear&quot;.
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {blindSpots.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </Callout>
        )}
      </div>
    </Card>
  );
}
