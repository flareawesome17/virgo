# Domain responsibilities

Eight hostnames. Seven are production, one is development-only. None is
redundant — the pairs that look like duplicates (`virgo.ph` / `web.virgo.ph`,
`api.virgo.ph` / `client.virgo.ph`) serve different audiences, and collapsing
either would break something.

Audited against the repository at `v1.0.0`. Where a row says "not referenced",
that means a full-tree search found nothing outside comments and documentation.

---

## Matrix

### `virgo.ph` — the public site

| | |
|---|---|
| **Purpose** | Marketing pages, public profiles (`/@handle`), the public job board (`/jobs`) |
| **Environment** | Production |
| **Target** | `web` container (Next.js), port 3000 |
| **Referenced** | [web/src/app/robots.ts](web/src/app/robots.ts), [sitemap.ts](web/src/app/sitemap.ts), [jobs/[slug]/page-client.tsx](web/src/app/(app)/jobs/[slug]/page-client.tsx:53), [u/[handle]/page-client.tsx](web/src/app/(app)/u/[handle]/page-client.tsx:27), [api/src/mail/mail.config.ts:65](api/src/mail/mail.config.ts:65) |
| **Variables** | `NEXT_PUBLIC_SITE_ORIGIN` (web build), `PUBLIC_SITE_URL` (API, for links in email) |
| **Required for v1.0.0** | Yes |
| **Security** | Public by design. Profiles are opt-in — an unpublished profile 404s. |
| **Cloudflare action** | None |

### `www.virgo.ph` — site alias

| | |
|---|---|
| **Purpose** | Alternate hostname for the same site |
| **Environment** | Production |
| **Target** | Same as `virgo.ph` |
| **Referenced** | Not referenced in application code. Handled at the edge. |
| **Variables** | None |
| **Required for v1.0.0** | Yes, if you advertise it |
| **Security** | Same as apex |
| **Cloudflare action** | Confirm it resolves — either its own tunnel route or a redirect rule to the apex. **Add it to `CORS_ORIGINS`** if the browser app is ever served from it. |

### `web.virgo.ph` — the browser version of the app

| | |
|---|---|
| **Purpose** | The authenticated Virgo application in a browser. **This is the web build of the mobile app, not a marketing page.** Workspaces, albums, chat, jobs, bookings, rewards. |
| **Environment** | Production |
| **Target** | `web` container, port 3000 |
| **Referenced** | [api/src/mail/mail.config.ts:61](api/src/mail/mail.config.ts:61) — every verification, password-reset and invitation link lands here; [api/.env.example](api/.env.example) `CORS_ORIGINS` |
| **Variables** | `WEB_APP_URL` (API), `NEXT_PUBLIC_APP_ORIGIN` (web build) |
| **Required for v1.0.0** | **Yes — removing it breaks every link in every email.** |
| **Security** | Authenticated. Bearer tokens in `localStorage`, not cookies. |
| **Cloudflare action** | None |

> `virgo.ph` and `web.virgo.ph` both point at the `web` container because it is
> one Next.js app serving two route groups: public pages at the apex, the
> authenticated app under `(app)`. They are **not** interchangeable — email
> links must use `web.virgo.ph` (an authenticated destination), and profile and
> job links must use `virgo.ph` (readable signed-out). Do not add a redirect
> between them.

### `api.virgo.ph` — the API

| | |
|---|---|
| **Purpose** | Every REST call and the WebSocket (`/ws`) |
| **Environment** | Production |
| **Target** | `api` container (NestJS), port 3000 |
| **Referenced** | [web/src/api/config.ts](web/src/api/config.ts), [mobile/src/api/config.ts](mobile/src/api/config.ts), [.github/workflows/release.yml:110](.github/workflows/release.yml:110) |
| **Variables** | `NEXT_PUBLIC_API_URL` (web + dashboard builds), `EXPO_PUBLIC_API_URL` (mobile), `WEB_API_URL` (compose build arg) |
| **Required for v1.0.0** | Yes |
| **Security** | `CORS_ORIGINS` allow-list, now **required in production** — the API refuses to boot without it rather than reflecting any origin. Rate limited on `CF-Connecting-IP`. |
| **Cloudflare action** | None |

### `client.virgo.ph` — public client delivery

