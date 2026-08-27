/**
 * Formatting has one rule with teeth: a missing value is never rendered as 0.
 *
 * "Cost: 0.00" and "Cost: —" look similar and mean opposite things. The first is
 * a claim that this product is free to buy, and the pricing module refuses to
 * price a product whose cost is unknown - so a UI that shows a confident 0 is
 * contradicting the engine.
 *
 * `parseNumericInput` exists for the mirror-image bug: `parseFloat("12x")` is 12
 * and `Number("12x")` is NaN, so the previous Number()-then-fallback-to-null path
 * silently turned an operator's typo into "unknown".
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  NOT_AVAILABLE,
  formatAmount,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  humanise,
  parseNumericInput,
  shortGid,
  storeSubdomain,
} from './format';

describe('missing values are never rendered as zero', () => {
  it('shows the em dash for null and undefined money', () => {
    assert.equal(formatMoney(null), NOT_AVAILABLE);
    assert.equal(formatMoney(undefined), NOT_AVAILABLE);
    assert.equal(formatAmount(null, 'INR'), NOT_AVAILABLE);
    assert.equal(formatAmount(undefined, 'INR'), NOT_AVAILABLE);
    assert.equal(formatNumber(null), NOT_AVAILABLE);
    assert.equal(formatPercent(null), NOT_AVAILABLE);
    assert.equal(formatDate(null), NOT_AVAILABLE);
    assert.equal(formatDateTime(undefined), NOT_AVAILABLE);
    assert.equal(humanise(null), NOT_AVAILABLE);
    assert.equal(shortGid(null), NOT_AVAILABLE);
    assert.equal(storeSubdomain(null), NOT_AVAILABLE);
  });

  it('does render a real zero, which is different from unknown', () => {
    // Zero stock is a fact worth showing. Only absence gets the dash.
    assert.notEqual(formatNumber(0), NOT_AVAILABLE);
    assert.notEqual(formatAmount(0, 'INR'), NOT_AVAILABLE);
  });

  it('shows an invalid date as unknown rather than "Invalid Date"', () => {
    assert.equal(formatDate('not-a-date'), NOT_AVAILABLE);
    assert.equal(formatDateTime('not-a-date'), NOT_AVAILABLE);
  });
});

describe('formatAmount', () => {
  it('keeps two decimals so a price never looks rounded off', () => {
    assert.match(formatAmount(1234.5, 'INR'), /1,234\.50/);
  });

  it('shows a bare number when the currency is unknown', () => {
    // Never guesses a symbol. Rendering an unknown currency as ₹ or $ would be a
    // fabricated claim about money.
    const formatted = formatAmount(1234.5, 'UNKNOWN');
    assert.match(formatted, /1,234\.50/);
    assert.ok(!/[₹$€£]/.test(formatted));
  });

  it('appends an unrecognised code instead of throwing', () => {
    // Intl.NumberFormat throws on a bad currency code, which would blank a whole
    // page for what is only a display problem.
    const formatted = formatAmount(10, 'NOTACURRENCY');
    assert.match(formatted, /10\.00/);
    assert.match(formatted, /NOTACURRENCY/);
  });
});

describe('parseNumericInput', () => {
  it('treats blank as a legitimate unknown, not an error', () => {
    assert.deepEqual(parseNumericInput(''), { value: null, error: null });
    assert.deepEqual(parseNumericInput('   '), { value: null, error: null });
  });

  it('parses a plain decimal', () => {
    assert.deepEqual(parseNumericInput('12.50'), { value: 12.5, error: null });
    assert.deepEqual(parseNumericInput('  7 '), { value: 7, error: null });
  });

  it('REJECTS trailing junk rather than silently keeping the digits', () => {
    // The bug this function exists for: parseFloat('12x') === 12, so a typo used
    // to become a confident wrong number - or, via Number(), a silent "unknown".
    const parsed = parseNumericInput('12x', { label: 'Cost' });
    assert.equal(parsed.value, null);
    assert.ok(parsed.error !== null);
    assert.match(parsed.error, /Cost/);
    // The message quotes what was typed, so the operator can see the typo.
    assert.match(parsed.error, /"12x"/);
  });

  it('rejects thousands separators, multiple points and exponents', () => {
    for (const raw of ['1,000', '1.2.3', '1e5', '--5', '.', '+']) {
      assert.equal(parseNumericInput(raw).value, null, raw);
      assert.ok(parseNumericInput(raw).error !== null, `${raw} must be an error, not unknown`);
    }
  });

  it('rejects a negative by default, and allows one when asked', () => {
    // A negative cost or price is never meaningful; a declining trend is.
    assert.ok(parseNumericInput('-5').error !== null);
    assert.deepEqual(parseNumericInput('-5', { allowNegative: true }), {
      value: -5,
      error: null,
    });
  });

  it('rejects a decimal for an integer field', () => {
    assert.ok(parseNumericInput('3.5', { integer: true }).error !== null);
    assert.deepEqual(parseNumericInput('30', { integer: true }), { value: 30, error: null });
  });

  it('names the field, so a form with several numbers says which one is wrong', () => {
    const parsed = parseNumericInput('abc', { label: 'Transit days', integer: true });
    assert.match(parsed.error ?? '', /Transit days/);
    assert.match(parsed.error ?? '', /whole number/);
  });
});

describe('display helpers', () => {
  it('humanises Shopify enums', () => {
    assert.equal(humanise('PARTIALLY_FULFILLED'), 'Partially Fulfilled');
    assert.equal(humanise('draft'), 'Draft');
  });

  it('strips the myshopify suffix but keeps the identifying subdomain', () => {
    assert.equal(storeSubdomain('teststore-abc.myshopify.com'), 'teststore-abc');
    assert.equal(storeSubdomain('teststore-abc.myshopify.com/'), 'teststore-abc');
    // A custom domain is left alone rather than being mangled.
    assert.equal(storeSubdomain('shop.example.com'), 'shop.example.com');
  });

  it('extracts the numeric id from a GID', () => {
    assert.equal(shortGid('gid://shopify/Product/12345'), '12345');
    // Not a GID: shown as-is rather than blanked.
    assert.equal(shortGid('12345'), '12345');
  });
});
