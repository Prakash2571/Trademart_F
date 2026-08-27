/**
 * Capability verdicts decide whether a control is enabled and what a disabled one
 * says. Two properties matter:
 *
 *   FAILS OPEN. While loading, on an unknown key, or when the backend cannot
 *   report scopes, the control stays enabled and the backend remains the gate.
 *   Failing closed would black out the console exactly when the capability read
 *   itself is broken.
 *
 *   NEVER CONFLATES THE TWO REASONS. "Grant a scope" and "no code exists" need
 *   different actions, and telling someone to grant a permission that will change
 *   nothing is worse than saying nothing at all.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { describeCapability } from './capabilityVerdict';
import type { ShopifyCapabilities } from './types';

type Feature = ShopifyCapabilities['features'][number];

/**
 * Only `features` is read by describeCapability. The rest of the report is
 * deliberately not built here: fabricating scopes/capabilities blocks that
 * nothing under test looks at would just be a second place to keep in step with
 * the backend shape.
 */
function caps(...features: Feature[]): ShopifyCapabilities {
  return { features } as unknown as ShopifyCapabilities;
}

function feature(
  overrides: Partial<Feature> & Pick<Feature, 'key' | 'status'>,
): Feature {
  return {
    group: 'products',
    action: 'write',
    title: overrides.key,
    requiredScopes: [],
    implemented: true,
    operations: [],
    routes: [],
    available: overrides.status === 'AVAILABLE',
    missingScopes: [],
    ...overrides,
  };
}

describe('describeCapability', () => {
  it('stays enabled while the report is loading', () => {
    const verdict = describeCapability(null, 'products.write');
    assert.equal(verdict.available, true);
    assert.equal(verdict.status, 'LOADING');
    assert.equal(verdict.reason, null);
  });

  it('stays enabled for a key the backend does not report', () => {
    // A gap in the capability catalogue is not evidence that a feature is
    // unavailable, and the backend refuses what it cannot do anyway.
    const verdict = describeCapability(caps(), 'something.new');
    assert.equal(verdict.available, true);
    assert.equal(verdict.status, 'AVAILABLE');
  });

  it('enables an available feature', () => {
    const verdict = describeCapability(
      caps(feature({ key: 'products.write', status: 'AVAILABLE' })),
      'products.write',
    );
    assert.equal(verdict.available, true);
    assert.equal(verdict.reason, null);
  });

  it('disables a scope-missing feature and names the scope', () => {
    const verdict = describeCapability(
      caps(
        feature({
          key: 'products.publish',
          status: 'SCOPE_MISSING',
          requiredScopes: ['write_publications'],
          missingScopes: ['write_publications'],
        }),
      ),
      'products.publish',
    );

    assert.equal(verdict.available, false);
    assert.equal(verdict.status, 'SCOPE_MISSING');
    // Naming the scope is the whole value: the operator has to find it in the
    // Shopify Dev Dashboard.
    assert.match(verdict.reason ?? '', /write_publications/);
    assert.match(verdict.reason ?? '', /release a new app version/i);
  });

  it('falls back to the required scopes when the missing list is empty', () => {
    const verdict = describeCapability(
      caps(
        feature({
          key: 'products.publish',
          status: 'SCOPE_MISSING',
          requiredScopes: ['write_products', 'write_publications'],
          missingScopes: [],
        }),
      ),
      'products.publish',
    );

    // Better to name every scope the feature needs than to render an empty list.
    assert.match(verdict.reason ?? '', /write_products, write_publications/);
  });

  it('distinguishes NOT_IMPLEMENTED from a missing scope', () => {
    const verdict = describeCapability(
      caps(feature({ key: 'orders.refund', status: 'NOT_IMPLEMENTED' })),
      'orders.refund',
    );

    assert.equal(verdict.available, false);
    assert.equal(verdict.status, 'NOT_IMPLEMENTED');
    // Must NOT tell the operator to grant a scope - it would change nothing.
    assert.ok(!/grant|scope in the Shopify Dev Dashboard/i.test(verdict.reason ?? ''));
    assert.match(verdict.reason ?? '', /regardless of scopes/i);
  });

  it('prefers the backend note for NOT_IMPLEMENTED when it supplies one', () => {
    const verdict = describeCapability(
      caps(
        feature({
          key: 'orders.refund',
          status: 'NOT_IMPLEMENTED',
          note: 'Refunds are issued in Shopify on purpose.',
        }),
      ),
      'orders.refund',
    );

    assert.equal(verdict.reason, 'Refunds are issued in Shopify on purpose.');
  });

  it('stays enabled when scopes are unknown', () => {
    // A static access token does not report its scopes. Disabling everything would
    // make the console useless on a perfectly working deployment.
    const verdict = describeCapability(
      caps(feature({ key: 'products.write', status: 'SCOPES_UNKNOWN' })),
      'products.write',
    );

    assert.equal(verdict.available, true);
    assert.equal(verdict.status, 'SCOPES_UNKNOWN');
    assert.equal(verdict.reason, null);
  });

  it('stays enabled for a status this frontend has never heard of', () => {
    // Forward compatibility: a newer backend status must not disable a control by
    // accident.
    const verdict = describeCapability(
      caps(
        feature({
          key: 'products.write',
          status: 'BRAND_NEW' as unknown as Feature['status'],
        }),
      ),
      'products.write',
    );

    assert.equal(verdict.available, true);
  });
});