| | |
|---|---|
| **Purpose** | Album share links sent to a photographer's clients: `client.virgo.ph/s/<token>`. **Intentionally reachable with no Virgo account.** |
| **Environment** | Production |
| **Target** | `api` container — the gallery is server-rendered by the API |
| **Referenced** | [api/src/albums/share/album-share.service.ts](api/src/albums/share/album-share.service.ts) (`urlFor`), [album-share.controller.ts:131](api/src/albums/share/album-share.controller.ts:131), [api/src/visits/visits.service.ts:11](api/src/visits/visits.service.ts:11) |
| **Variables** | `CLIENT_DELIVERY_URL`, falling back to `PUBLIC_APP_URL` (the name the running stack uses) |
| **Required for v1.0.0** | **Yes — this is how deliverables reach clients.** |
| **Security** | See below |
| **Cloudflare action** | None |

**Delivery security, audited:**

- Token is `randomBytes(32).toString('base64url')` — **256 bits**, not enumerable.
- `linkFor()` is the single gate, shared by the gallery page and the zip
  download, so a revoked token cannot still be downloadable through the other
  route. It requires: the token exists, `revoked_at is null`,
  `expires_at is null or expires_at > now()`, and the album still exists (inner
  join).
- Files are scoped in SQL to the link's own `user_id` **and** `album_id`, and
  further to the link's `media_kinds` — a photos-only link never puts video
  URLs on the wire.
- Media is served by short-lived signed URLs, not public objects.
- Revoked, expired and never-existed all return the same 403, so the response
  cannot be used to confirm which tokens are real.
- The page runs `script-src 'none'`.
- Visit analytics deliberately record `/s` and drop the token, which is the
  credential.

**Known limitation, accepted for v1.0.0:** `client.virgo.ph` resolves to the
same API container as `api.virgo.ph`, so the authenticated API surface is
reachable on that hostname too. It is not *exposed* by it — every route still
requires its own bearer token — but a dedicated public-delivery surface, or a
Cloudflare rule restricting `client.virgo.ph` to `/s/*`, would be the tighter
arrangement. Worth doing after v1.0.0; not a release blocker.

### `console.virgo.ph` — admin console

| | |
|---|---|
| **Purpose** | Management console: users, content, billing, support, promos, audit |
| **Environment** | Production |
| **Target** | `dashboard` container, port **3002** (not 3000) |
| **Referenced** | [api/src/admin/admin.controller.ts:167](api/src/admin/admin.controller.ts:167) (`CONSOLE_URL`), [docker-compose.prod.yml](docker-compose.prod.yml) |
| **Variables** | `CONSOLE_URL` (API, for console emails), `NEXT_PUBLIC_API_URL` (build) |
| **Required for v1.0.0** | Yes |
| **Security** | Own account table, own signing key, own guard, RBAC per route, full audit log. Separate from app authentication entirely. |
| **Cloudflare action** | **Recommended:** put Cloudflare Access in front of it, same as `db.virgo.ph`. Console credentials are the only thing between the internet and every user's data. |

### `db.virgo.ph` — pgAdmin

| | |
|---|---|
| **Purpose** | Database administration UI |
| **Environment** | Production |
| **Target** | `pgadmin` container, port 80 |
| **Referenced** | Comments in both compose files only. No application code. |
| **Variables** | `PGADMIN_EMAIL`, `PGADMIN_PASSWORD` |
| **Required for v1.0.0** | No — optional convenience. Safe to leave the tunnel route unmapped until needed. |
| **Security** | **The weakest hostname.** pgAdmin login is the only gate today. |
| **Cloudflare action** | **Required before v1.0.0 — see below.** |

**PostgreSQL itself is not exposed.** Both compose files bind Postgres to
`127.0.0.1:5432` and the tunnel has no route to port 5432. `db.virgo.ph` reaches
pgAdmin over HTTP; pgAdmin reaches Postgres over the compose network. The target
shape:

```
Internet → Cloudflare → Cloudflare Access → pgAdmin login → PostgreSQL
```

Only the middle step is missing.

### `mobile-dev.virgo.ph` — development bridge (development only)

Replaced `dev.virgo.ph`, which is no longer routed.

