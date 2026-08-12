/**
 * Layered on top of app.json, which stays the source of truth for everything
 * static. This file exists for the one thing that has to vary by build:
 * whether the app is allowed to talk to a plain-HTTP address.
 *
 * Expo merges the two — app.json arrives here as `config`, and what is
 * returned is the final manifest.
 */

/**
 * Android 9 and later block cleartext HTTP by default, and the failure is
 * silent from the app's side: every request errors as if the network were
 * down. A test build points at the development API on the LAN, which is
 * http://<ip>:3001 and cannot be anything else — there is no certificate for
 * a private address.
 *
 * So cleartext is allowed for every profile EXCEPT production. Production
 * talks to https://api.virgo.ph and must keep the protection: without this
 * branch, a store build would accept a downgrade to plain HTTP for the sake
 * of a convenience it never uses.
 *
 * EAS sets EAS_BUILD_PROFILE from the --profile flag. Undefined locally, which
 * is the permissive case, and correct — a local run is development.
 */
const isProduction = process.env.EAS_BUILD_PROFILE === 'production';

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    [
      'expo-build-properties',
      {
        android: {
          usesCleartextTraffic: !isProduction,
        },
      },
    ],
  ],
});
