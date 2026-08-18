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
 * down. The development build points at an API on the LAN, which is
 * http://<ip>:3001 and cannot be anything else — there is no certificate for
 * a private address.
 *
 * So cleartext is granted to the profiles that genuinely need it, rather than
 * withheld from the one that obviously must not have it. Preview used to point
 * at the development tunnel and now points at https://api.virgo.ph, and an
 * allow-list is what keeps a change like that from quietly leaving a build
 * willing to be downgraded to plain HTTP months after it stopped needing to be.
 *
 * EAS sets EAS_BUILD_PROFILE from the --profile flag. Undefined locally, which
 * is permissive, and correct — a local run is development.
 */
const profile = process.env.EAS_BUILD_PROFILE;
const allowsCleartext = profile === undefined || profile === 'development';
const iosAppStoreId = process.env.EXPO_PUBLIC_IOS_APP_STORE_ID;

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
    ...(iosAppStoreId
      ? { appStoreUrl: `https://apps.apple.com/app/id${iosAppStoreId}?action=write-review` }
      : {}),
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
          usesCleartextTraffic: allowsCleartext,
        },
      },
    ],
  ],
});
