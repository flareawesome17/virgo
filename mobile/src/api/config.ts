/**
 * API configuration.
 *
 * Points at the NestJS backend in `api/`. For local development against a
 * machine-hosted server, set EXPO_PUBLIC_API_URL in mobile/.env:
 *
 *   iOS simulator / web:  http://localhost:3000
 *   Android emulator:     http://10.0.2.2:3000   (localhost is the emulator itself)
 *   Physical device:      http://<your-lan-ip>:3000
 */
const RAW_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

if (!RAW_BASE_URL) {
  console.warn(
    '[api] EXPO_PUBLIC_API_URL is not set — every request will fail.',
  );
}

/** Trailing slashes would produce `//workspaces` when joined with a path. */
export const API_BASE_URL = RAW_BASE_URL.replace(/\/+$/, '');

/** Aborts a request that hangs rather than leaving a spinner forever. */
export const REQUEST_TIMEOUT_MS = 20_000;
