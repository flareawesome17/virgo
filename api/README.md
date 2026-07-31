# Virgo API

NestJS + PostgreSQL REST API. The mobile app talks to this over HTTP only — it
has no database connection of its own.

## Quick start

```bash
cp .env.example .env
# generate two different secrets and paste them into .env
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

npm install
npm run db:up      # starts Postgres 17 in Docker on host port 5433
npm run dev        # migrations run automatically outside production
```

`GET http://localhost:3000/health` should return `{"status":"ok","database":"ok"}`.

## Architecture

| Concern | Where | Notes |
| --- | --- | --- |
| Schema | `migrations/*.sql` | Plain SQL, applied in filename order, tracked in `schema_migrations` |
| DB access | `src/database/database.service.ts` | `pg` pool. No ORM — SQL is the source of truth |
| Owner scoping | `src/common/owned.repository.ts` | Replaces Supabase RLS. See below |
| Auth | `src/auth/` | JWT access token + rotating hashed refresh token |

### Owner scoping replaces Row Level Security

Under Supabase, `auth.uid() = user_id` policies were enforced by the database:
every query was filtered regardless of what the caller did. Vanilla Postgres has
no such guarantee here, so `OwnedRepository` reconstructs it — every method takes
`userId` first and every generated statement carries `where user_id = $n`.

**Owned tables must be reached through `OwnedRepository`.** A hand-written query
that forgets the predicate is a cross-tenant data leak with nothing behind it to
catch the mistake. Foreign keys do not help: they prove a referenced row exists,
not that the caller owns it, which is why `AlbumsService` and friends verify
workspace ownership explicitly before insert.

If you later want defence in depth, Postgres RLS can be layered back on by
connecting as a non-superuser role and issuing `SET LOCAL app.user_id` inside
`DatabaseService.transaction`. That was left out for now to keep pooling simple.

## Endpoints

All routes require `Authorization: Bearer <accessToken>` except those marked public.

### Auth

| Method | Path | Public | Body |
| --- | --- | --- | --- |
| POST | `/auth/register` | yes | `{ email, password, displayName? }` |
| POST | `/auth/login` | yes | `{ email, password }` |
| POST | `/auth/refresh` | yes | `{ refreshToken }` |
| POST | `/auth/logout` | yes | `{ refreshToken }` → 204 |
| GET | `/auth/me` | no | — |

Register and login return `{ user, accessToken, refreshToken, expiresIn }`.

### Resources

Identical CRUD shape for `workspaces`, `albums`, `schedule-events`,
`collaborators`, `reminders`, `friends`:

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/{resource}` | `?limit&offset&orderBy&direction` plus per-resource filters. Returns `{ data, total }` |
| GET | `/{resource}/:id` | 404 if absent **or** owned by someone else |
| POST | `/{resource}` | `id` optional — supply one or the server generates a UUID |
| PATCH | `/{resource}/:id` | Partial update |
| DELETE | `/{resource}/:id` | 204 |

Per-resource filters: `albums` → `workspace_id`, `status`; `schedule-events` →
`workspace_id`, `event_type`, plus `from`/`to` for a date-range view;
`collaborators` → `workspace_id`, `role`; `reminders` → `schedule_event_id`,
`is_completed`; `friends` → `status`, `requested_by`.

### Upstream proxies

`POST /chat`, `/chat/stream`, `/send-email` (authenticated), and
`/auth/google/authorize-url`, `/auth/google/verify` (public). Ported from the
previous Express server. Note these now require a token where they previously
did not — unauthenticated, they let anyone spend your OpenRouter and Resend
credits.

## Migrations

```bash
npm run migrate     # apply pending
npm run db:reset    # destroy the volume and start clean
```

Add a new one as `migrations/00N_description.sql`. They run inside a transaction
each, so a failure leaves the database on the last fully-applied migration.

Production should run `npm run migrate` as a release step rather than relying on
boot-time auto-migration, which races when several instances start at once.

## Deployment notes

Do **not** use an embedded Postgres. It lives inside the API process, so two API
instances become two divergent databases — a user who registers on one cannot
log in on the other. Use a managed Postgres and set `DATABASE_SSL=require`.
