/**
 * Throwaway values for the variables AppModule demands at import time.
 *
 * `ConfigModule.forRoot({ validate: validateEnv })` runs its validation when
 * the module is loaded, not when an app is created — so a unit test that only
 * reads AppModule's metadata still has to satisfy it. On a developer's machine
 * `api/.env` happens to be sitting there and does satisfy it, which is why
 * app.module.spec.ts passed locally and failed in CI from the day it was
 * added: CI has no .env, and the run died on DATABASE_URL, JWT_ACCESS_SECRET
 * and JWT_REFRESH_SECRET.
 *
 * Only filled in when absent, so a real environment still wins and nothing
 * here can mask a variable a test meant to set for itself.
 *
 * None of it reaches anything. The database URL names a port nothing listens
 * on, so a test that accidentally connects fails loudly rather than finding a
 * real database; the secrets exist to clear the 32-character length check and
 * sign nothing any assertion depends on.
 */
const FALLBACKS: Record<string, string> = {
  DATABASE_URL: 'postgres://virgo:virgo@127.0.0.1:1/virgo_no_such_database',
  JWT_ACCESS_SECRET: 'jest-access-secret-signing-nothing-that-is-asserted',
  JWT_REFRESH_SECRET: 'jest-refresh-secret-signing-nothing-that-is-asserted',
};

for (const [key, value] of Object.entries(FALLBACKS)) {
  if (!process.env[key]) process.env[key] = value;
}