| | |
|---|---|
| **Purpose** | Metro/Expo bundler tunnel, so a physical phone can reach the dev machine when `localhost` is not usable and the Wi-Fi has client isolation |
| **Environment** | **Development only** |
| **Target** | `host.docker.internal:8081` (Metro), via the development tunnel |
| **Referenced** | `mobile/.env` → `EXPO_PACKAGER_PROXY_URL`, and `CORS_ORIGINS` in `api/.env` so Expo Web served through the tunnel can call the API. No deep link, no webhook, no OAuth callback, no production config. |
| **Variables** | `EXPO_PACKAGER_PROXY_URL`, `CORS_ORIGINS` |
| **Required for v1.0.0** | No — and it must not appear in any production configuration |
| **Security** | Exposes a bundler, not data. Keep it off when not actively developing on a device. |
| **Cloudflare action** | None. Keep the route; it costs nothing when Metro is not running. |

**Confirmed a development bridge only.** Preserved.

### `virgo-dev-api.virgo.ph` — development API (development only)

| | |
|---|---|
| **Purpose** | The development API, reachable from a phone that is not on the LAN. Also what lets Expo Web over the tunnel avoid a mixed-content block — an `https://` page cannot call an `http://` LAN address. |
| **Environment** | **Development only** |
| **Target** | `http://api:3000` on the development tunnel |
| **Referenced** | `EXPO_PUBLIC_API_URL` in `mobile/.env` and in the `development` and `preview` profiles of `mobile/eas.json`. Not in `CORS_ORIGINS` — the API is not a browser origin for itself. |
| **Variables** | `EXPO_PUBLIC_API_URL` |
| **Required for v1.0.0** | No — production uses `api.virgo.ph` |
| **Security** | Serves real development data. It is a separate database from production, but it is still an open endpoint on the internet whenever the tunnel is up. |
| **Cloudflare action** | Keep on the development tunnel only. It must never be added to production's. |

---

## Environment split

Development serves the same four applications on ports instead of hostnames.
`<LAN>` is the development machine's address on the network; those bindings
exist only while `DEV_BIND=0.0.0.0`.

| Production | Development | Also reachable as |
|---|---|---|
| `virgo.ph`, `www.virgo.ph`, `web.virgo.ph` | `http://localhost:3005`, `http://<LAN>:3005` | — |
| `api.virgo.ph` | `http://localhost:3001`, `http://<LAN>:3001` | `https://virgo-dev-api.virgo.ph` (tunnel) |
| `client.virgo.ph` | `http://localhost:3001` — share pages are served by the API | — |
| `console.virgo.ph` | `http://localhost:3002`, `http://<LAN>:3002` | — |
| `db.virgo.ph` | `http://localhost:5050` — **localhost only**, bound to `127.0.0.1` rather than `DEV_BIND`, deliberately | — |
| *(no equivalent)* | `http://localhost:8081`, `http://<LAN>:8081` — Metro/Expo Web | `https://mobile-dev.virgo.ph` (tunnel) |

Every development origin that a browser loads a page from is listed in
`CORS_ORIGINS` in `api/.env`. The two tunnel hostnames are why that list needs
`https://` entries at all — an `https://` page cannot call an `http://` LAN
address without the browser blocking it as mixed content.

Neither direction falls back to the other:

- Development never resolves to a production domain. Local URLs come from
  `NEXT_PUBLIC_API_URL` / `EXPO_PUBLIC_API_URL` in the local `.env`.
- Production never resolves to a development hostname. `mobile-dev.virgo.ph`
  and `virgo-dev-api.virgo.ph` live on the development tunnel only, and must
  never be added to production's.
- The API's production defaults name production hosts, so a *missing* variable
  degrades to the right hostname rather than to a development one.

## Databases

| | Development | Production |
|---|---|---|
| Database | `virgo_dev` | `virgo_prod` |
| Host | dev machine | production host |
| Volume | `virgo_pgdata` (dev compose project) | `virgo_pgdata` (prod compose project) |
| Default if unset | `virgo_dev` | **none — refuses to start** |
| Migrations | `RUN_MIGRATIONS_ON_BOOT=true` | `RUN_MIGRATIONS_ON_BOOT=false` |

Separate hosts, separate compose projects, separate volumes. The asymmetric
defaults are the point: a dev stack with no `POSTGRES_DB` lands somewhere
harmless; a production stack with no `POSTGRES_DB` will not boot.

**Redis: there is none.** No Redis, no queue library, no external cache anywhere
in the repo — the six scheduled jobs run in-process via `@Cron`. Nothing to
isolate. If Redis is introduced later, it needs the same split.

## Release and migration

Unchanged, and verified:

```
Merge → Publish GitHub Release → Actions builds GHCR images → production DB untouched
```

