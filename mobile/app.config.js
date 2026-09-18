/**
 * Layered on top of app.json, which stays the source of truth for everything
 * static. Expo merges the two — app.json arrives here as `config`, and what is
 * returned is the final manifest.
 *
 * Nothing in here may depend on the environment. The evaluated config feeds
 * the fingerprint that becomes the runtime version, and EAS compares the one
 * computed on the machine that started a build with the one computed on its
 * own builder; a mismatch fails the build. The first iOS build failed exactly
 * that way: cleartext was keyed on EAS_BUILD_PROFILE, which the builder sets
 * and the local calculation never sees. The same mismatch would also stop an
 * `eas update` published from a laptop from reaching any build.
 */

/**
 * Cleartext HTTP stays off in every build. Android 9 and later block it by
 * default, and nothing needs it now: the development profile points at
 * https://virgo-dev-api.virgo.ph, and Expo Go applies its own policy rather
 * than this one. A local native build against a plain-HTTP API on the LAN can
 * flip it for that build — never in a commit.
 */
const USES_CLEARTEXT_TRAFFIC = false;

/** The App Store listing, for the "Rate Virgo" row in Settings. */
const APP_STORE_URL = 'https://apps.apple.com/app/id6813545420?action=write-review';

module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    infoPlist: {
      ...(config.ios?.infoPlist ?? {}),
      UIBackgroundModes: [
        ...new Set([...(config.ios?.infoPlist?.UIBackgroundModes ?? []), 'audio']),
      ],
    },
    appStoreUrl: APP_STORE_URL,
  },
  plugins: [
    ...(config.plugins ?? []).filter((plugin) =>
      Array.isArray(plugin)
        ? plugin[0] !== 'expo-build-properties'
        : plugin !== 'expo-build-properties',
    ),
    [
      'expo-build-properties',
      {
        android: {
          usesCleartextTraffic: USES_CLEARTEXT_TRAFFIC,
        },
      },
    ],
  ],
});
