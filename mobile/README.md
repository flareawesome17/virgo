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

## Push notifications

Not working yet. `app.json` has no `extra.eas.projectId`, so `push_tokens` is
empty and nothing can be delivered. Needs `eas init` and a development build —
Expo Go cannot receive remote push on current SDKs.

See `CLAUDE.md` for conventions.
