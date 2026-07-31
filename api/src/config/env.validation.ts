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

  return config;
}
