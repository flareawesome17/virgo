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
| Owner scoping | `src/common/owned.repository.ts` | Replaces database-level RLS. See below |
| Auth | `src/auth/` | JWT access token + rotating hashed refresh token |

### Owner scoping replaces Row Level Security

The previous backend enforced `auth.uid() = user_id` policies in the database:
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

### Profiles

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/profiles/:handle` | A published profile, for any signed-in account. One 404 for missing, unpublished, paused, suspended or blocked either way. Exactly: `handle, displayName, avatarUrl, coverUrl, title, bio, location, website, studioName, roles, memberSince, availableForBookings, stats {connections, jobsDone}, mutualConnections, viewer {isSelf, connection, friendId}, portfolio`. Never an id, email, phone or address; `studioName` only with the studio switched on. |
| GET | `/me/profile/page` | The caller's own page, published or not: the public presentation plus `handle` (nullable), `published` and `portfolioHidden`. No viewer, mutual or visit data. |
| PATCH | `/me/profile/cover` | `{ key }` from a confirmed `covers` upload. The server builds the URL; 400 `COVER_NOT_READY` for anything it did not re-encode. Replaces and deletes the previous cover. |
| DELETE | `/me/profile/cover` | Clears the cover and deletes its object. Idempotent. |
| PATCH | `/auth/me` | Also takes `availableForBookings` and `showStudio` (booleans). Never `coverUrl`. |

Portfolio images on any public payload are the signed 640 px WebP thumbnail
(`url`) plus `displaySources` on the media host, never the original: the
thumbnail is a re-encode, so the camera's EXIF and GPS do not survive it. A
photograph with no thumbnail is left out. `GET /me/portfolio` alone falls back
to the original, for the owner's editor, and flags it `publiclyShown: false`.
Adding a photograph makes its thumbnail first, or refuses it with
`PORTFOLIO_NO_WEB_COPY` / `PORTFOLIO_TOO_LARGE`.

The album gallery a portfolio card opens (`/s/:token` with a portfolio link)
shows renditions only: no original, no download link, no zip, no original
filename and no sizes.

### Storage: avatars and covers

Scopes `avatars` and `covers` upload to the public bucket at a permanent CDN
URL; everything else is private and signed. Confirm re-encodes both in place
as WebP (avatars 512 px, covers 2048 px), always, because the re-encode is what
strips EXIF and GPS, and deletes and refuses one it cannot re-encode
(`AVATAR_UNUSABLE`, `COVER_UNUSABLE`). Covers take JPEG, PNG, WebP or AVIF up
to 15 MB and need `CDN_BASE_URL`; avatars take still image types up to 40 MB.

**Both buckets must keep only the last version of a file.** The in-place
re-encode overwrites the original, and a delete sends no version id, so on a
bucket that keeps every version the camera original survives as a hidden
prior version and nothing is ever really deleted. Check with
`node scripts/check-bucket-access.mjs`, which prints each bucket's version
policy, or in the B2 console under Buckets → Lifecycle Settings. Setting it is
a console action.

`POST /storage/delete` and `/storage/delete-many` refuse the object
`users.cover_url` names with 409 `COVER_IN_USE`, and a selection holding it is
refused whole. The app deletes a cover it has just uploaded when the save is
refused, and a save whose answer was lost looks refused while having landed;
deleting then would leave a published profile pointing at nothing. Taking a
cover off is `DELETE /me/profile/cover`, which deletes its object too.

`POST /storage/wipe` and account deletion delete the cover by the URL the
profile holds, whether or not a `user_files` row still tracks it, and clear
`cover_url` only once the bucket confirms the object gone.

An upload ticket refused for want of room answers 403 with
`code: 'STORAGE_FULL'` beside its sentence, so a client can put its own
storage-full copy in front of somebody. The sentence says whose storage it is:
uploading into somebody else's album spends theirs.

### What a thumbnail may cost

Every derivative is made on the request that confirms the upload, so the work
each one may do is bounded:

- a GIF's thumbnail moves only up to 300 frames and 100 megapixels, all frames
  counted; past either it is a still of the first frame, cut from the file
  without decoding the rest;
- an iPhone HEIC is decoded by ffmpeg, refused above 100 megapixels of header,
  and given 15 seconds on a request (`scripts/backfill-thumbnails.mjs` allows
  two minutes, having nobody waiting);
- at most two ffmpeg or animated decodes run at once in the process;
- a confirm sent again for a file already processed makes nothing a second
  time, and one sent while the first is still running waits for it;
- unpacked stills a killed container left in the temp folder are collected at
  the next start.

### Profile pages release (P3)

Run on the production host, from `C:\VirgoProduction`. Nothing in the
pipeline changes: this reuses its own `run --rm --no-deps api` form.

1. Publish the release as a **prerelease**. It builds the image; the poller
   skips prereleases, so nothing deploys yet.
2. Read-only checks, on the production database:
   - (a) `select handle from users where lower(handle) in ('feed','showcase','showcases','connections');` — any holder keeps their handle.
   - (b) `select count(*) from user_files where key ~ '^users/[^/]+/covers/';` — expect 0.
   - (d) `show timezone;` — expected UTC; jobsDone does not depend on it.
   - (e) `select count(*) from job_bookings where creative_confirmed_at is not null and cancelled_at is null and event_date < (now() at time zone 'Asia/Manila')::date;`
   - (f) `select content_type, count(*) from user_files where key ~ '^users/[^/]+/avatars/' and content_type <> 'image/webp' group by 1;` — avatars stored before they were always re-encoded (their re-encode is a follow-up).
   - (g) `docker exec virgo-api ffmpeg -hide_banner -version` — the new image
     is built on the same base; for its own, run the same through
     `run --rm --no-deps api` with `IMAGE_TAG` set as in (h).
   - (h) the bucket version policy, from the new image:
     `$env:IMAGE_TAG='<tag>'; docker compose -f docker-compose.prod.yml run --rm --no-deps api node scripts/check-bucket-access.mjs; Remove-Item Env:IMAGE_TAG`.
     Both buckets must read "keeps only the last version" before the app
     release that ships covers.
3. Give every photograph on a public profile its thumbnail, from the new image:
   ```powershell
   $env:IMAGE_TAG='<tag>'
   docker compose -f docker-compose.prod.yml pull api
   docker compose -f docker-compose.prod.yml run --rm --no-deps api node scripts/backfill-thumbnails.mjs --portfolio --dry-run
   docker compose -f docker-compose.prod.yml run --rm --no-deps api node scripts/backfill-thumbnails.mjs --portfolio
   Remove-Item Env:IMAGE_TAG
   ```
   Both runs end by listing every photograph still without a thumbnail, by
   key with its type and size, and exit 1 while there is any. After the dry
   run that only means the real run is still to do; after the real run the
   list is what holds the release.
4. Checks (c) and (c') must return no rows:
   - (c) `select f.content_type, f.processing_status, f.size_bytes > 40*1024*1024 as over_40mb, f.blur_data_url is not null as has_preview, count(*) as images, count(distinct p.user_id) as owners from portfolio_items p join user_files f on f.key = p.file_key and f.user_id = p.user_id and f.content_type like 'image/%' where p.kind = 'image' and f.thumb_key is null group by 1,2,3,4 order by images desc;`
   - (c') `select f.content_type, f.processing_status, count(*) as images from album_share_links l join user_files f on f.album_id = l.album_id and f.user_id = l.user_id and f.content_type like 'image/%' where l.purpose = 'portfolio' and l.revoked_at is null and f.thumb_key is null group by 1,2 order by images desc;`

   If HEIC rows stay `failed`, hold the release: (g) will show an ffmpeg too
   old for HEIF grids (7.1 is the inferred minimum). Pin the runtime base in
   `api/Dockerfile` to an Alpine whose ffmpeg is new enough; do not ship
   around it.
5. Promote the release to a full release, so the poller deploys it.
6. Once it is live, catch anything added through the old API in between, and
   re-check (c) and (c'):
   `docker compose -f docker-compose.prod.yml exec api node scripts/backfill-thumbnails.mjs --portfolio`

**After a rollback.** An image from before this release sends a cover's
delete to the private bucket, where it reports success, forgets the row and
leaves the public object. One the profile still names goes with the account's
next wipe or deletion, which works from `users.cover_url` rather than from the
row. The rest — an account already deleted through the old image, or a cover
replaced by it — is nobody's to find but this: if production ran an older
image after the app started shipping covers, run
`docker compose -f docker-compose.prod.yml exec api node scripts/audit-bucket-objects.mjs`
once this release is back, and delete each listed orphaned cover from the
public bucket in the B2 console.

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
