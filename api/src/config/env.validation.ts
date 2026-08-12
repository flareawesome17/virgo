/**
 * Fail-fast environment validation.
 *
 * A missing JWT secret or database URL should stop the process at boot, not
 * surface as a 500 on the first request that needs it.
 */
const REQUIRED = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
] as const;

const MIN_SECRET_LENGTH = 32;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        `Copy .env.example to .env and fill them in.`,
    );
  }

  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    const value = String(config[key]);
    if (value.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `${key} must be at least ${MIN_SECRET_LENGTH} characters. ` +
          `Generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
      );
    }
    if (value.startsWith('replace_me')) {
      throw new Error(`${key} is still the placeholder from .env.example.`);
    }
  }

  if (config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different.',
    );
  }

  /*
   * Production must name its allowed origins.
   *
   * Unset, CORS falls back to reflecting whatever origin asked — fine on a
   * laptop where localhost, a LAN IP and the Expo tunnel all need to work at
   * once, wrong on the internet. Every session here is a Bearer token rather
   * than a cookie, so this was never an ambient-credential hole; it did mean
   * any site could read this API from a browser, and a forgotten variable is
   * exactly how that happens.
   *
   * Checked here rather than at the CORS call itself so it fails with the
   * other environment problems, before anything starts listening. An outage
   * during a deploy is loud and fixable; a permissive API looks healthy.
   */
  if (config.NODE_ENV === 'production' && !String(config.CORS_ORIGINS ?? '').trim()) {
    throw new Error(
      'CORS_ORIGINS is required when NODE_ENV=production. Name the origins ' +
        'explicitly, e.g. CORS_ORIGINS=https://web.virgo.ph,https://virgo.ph,' +
        'https://www.virgo.ph,https://console.virgo.ph',
    );
  }

  return config;
}
