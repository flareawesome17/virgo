// Run: node --experimental-strip-types --test src/components/upload/upload-concurrency.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UPLOAD_CONCURRENCY } from './upload-concurrency.ts';

describe('UPLOAD_CONCURRENCY', () => {
  it('sends six files at once across the app', () => {
    assert.equal(UPLOAD_CONCURRENCY, 6);
  });
});
