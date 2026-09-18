# Virgo — mobile

The Expo app. Talks to Virgo's own NestJS API over HTTP; there is no database
client here and no direct database access of any kind.

## Running it

```bash
npm install
npm start
```

Point it at an API with `EXPO_PUBLIC_API_URL` in `mobile/.env`. On a phone that
must be a hostname the device can actually reach — `localhost` is the phone
itself, and the development Wi-Fi has client isolation, so the LAN address does
not work either. Use the tunnel: `https://api.virgo.ph`.

## Shared with web

`src/api/**` and `src/hooks/**` are byte-identical to `web/`. Run
`node scripts/check-client-sync.mjs` from the repo root before pushing —
changing one client without the other is the defect this repo has hit most.

## Releasing

Builds run on EAS (project `flareawesome/virgo`), from this directory.

- **Android:** `eas build -p android --profile preview` for a test APK.
- **iOS:** `eas build -p ios --profile production`, then
  `eas submit -p ios --latest` to send it to TestFlight. The first run signs in
  to the Apple Developer account and lets EAS create the distribution
  certificate, provisioning profile and push key.

Plugins, permissions and the rest of `app.json` feed the runtime fingerprint,
so changing them needs a new store build — an OTA update only reaches binaries
with the same fingerprint. Remote push needs one of those builds too; Expo Go
cannot receive it.

See `CLAUDE.md` for conventions.
