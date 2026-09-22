import type { DynamicModule, ExecutionContext, Provider } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  getOptionsToken,
  ThrottlerModule,
  type ThrottlerModuleOptions,
  ThrottlerStorageService,
} from '@nestjs/throttler';
import { AppModule } from './app.module';
import { CloudflareThrottlerGuard } from './common/guards/cloudflare-throttler.guard';

// Loading AppModule loads every module, and archiver ships as ESM, which this
// jest setup does not transform. Nothing here zips anything.
jest.mock('archiver', () => ({ ZipArchive: class {} }));

/**
 * The rate limiter as the app is actually wired.
 *
 * Read from AppModule's own imports rather than restated here, so changing
 * the forRoot call is what these tests see. The apps show a 429's text word
 * for word, so the sentence is part of the contract; and the object form of
 * the options must not lose the per-account tracker CloudflareThrottlerGuard
 * supplies, which the last test drives to a real 429 to prove.
 */

function throttlerOptions(): ThrottlerModuleOptions {
  const imports = Reflect.getMetadata('imports', AppModule) as unknown[];
  const throttler = imports.find(
    (entry): entry is DynamicModule =>
      typeof entry === 'object' &&
      entry !== null &&
      (entry as DynamicModule).module === ThrottlerModule,
  );
  const provider = throttler?.providers?.find(
    (p: Provider): p is { provide: string; useValue: ThrottlerModuleOptions } =>
      typeof p === 'object' && 'provide' in p && p.provide === getOptionsToken(),
  );
  if (!provider) throw new Error('ThrottlerModule is not configured in AppModule');
  return provider.useValue;
}

/** A signed-in request to one route, as the guard sees it. */
function contextFor(userId: string): ExecutionContext {
  const handler = function sendRequest() {};
  class FriendsController {}
  const request = { user: { id: userId }, headers: {}, ip: '10.0.0.1', app: { get: () => false } };
  const response = { header: jest.fn() };
  return {
    getHandler: () => handler,
    getClass: () => FriendsController,
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
}

describe('AppModule throttling', () => {
  it('keeps the global limit at 120 a minute', () => {
    const options = throttlerOptions();
    expect(Array.isArray(options)).toBe(false);
    expect(!Array.isArray(options) && options.throttlers).toEqual([
      { name: 'default', ttl: 60_000, limit: 120 },
    ]);
  });

  it('answers a 429 with a sentence people can read', () => {
    const options = throttlerOptions();
    expect(!Array.isArray(options) && options.errorMessage).toBe(
      'Too many attempts. Please wait a while and try again.',
    );
  });

  it('still buckets by account, and says so in that sentence', async () => {
    const storage = new ThrottlerStorageService();
    const guard = new CloudflareThrottlerGuard(
      throttlerOptions(),
      storage,
      new Reflector(),
    );
    await guard.onModuleInit();

    try {
      for (let i = 0; i < 120; i++) {
        await expect(guard.canActivate(contextFor('user-a'))).resolves.toBe(true);
      }
      // Someone else's allowance is untouched by user-a's.
      await expect(guard.canActivate(contextFor('user-b'))).resolves.toBe(true);
      await expect(guard.canActivate(contextFor('user-a'))).rejects.toThrow(
        'Too many attempts. Please wait a while and try again.',
      );
    } finally {
      // The store expires each hit on a timer; left running, jest waits a
      // minute for them.
      storage.onApplicationShutdown();
    }
  });
});
