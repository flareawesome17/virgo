# Virgo

A network and workspace for photographers, videographers, editors, HMUAs and
coordinators in the Philippines. Find people near you, run the shoot together,
and deliver to clients with links that open without an account.

```
├── api/         NestJS + raw Postgres. The only thing that talks to the database.
├── web/         Next.js 16. virgo.ph (public) and web.virgo.ph (the app).
├── mobile/      Expo 54. iOS and Android.
├── dashboard/   Next.js 16. console.virgo.ph — the management console.
└── scripts/     Repo-wide checks. `check-client-sync.mjs` is the important one.
```

## The stack

**Postgres, reached only through `api/`.** No ORM, no schema-as-code, no
row-level security: authorisation is enforced in the service layer, and
`api/src/common/owned.repository.ts` is where that happens. The schema is plain
SQL in `api/migrations/*.sql`, numbered, applied in order on boot by
`api/src/database/migrator.ts`. That directory is the single source of truth —
there is no generated types file and nothing to keep in sync with it by hand.

**Media lives in Backblaze B2**, in two buckets: avatars are public, everything
else is private and served through presigned URLs. Uploads go straight from the
device to the bucket; file bytes never pass through the API.

**Payments are PayMongo**, in pesos. Nothing is purchasable during the
pre-release.

## Hostnames

| Host | Serves | Notes |
| --- | --- | --- |
| `virgo.ph` | `web/` marketing | The only indexed surface |
| `web.virgo.ph` | `web/` app | Behind sign-in, `noindex` |
| `client.virgo.ph` | `api/` `/s/:token` | Client delivery. **The token is the credential** |
| `console.virgo.ph` | `dashboard/` | Management console, separate credentials |
| `api.virgo.ph` | `api/` | |

Routing is Cloudflare Tunnel, configured in the Cloudflare dashboard — **not in
this repo**. A new hostname needs a dashboard change *and* a `CORS_ORIGINS`
entry.

## Two clients, one contract

`src/api/**` and `src/hooks/**` are duplicated byte-for-byte between `web/` and
`mobile/`. This is deliberate — the packages are independent and neither is a
workspace of the other.

```bash
node scripts/check-client-sync.mjs
```

It fails the moment the two drift. **Change both, or change neither.** Shipping
a fix to one client only is the most common defect this project has had.

## Running it

Everything is containerised from `api/docker-compose.yml`:

```bash
docker compose -f api/docker-compose.yml up -d
```

Web edits are invisible until the image is rebuilt — `docker compose build web`
then `up -d web`. The same goes for `dashboard` and `api`.

For the mobile app, `npm --prefix mobile start`.

## The console

`dashboard/` has its own accounts, its own signing key (`ADMIN_JWT_SECRET`, with
no fallback to the app's) and its own JWT audience. A Virgo account cannot sign
in to it and a console token is refused by the app. Roles and permissions are in
`api/src/admin/rbac.ts`.

The first owner is seeded from `ADMIN_EMAIL_SEED` on boot with a generated
password printed once to the API log, and must be changed on first sign-in.
