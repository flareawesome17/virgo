// Run: node --experimental-strip-types --test src/lib/badge-total.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { appBadgeTotal } from './badge-total.ts';

describe('appBadgeTotal', () => {
  it('adds unread messages to unread notifications, as the in-app badges count them', () => {
    assert.equal(appBadgeTotal(3, 2), 5);
    assert.equal(appBadgeTotal(0, 0), 0);
  });

  it('says nothing until both counts are known, so a cold start does not wipe the icon a push set', () => {
    assert.equal(appBadgeTotal(undefined, 2), null);
    assert.equal(appBadgeTotal(3, undefined), null);
    assert.equal(appBadgeTotal(undefined, undefined), null);
  });

  it('never goes below zero or off a whole number', () => {
    assert.equal(appBadgeTotal(-1, 0), 0);
    assert.equal(appBadgeTotal(Number.NaN, 2), 2);
    assert.equal(appBadgeTotal(1.7, 1), 2);
  });
});
