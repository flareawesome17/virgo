# Virgo for web

The browser app. Next.js (App Router) + shadcn/ui, talking to the same NestJS
API in `../api` as the mobile app in `../mobile`.

## Running it

```bash
npm install
cp .env.example .env.local   # already points at http://localhost:3001
npm run dev
```

Then open http://localhost:3005. The API must be up (`cd ../api && docker compose up -d`)
and must list this origin in `CORS_ORIGINS`.

## What is shared with mobile

`src/api/` is the mobile app's typed API layer, copied verbatim except for
three files:

| File | Why it differs |
| --- | --- |
| `config.ts` | `NEXT_PUBLIC_API_URL` instead of `EXPO_PUBLIC_API_URL` |
| `tokens.ts` | `localStorage` instead of AsyncStorage, plus cross-tab sign-out |
| `endpoints/storage.ts` | `XMLHttpRequest` instead of `expo-file-system` — `fetch` still cannot report upload progress in any browser |

`src/hooks/` is likewise the mobile hooks, with `expo-location` replaced by the
Geolocation API and haptics replaced by a title-bar unread count, an optional
OS notification, and `navigator.vibrate` where it exists.

If you change one of these in `mobile/`, change it here too.

The legal text in `src/lib/legal-content.ts` is extracted from
`mobile/app/legal.tsx`. One product must not present two sets of terms.

## Required Backblaze B2 CORS rules

**Uploads from the browser do not work until the bucket allows them.**

The API issues a presigned `PUT` straight to B2 and the browser sends the file
there directly — so the *bucket* has to accept a cross-origin request, which is
separate from the API's own `CORS_ORIGINS`. Mobile has never needed this: it
uploads from native code, where CORS does not apply.

Without a rule the upload fails with `Failed to fetch` at the preflight, which
the UI reports as "Could not reach storage."

Add this to the bucket's CORS rules (B2 console → Bucket Settings → CORS Rules,
or via `b2 bucket update`):

```json
[
  {
    "corsRuleName": "virgoWebUpload",
    "allowedOrigins": ["https://web.virgo.ph", "http://localhost:3005"],
    "allowedOperations": ["s3_put", "s3_head", "s3_get"],
    "allowedHeaders": ["*"],
    "exposeHeaders": ["etag"],
    "maxAgeSeconds": 3600
  }
]
```

`s3_put` is the one that matters; `s3_head` and `s3_get` let the browser read
back an object directly rather than only through the CDN.

## Deployment

`web.virgo.ph` is served by the `web` service in `../api/docker-compose.yml`
and routed through the Cloudflare Tunnel:

- **Public hostname**: `web.virgo.ph`
- **Service**: `http://web:3000` — the container name, so traffic never leaves Docker

```bash
cd ../api && docker compose up -d --build web
```

`NEXT_PUBLIC_API_URL` is inlined at **build** time, not read at runtime, so it
is a Docker build argument (`WEB_API_URL` in `api/.env`). Changing the API URL
means rebuilding the image, not restarting the container.

## Layout

```
src/
  api/          typed client, shared with mobile
  hooks/        React Query wrappers, shared with mobile
  lib/          browser-side helpers (alerts, calendar, legal text)
  components/   app shell, shared pieces, and shadcn/ui in components/ui
  app/
    (auth)/     sign in, sign up, legal — no session required
    (app)/      everything behind the auth guard
```
