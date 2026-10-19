import { corsOptions } from './cors';

/**
 * The browser may only read response headers CORS exposes. Retry-After is how
 * a 429 says when to ask again, and the web uploader waits that long before
 * its next ticket rather than guessing (web/src/api/confirm-retry.ts).
 */
describe('corsOptions', () => {
  it.each([
    ['a named list', corsOptions(['https://virgo.example'], false)],
    ['the LAN in development', corsOptions(['https://virgo.example'], true)],
    ['no list at all', corsOptions([], false)],
  ])('exposes Retry-After with %s', (_label, options) => {
    expect(options.exposedHeaders).toEqual(expect.arrayContaining(['Retry-After']));
  });
});
