/**
 * DeoDap page helpers.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEODAP_IMPORT_BATCH,
  MAX_UPLOAD_BYTES,
  chunk,
  formatChange,
  jsonByteLength,
  orderStatusLabel,
  orderStatusTone,
  orderSummaryText,
  parsePrefixInput,
  previewStatusTone,
  shopifyAdminUrl,
  uploadProblem,
} from './deodap';

describe('chunk', () => {
  it('splits into batches of the import size', () => {
    const items = Array.from({ length: 23 }, (_value, index) => index);
    const batches = chunk(items, DEODAP_IMPORT_BATCH);
    assert.deepEqual(
      batches.map((batch) => batch.length),
      [10, 10, 3],
    );
    assert.deepEqual(batches.flat(), items);
  });

  it('returns nothing for nothing, and refuses a nonsense size', () => {
    assert.deepEqual(chunk([], 10), []);
    assert.throws(() => chunk([1], 0));
  });
});

describe('uploadProblem', () => {
  it('accepts an ordinary file', () => {
    assert.equal(uploadProblem('Title,SKU\nFan,DD-1\n'), null);
  });

  it('refuses an empty file', () => {
    assert.match(uploadProblem('  \n') ?? '', /empty/);
  });

  it('measures the encoded size, not the character count', () => {
    // Quotes are escaped in JSON, so this 600 KB of text is well over 1 MB on the wire.
    const quoted = '"'.repeat(600_000);
    assert.ok(quoted.length < MAX_UPLOAD_BYTES);
    assert.ok(jsonByteLength({ csv: quoted }) > MAX_UPLOAD_BYTES);
    assert.match(uploadProblem(quoted) ?? '', /too large/);
  });

  it('counts multi-byte characters as the bytes they are', () => {
    assert.equal(jsonByteLength('₹'), 5);
  });
});

describe('parsePrefixInput', () => {
  it('splits on commas, spaces and new lines and drops repeats ignoring case', () => {
    assert.deepEqual(parsePrefixInput(' DD-, dd-\nDEO  X/ '), ['DD-', 'DEO', 'X/']);
    assert.deepEqual(parsePrefixInput(''), []);
  });
});

describe('shopifyAdminUrl', () => {
  it('builds the admin link for an order and a product', () => {
    assert.equal(
      shopifyAdminUrl('my-shop.myshopify.com', 'gid://shopify/Order/123'),
      'https://admin.shopify.com/store/my-shop/orders/123',
    );
    assert.equal(
      shopifyAdminUrl('my-shop', 'gid://shopify/Product/9'),
      'https://admin.shopify.com/store/my-shop/products/9',
    );
  });

  it('returns null rather than a wrong link', () => {
    assert.equal(shopifyAdminUrl(null, 'gid://shopify/Order/1'), null);
    assert.equal(shopifyAdminUrl('my-shop', 'gid://shopify/Customer/1'), null);
    assert.equal(shopifyAdminUrl('evil.com/x', 'gid://shopify/Order/1'), null);
  });
});

describe('orderSummaryText', () => {
  it('lists what to order from DeoDap', () => {
    const text = orderSummaryText({
      name: '#1001',
      lines: [
        {
          shopifyLineItemId: '1',
          shopifyVariantId: null,
          shopifyProductId: null,
          title: 'Mini Fan',
          sku: 'DD-100',
          quantity: 2,
          supplierRef: 'DD-100',
          evidence: [],
          unitCost: null,
          unitShippingCost: null,
          currencyCode: null,
        },
        {
          shopifyLineItemId: '2',
          shopifyVariantId: null,
          shopifyProductId: null,
          title: 'Jar',
          sku: null,
          quantity: 1,
          supplierRef: 'jar-handle',
          evidence: [],
          unitCost: null,
          unitShippingCost: null,
          currencyCode: null,
        },
      ],
    });
    assert.equal(text, 'Shopify order #1001\nDD-100 x 2 - Mini Fan\njar-handle x 1 - Jar');
  });
});

describe('labels and tones', () => {
  it('treats an order with no record as not placed', () => {
    assert.equal(orderStatusLabel(null), 'Not placed');
    assert.equal(orderStatusTone(null), 'warning');
    assert.equal(orderStatusTone('PROBLEM'), 'danger');
    assert.equal(orderStatusTone('DELIVERED'), 'success');
  });

  it('marks a product needing attention as a problem', () => {
    assert.equal(previewStatusTone('NEEDS_ATTENTION'), 'danger');
    assert.equal(previewStatusTone('READY'), 'success');
  });

  it('formats a signed change', () => {
    assert.equal(formatChange(10), '+10.0%');
    assert.equal(formatChange(-2.5), '-2.5%');
    assert.equal(formatChange(null), '—');
  });
});