`.github/workflows/release.yml` builds and pushes three images and does nothing
else — it has no deploy step, no SSH, no database access. Production migrations
are a separate, explicit act on the production host:

```powershell
docker compose -f docker-compose.prod.yml run --rm api node dist/database/migrate-cli.js
```

## Public build-time variables

Baked into the image at build time, so they must be set as **GitHub Repository
Variables** before publishing `v1.0.0` — changing them later means a rebuild.

**Every one has a correct production default in the workflow**, so a release cut
before any of them is set still produces a correct production image. Set them
only to point a fork or a staging build somewhere else.

| Repository variable | Default if unset | Becomes |
|---|---|---|
| `PROD_API_URL` | `https://api.virgo.ph` | `NEXT_PUBLIC_API_URL` |
| `PROD_SITE_ORIGIN` | `https://virgo.ph` | `NEXT_PUBLIC_SITE_ORIGIN` |
| `PROD_APP_ORIGIN` | `https://web.virgo.ph` | `NEXT_PUBLIC_APP_ORIGIN` |
| `POSTHOG_KEY` | *(empty — analytics off)* | `NEXT_PUBLIC_POSTHOG_KEY`. A PostHog **project** key is publishable by design. |
| `POSTHOG_HOST` | `https://us.i.posthog.com` | `NEXT_PUBLIC_POSTHOG_HOST` |

`NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY` is **not** a web build arg — no file under
`web/src` reads it. Checkout is server-side, so the publishable key never needs
to reach the browser bundle.

Audited: no secret is in a `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` variable. Every
one is a URL, a publishable key, or a mode flag. Secrets — `JWT_*`, `B2_*`,
`SMTP_*`, `PAYMONGO_SECRET_KEY`, `ADMIN_JWT_SECRET`, `POSTGRES_PASSWORD`,
`CLOUDFLARE_*` — are server-side only and reach the container through
`env_file`, never a build arg.

Mobile is not built by CI. Its `EXPO_PUBLIC_*` values come from `mobile/.env` at
EAS build time and must name production hosts for a store build.

---

## Manual Cloudflare actions

The repository does not manage Cloudflare — the tunnel authenticates with a
token and its routes live in the dashboard. Nothing here can change them, and
nothing should. These are for you to do by hand.

**Required before v1.0.0**

1. **Cloudflare Access on `db.virgo.ph`.** Zero Trust → Access → Applications →
   Add a self-hosted application for `db.virgo.ph`, policy "Allow" limited to
   your own email. Free on the plan the tunnel already uses. Without it,
   pgAdmin's own login is the only thing in front of the database.

**Recommended before v1.0.0**

2. **Cloudflare Access on `console.virgo.ph`.** Same shape. The console can read
   and change every account.

**Verify, do not change**

3. Confirm the routes still map as follows, and that **no route points at port
   5432**.

   **Production tunnel** — seven routes, on the production host's token:

   | Hostname | Service |
   |---|---|
   | `api.virgo.ph` | `http://api:3000` |
   | `web.virgo.ph` | `http://web:3000` |
   | `virgo.ph` | `http://web:3000` |
   | `www.virgo.ph` | `http://web:3000` (or a redirect rule to the apex) |
   | `client.virgo.ph` | `http://api:3000` |
   | `console.virgo.ph` | `http://dashboard:3002` |
   | `db.virgo.ph` | `http://pgadmin:80` |

   **Development tunnel** — two routes, on the development machine's token:

   | Hostname | Service |
   |---|---|
   | `mobile-dev.virgo.ph` | `http://host.docker.internal:8081` (Metro) |
   | `virgo-dev-api.virgo.ph` | `http://api:3000` |

   `dev.virgo.ph` was the development bridge before this split and is no longer
   routed anywhere.

4. **They are two tunnels, and that is the safety property.** Each machine's
   `.env` carries the token for the one it owns, both under the name
   `CLOUDFLARE_TUNNEL_TOKEN`. Two connectors started with the *same* token are
   replicas and Cloudflare load-balances between them, so booting the
   development stack with production's token would put a share of production's
   traffic on a laptop. Never copy `.env.production` to the development machine,
   and never copy `api/.env` to the production host.

**Optional, after v1.0.0**

5. A Cloudflare rule limiting `client.virgo.ph` to `/s/*` and `/api/share/*`,
   so the authenticated API surface is not merely unauthorised on that hostname
   but unreachable.
