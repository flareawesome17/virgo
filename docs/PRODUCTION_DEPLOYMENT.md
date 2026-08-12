# Production deployment

**GitHub builds Virgo. The production host only pulls and runs it.**

Publishing a GitHub Release builds three images and pushes them to GHCR tagged
with the release. The production machine picks a tag, pulls, and starts. It
never compiles anything, so it cannot drift from the release it claims to run.

The host is Windows with Docker Desktop; commands below are PowerShell.

---

## What a release produces

| Image | From | Runs |
| --- | --- | --- |
| `ghcr.io/flareawesome17/virgo-api:<tag>` | `api/` | NestJS API, port 3000 |
| `ghcr.io/flareawesome17/virgo-web:<tag>` | `web/` | Next.js app, port 3000 |
| `ghcr.io/flareawesome17/virgo-dashboard:<tag>` | `dashboard/` | Admin console, port 3002 |

Postgres, pgAdmin and cloudflared come from their own upstream images and are
**not** tagged with the release. A Virgo version does not imply a Postgres
version, and tying them together would drag the database engine backwards on
every application rollback.

**The mobile app is not here.** It ships through EAS to the app stores; there
is no server to run it on.

---

## What happens when you publish `v1.0.0`

1. `.github/workflows/release.yml` triggers on `release: [published]`.
2. It checks out **the release tag**, not the default branch.
3. Three jobs build in parallel, one per image.
4. Each pushes to GHCR as `<image>:v1.0.0`, authenticating with the token
   GitHub Actions provides for the run — no personal access token exists in
   the repository.
5. A final job fails the run unless all three succeeded, so a green tick means
   the release is actually deployable rather than partly built.

Rebuilding a release without cutting a new tag: run the workflow manually from
the Actions tab and type the existing tag.

---

## Before the first release

Four things must be true before `v1.0.0` is published. Hostname roles and the
full audit are in [DOMAINS.md](DOMAINS.md).

1. **`CORS_ORIGINS` is set in the production `.env`.** The API refuses to boot
   without it when `NODE_ENV=production` — deliberately, because the old
   fallback reflected whatever origin asked. Set it to the hostnames that
   actually call the API:

   ```env
   CORS_ORIGINS=https://web.virgo.ph,https://virgo.ph,https://www.virgo.ph,https://console.virgo.ph
   ```

2. **`POSTGRES_DB=virgo_prod`.** There is no default in production — a missing
   value stops the stack rather than inventing a name. Development is
   `virgo_dev`, on a different host and volume.

