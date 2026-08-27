/**
 * What the operator is told after a refused write.
 *
 * The single most urgent question after a failure is "was the store left
 * half-changed?", and the answer comes from `isNoOpFailure`. Getting it wrong is
 * dangerous in both directions: claiming nothing happened when a product exists
 * leaves an unmonitored live product, and claiming something might have happened
 * when it did not sends an operator hunting through Shopify for nothing.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isNoOpFailure, presentError } from './errorMessages';

describe('presentError', () => {
  it('never throws, and falls back for an unknown code', () => {
    const presentation = presentError('SOMETHING_NOBODY_HAS_SEEN');
    assert.equal(typeof presentation.title, 'string');
    assert.ok(presentation.title.length > 0);
    // The fallback must tell the operator to quote the request id, which is the
    // only thing that makes an unrecognised failure diagnosable.
    assert.match(presentation.action, /request id/i);
  });

  it('offers retry only where retrying could work', () => {
    assert.equal(presentError('SHOPIFY_THROTTLED').offerRetry, true);
    assert.equal(presentError('RATE_LIMITED').offerRetry, true);
    // A missing scope, a stale preview and a reused key are all deterministic:
    // retrying the identical request cannot succeed.
    assert.equal(presentError('SHOPIFY_SCOPE_MISSING').offerRetry, false);
    assert.equal(presentError('PREVIEW_STALE').offerRetry, false);
    assert.equal(presentError('IDEMPOTENCY_CONFLICT').offerRetry, false);
  });

  it('does not offer retry after a timeout, because the write may have landed', () => {
    // SHOPIFY_TIMEOUT is the one failure where the outcome is genuinely unknown.
    // Offering a one-click retry would risk applying the change twice; the
    // instruction is to look at current state first.
    const presentation = presentError('SHOPIFY_TIMEOUT');
    assert.equal(presentation.offerRetry, false);
    assert.equal(presentation.offerRefresh, true);
    assert.match(presentation.action, /may or may not/i);
  });

  it('marks a possible live product as danger, and never as "nothing happened"', () => {
    const presentation = presentError('RESEARCH_PUSH_SAFETY');
    assert.equal(presentation.tone, 'danger');
    // A product EXISTS. The action has to say so and tell the operator to go
    // and hide it, not offer a retry.
    assert.match(presentation.action, /Shopify/);
    assert.equal(presentation.offerRetry, false);
    assert.equal(isNoOpFailure('RESEARCH_PUSH_SAFETY'), false);
  });

  it('explains a refused write when the database is down', () => {
    // The backend now refuses dangerous writes outright with no idempotency
    // record or audit trail available. The UI must say nothing was changed, or
    // the operator will go looking for a half-applied change.
    const presentation = presentError('DATABASE_UNAVAILABLE');
    assert.match(presentation.action, /Nothing was changed/i);
    assert.match(presentation.action, /audit/i);
    assert.equal(presentation.offerRetry, true);
  });

  it('explains an unpersisted webhook without implying data was lost', () => {
    const presentation = presentError('WEBHOOK_NOT_PERSISTED');
    // The server asked for a redelivery, which is the opposite of losing it.
    assert.match(presentation.action, /again|retri/i);
    assert.equal(presentation.tone, 'danger');
  });
});

describe('isNoOpFailure', () => {
  it('is true for every refusal raised before a write', () => {
    for (const code of [
      'PREVIEW_REQUIRED',
      'PREVIEW_STALE',
      'PREVIEW_EXPIRED',
      'PRODUCT_CHANGED',
      'INVENTORY_DELTA_TOO_LARGE',
      'LIVE_STORE_WRITE_BLOCKED',
      'AUTOMATION_ALREADY_RUNNING',
      'AUTOMATION_DISABLED',
      'VALIDATION_ERROR',
      'COST_UNKNOWN',
      'CURRENCY_MISMATCH',
      'DATABASE_UNAVAILABLE',
      'RECOMMENDATION_CHANGED',
      'RESEARCH_ALREADY_PUSHED',
      'RESEARCH_PUSH_IN_PROGRESS',
      'PUSH_CLAIM_LOST',
      'RESEARCH_SUPPLIER_UNAVAILABLE',
      'RESEARCH_SUPPLIER_UNVERIFIED',
      'RESEARCH_SUPPLIER_STALE',
      'RESEARCH_SUPPLIER_VARIANTS',
    ]) {
      assert.equal(isNoOpFailure(code), true, `${code} changes nothing and must say so`);
    }
  });

  it('is false where the outcome is unknown or a change happened', () => {
    for (const code of [
      // A product exists.
      'RESEARCH_PUSH_SAFETY',
      // Created, then failed to publish: the product is real, just hidden.
      'PUBLICATION_FAILED',
      // We stopped waiting; Shopify may have applied it.
      'SHOPIFY_TIMEOUT',
      // The first attempt is still running and may yet succeed.
      'IDEMPOTENCY_IN_PROGRESS',
      'INTERNAL_ERROR',
    ]) {
      assert.equal(
        isNoOpFailure(code),
        false,
        `${code} must NOT claim nothing changed - the operator would stop looking`,
      );
    }
  });
});