3. **GitHub Repository Variables are set.** `NEXT_PUBLIC_*` values are baked
   into the image at build time, so changing one later means rebuilding and
   re-releasing. The list is in [DOMAINS.md](DOMAINS.md#public-build-time-variables).

4. **The production tunnel exists and owns the hostnames.** The routes today
   belong to the development machine's tunnel. Production needs its **own**
   tunnel — not a copy of the same token, which would make both machines
   connectors for one tunnel and have Cloudflare load-balance production
   traffic onto a laptop. The full procedure, including what development must
   be repointed at afterwards, is in [CUTOVER.md](CUTOVER.md).

   Also put Cloudflare Access in front of `db.virgo.ph` (required) and
   `console.virgo.ph` (recommended).

## First-time host setup

Docker Desktop must be installed and running.

### 1. Create the deployment folder

The full repository is **not** required on this machine. Two files are.

```powershell
New-Item -ItemType Directory -Force C:\VirgoProduction\backups, C:\VirgoProduction\logs, C:\VirgoProduction\scripts
```

Copy in:

- `docker-compose.prod.yml`
- `.env` — from `.env.production.example`, filled in

```text
C:\VirgoProduction\
├── docker-compose.prod.yml
├── .env
├── backups\
├── logs\
└── scripts\
```

### 2. Authenticate to GHCR

GHCR needs a token even for your own packages. Create a GitHub personal access
token with **`read:packages`** — read-only, because this machine only pulls.

```powershell
docker login ghcr.io -u YOUR_GITHUB_USERNAME
```

Paste the token as the password.

### 3. Fill in `.env`

Start from `.env.production.example`. Every variable it lists must be set, plus
the API's own configuration from `api/.env.example` — JWT secrets, SMTP,
Backblaze, PayMongo, CORS origins.

Two that decide whether the stack starts at all:

```env
IMAGE_TAG=v1.0.0
POSTGRES_PASSWORD=<a real password>
```

`docker-compose.prod.yml` uses `${VAR:?}` for these, so Compose refuses to
start rather than falling back to a default. That is deliberate: a default
password on a production database is how these end up compromised.

---

## First deployment

```powershell
cd C:\VirgoProduction
docker compose -f docker-compose.prod.yml pull
```

Then the database. **Run migrations as their own step, before starting the
API** — see [Database migrations](#database-migrations) for why.

```powershell
docker compose -f docker-compose.prod.yml up -d postgres
docker compose -f docker-compose.prod.yml run --rm api node dist/database/migrate-cli.js
```

Then the rest:

```powershell
docker compose -f docker-compose.prod.yml up -d
```

### Verify

```powershell
docker compose -f docker-compose.prod.yml ps
```

Every service should read `Up`, and `postgres` and `api` should read
`(healthy)`. Then check the API answers:

```powershell
curl.exe http://127.0.0.1:3001/health/ready
```

`{"status":"ready","database":"ok"}` means the API is up **and** talking to
Postgres. Then the public hostnames:

```powershell
curl.exe -o NUL -w "%{http_code}`n" https://api.virgo.ph/health/live
curl.exe -o NUL -w "%{http_code}`n" https://web.virgo.ph/
```

### Logs

```powershell
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs --tail 100 web
```

Health state for one container:

```powershell
docker inspect virgo-api --format "{{.State.Health.Status}}"
```

---

## Rollback

Application containers only. Edit `.env`:

```env
IMAGE_TAG=v1.0.0
```

```powershell
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

> **This does not reverse database migrations.** If `v1.1.0` added a migration,
> rolling the containers back to `v1.0.0` leaves the new schema in place. That
> is safe when migrations are additive and unsafe when they are not — which is
> the whole reason for the expand/migrate/contract rule below.
>
> **Never restore the database as part of a container rollback.** Restoring
> loses every write since the backup. Roll the containers back first, confirm
> the schema is genuinely incompatible, and only then consider the database —
> as a deliberate, separate decision.

### Never on this host

```powershell
docker compose -f docker-compose.prod.yml down -v   # deletes virgo_pgdata
```

`-v` removes named volumes. `virgo_pgdata` is the production database and there
is no undo. Use `down` without it, or `stop`.

---

## Database migrations

**Virgo does not use Prisma.** Migrations are plain `.sql` files in
`api/migrations/`, applied in filename order by a custom runner that records
what it has applied.

### How it currently works

`api/src/main.ts` migrates on startup when `RUN_MIGRATIONS_ON_BOOT=true` **or**
`NODE_ENV !== 'production'`. The development stack sets it to `true`.

**Production sets it to `false`.** Migrations run as an explicit step:

```powershell
docker compose -f docker-compose.prod.yml run --rm api node dist/database/migrate-cli.js
```

The compiled runner ships in the image. Note it is `node dist/...`, not
`npm run migrate` — that script uses `ts-node`, a dev dependency that the
production image deliberately does not contain.

This is the one behavioural change this phase makes to how the application
runs, and it is the important one. With migrations inside startup, `up -d`
silently changes the schema, and a rollback of the containers cannot undo it.
Separating them means a deploy that fails at the migration step fails before
anything is serving the new code.

### Recommended order

```text
back up the database
        ↓
run the migration step
        ↓
start the application
```

Backup, before any release that migrates:

```powershell
docker exec virgo-postgres pg_dump -U virgo -d virgo -F c -f /tmp/virgo.dump
docker cp virgo-postgres:/tmp/virgo.dump C:\VirgoProduction\backups\virgo-$(Get-Date -Format yyyyMMdd-HHmmss).dump
```

### Write migrations expand → migrate → contract

Container rollback cannot reverse a schema change, so schema changes should be
survivable by the previous release:

1. **Expand** — add the new column/table. Nullable, or with a default. The old
   code ignores it and keeps working.
2. **Migrate** — backfill, and ship the code that uses it.
3. **Contract** — drop the old column, in a *later* release, once the version
   that needed it is no longer something you would roll back to.

A migration that renames or drops in one step makes rollback impossible: the
old image expects a column that no longer exists.

`prisma migrate reset` does not apply here — there is no Prisma — but the same
rule holds for the equivalent: never run a migration that drops data against
production without a backup taken in the same session.

---

## What is deliberately not automated yet

This phase is manual on purpose. Not yet built:

- automatic release polling or webhook deploys
- automatic rollback on failed health checks
- blue/green or zero-downtime switching
- database backup automation and restore
- smoke tests after deploy

### Known constraints for later

- **Fixed container names.** Every service sets `container_name`, so two
  versions cannot run side by side — blue/green needs those removed, and the
  Cloudflare tunnel routes and any scripts referencing `virgo-api` updated with
  them. Kept for this phase because the tunnel, pgAdmin's saved server and the
  operational commands above all address containers by name.
- **Scheduled jobs run inside the API.** Six `@Cron` jobs — reminder dispatch
  every minute, retention sweeps overnight — run in-process. Two API containers
  means two of every job, and the reminder dispatcher sends push
  notifications, so that is duplicate messages to real people. Running more
  than one API replica needs those moved out or leader-elected first.
- **`NEXT_PUBLIC_*` is baked at build time.** `virgo-web:v1.0.0` has its API URL
  compiled into the JavaScript. The same image cannot be pointed at a different
  API by changing an environment variable; a staging environment needs its own
  build. The workflow reads `vars.PROD_API_URL`, defaulting to
  `https://api.virgo.ph`.
- **pgAdmin on a public hostname.** Its own login is the only thing in front of
  a full read/write console on the production database. Put Cloudflare Access
  on `db.virgo.ph`.
