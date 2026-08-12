# Automatic production deployment (Phase 2)

Phase 2 polls published GitHub Releases and upgrades the single active Virgo
application release on the Windows production host. It deliberately does not
implement blue/green deployment, multiple API replicas, database restore, or
Cloudflare route switching.

The first-install and upgrade paths remain separate:

- `prod-setup.ps1` is the tested, clean-host, first-install procedure.
- `deploy.ps1` upgrades an existing healthy production stack.
- `check-release.ps1` detects a newer release and calls `deploy.ps1`.

The production host still does not need the source tree or a build toolchain.
The release workflow publishes a small Windows worker ZIP alongside every
deployable release.

## Architecture

```text
Windows Scheduled Task (every 5 minutes)
        |
        v
check-release.ps1 ---- GitHub Releases API
        |               (published, non-draft, non-prerelease semver only)
        |                        |
        |                        v
        |              deployable marker release asset
        |              + all three GHCR manifests
        v
deploy.ps1
        |
        +-- exclusive deployment.lock file handle
        +-- PostgreSQL pg_dump backup
        +-- targeted api/web/dashboard pull
        +-- explicit migration runner
        +-- targeted application recreation
        +-- Docker health + readiness + smoke tests
        +-- atomic deployment-state.json update
        `-- application-only rollback on failure
```

`cloudflared` stays attached to the same Compose network. Its routes address
the stable service aliases `api`, `web`, and `dashboard`, so recreating those
single containers reconnects the same names without recreating the tunnel.
Postgres and pgAdmin are also excluded from normal application upgrades.

The API remains a single instance. Scheduled jobs run inside it; Phase 2 never
starts a second API replica.

## Production files

After installing the release asset, the production directory contains:

```text
C:\VirgoProduction\
|-- docker-compose.prod.yml
|-- .env
|-- prod-setup.ps1
|-- deploy.ps1
|-- check-release.ps1
|-- initialize-deployment.ps1
|-- register-deployment-task.ps1
|-- set-github-token.ps1
|-- deployment-state.json
|-- deployment.lock
|-- backups\
|-- logs\
|-- scripts\
|   `-- Virgo.Deployment.psm1
`-- secrets\
    `-- github-releases-token.dpapi
```

`deployment.lock` is a lock file, but ownership is enforced by an exclusive
Windows file handle rather than by the timestamp written inside it. If the
worker crashes, Windows releases the handle. The stale file can then be opened
and reused by the next process; it does not block deployment by merely
existing.

## Deployable-release gate

Publishing a Release starts `.github/workflows/release.yml`. The workflow:

1. validates `vMAJOR.MINOR.PATCH`;
2. builds `virgo-api`, `virgo-web`, and `virgo-dashboard` from the release tag;
3. fails its final gate unless every image job succeeded;
4. records the exact digest from each successful image build in
   `virgo-deployable-<tag>.json`; and
5. uploads `virgo-production-worker-<tag>.zip` and its SHA-256 checksum.

The worker requires both the successful-workflow marker and these manifests:

```text
ghcr.io/flareawesome17/virgo-api:<tag>
ghcr.io/flareawesome17/virgo-web:<tag>
ghcr.io/flareawesome17/virgo-dashboard:<tag>
```

Each live tag digest must exactly match the digest recorded by the successful
workflow. This prevents an older marker from authorizing mixed images after a
later failed rebuild partially overwrites the same tag.

If the Release exists while Actions is still building, the marker or a
manifest is absent. If a rebuild is incomplete, a digest differs. In either
case the poll exits successfully and checks again in five minutes. This state
is not recorded as a failed deployment.

## Release polling and ordering

The poller reads up to 30 recent releases, rejects drafts, prereleases,
unpublished entries, and malformed tags, and sorts the remaining tags as
semantic versions. It deploys only a version newer than `lastSuccessful`.

Unexpected GitHub API ordering therefore cannot cause a downgrade. Manual
downgrade is possible only with `deploy.ps1 -AllowDowngrade`, and the target
must still pass the release and image gates.

If the latest release equals or is older than `lastSuccessful`, the poller
does nothing. If it appears in `failedReleases`, it is suppressed until an
operator explicitly retries it or a newer release is published.

The repository's Releases API is private from the production host, so polling
uses a separate fine-grained GitHub token scoped only to
`flareawesome17/virgo` with **Contents: read**. GitHub documents that exact
permission for [reading releases and release assets](https://docs.github.com/en/rest/releases/releases#get-a-release-by-tag-name).
Do not reuse a broad development token or the GHCR package token.

Store it as the same Windows account that will run the Scheduled Task:

```powershell
cd C:\VirgoProduction
powershell -NoProfile -ExecutionPolicy Bypass -File .\set-github-token.ps1
```

The script validates access without printing the token, encrypts it with
Windows DPAPI, and restricts the ciphertext file ACL to that Windows account
and SYSTEM. It can only be decrypted by the same account on the same machine.
`VIRGO_GITHUB_TOKEN` remains an environment-variable override for controlled
automation, but the DPAPI file is the recommended setup. Never put either form
in source control or logs.

GHCR access is separate: Docker Desktop must remain logged in with
`read:packages`, as in Phase 1.

## Deployment state

`deployment-state.json` is written through a temporary file and replaced on
the same volume. The previous valid file is retained as
`deployment-state.json.bak`. A representative state is:

```json
{
  "schemaVersion": 1,
  "current": "v1.0.2",
  "previous": "v1.0.1",
  "lastSuccessful": "v1.0.2",
  "lastAttempted": "v1.0.2",
  "status": "healthy",
  "lastAttemptStatus": "success",
  "deployedAt": "2026-08-13T03:05:00+08:00",
  "releaseCommit": null,
  "backupPath": "C:\\VirgoProduction\\backups\\virgo-prod-before-v1.0.2-20260813-030400.dump",
  "deploymentDurationSeconds": 61.2,
  "failureReason": null,
  "healthCheckResults": [],
  "failedReleases": {}
}
```

Possible `status` values include `healthy`, `deploying`, `rolling-back`, and
`critical`. `critical` stops automatic deployment and requires operator review.

Initialization refuses to guess. The `.env` `IMAGE_TAG`, all three running
application image tags, and the initial state must agree. It also requires API,
web, dashboard, and Postgres health plus a running tunnel.

If an earlier manual edit changed `.env` but the running containers remained
on the previous tag, inspect all three images first. Then the explicit
`-ReconcileImageTag` switch can atomically restore `.env` to the authoritative
running tag before state initialization. It never recreates a container.

## Deployment order

For a new deployable release, the shared pipeline is:

1. acquire the exclusive deployment lock;
2. verify `.env`, state, and running application versions agree;
3. record the attempt in state;
4. back up PostgreSQL;
5. target-update only `IMAGE_TAG` in `.env`;
6. pull `api`, `web`, and `dashboard`;
7. run the explicit migration runner from the target API image;
8. recreate API and wait for API/Postgres health and readiness;
9. recreate web and dashboard;
10. wait for all required Docker health checks;
11. run local and public smoke tests; and
12. atomically mark the release successful.

No normal upgrade command contains `docker compose down`. No worker command
uses `down -v`, removes a Docker volume, resets the database, or recreates
Postgres, pgAdmin, or cloudflared.

## PostgreSQL backup and retention

Every deployment attempt that reaches the mutation pipeline runs `pg_dump`
before changing `IMAGE_TAG`, pulling, migrating, or recreating containers. The
database user and database name come from the existing production `.env`; they
are not hardcoded.

The backup is first written inside `virgo-postgres`, verified as non-empty,
copied to the host with a `.partial` suffix, verified again, and renamed to:

```text
backups\virgo-prod-before-v1.0.2-20260813-030400.dump
```

If any backup step fails, deployment stops before image pull, migration, or
application recreation. A partial file may remain for diagnosis but is never
treated as a valid `.dump` backup.

Retention runs only after a successful deployment. It keeps at least the 20
newest deployment backups and every deployment backup newer than 90 days.
Only files matching `virgo-prod-before-v*.dump` inside the resolved backups
directory are eligible. This intentionally keeps failed-attempt backups and
multiple recovery points. Off-host backup replication is still recommended.

## Migrations

Production remains explicit:

```powershell
docker compose -f docker-compose.prod.yml run --rm --no-deps api node dist/database/migrate-cli.js
```

The runner applies pending SQL files in order and records them in
`schema_migrations`; each migration file runs in its own transaction. A
migration failure stops before the new application is started and restores
`IMAGE_TAG` to the previous successful release.

Schema policy remains:

```text
expand -> migrate -> contract in a later release
```

> Automatic application rollback does not reverse database migrations.

The backup is recorded for a deliberate recovery decision. The worker never
runs `pg_restore` and never restores PostgreSQL automatically.

## Health checks and smoke tests

The worker waits up to 120 seconds by default, polling every five seconds, for:

- `virgo-api` healthy;
- `virgo-web` healthy;
- `virgo-dashboard` healthy; and
- `virgo-postgres` healthy.

It then verifies:

- `http://127.0.0.1:<API_PORT>/health/ready` returns
  `{"status":"ready","database":"ok"}`;
- web responds from inside `virgo-web`;
- dashboard responds from inside `virgo-dashboard`;
- `<PUBLIC_API_URL>/health/live` returns status `ok`;
- `<WEB_APP_URL>/` responds;
- `<PUBLIC_SITE_URL>/` responds; and
- `virgo-cloudflared` is still running.

No authenticated account or fabricated client delivery link is used.

## Application rollback

If container health, readiness, or smoke tests fail after the new application
starts, the worker:

1. records the target release as failed;
2. restores `IMAGE_TAG` to the previous successful tag;
3. uses local previous images, pulling them only if absent;
4. recreates only API, web, and dashboard;
5. reruns health, readiness, and smoke checks; and
6. records `rolled-back` if the previous release is healthy.

PostgreSQL is not restored. Postgres, pgAdmin, cloudflared, and named volumes
are not recreated or rolled backward.

If rollback also fails, state becomes `critical`, current container states are
recorded, and the worker stops. It does not retry, restore data, or enter a
loop.

## Logs

Deployment attempts write:

```text
logs\deploy-v1.0.2-20260813-030400.log
```

Polling writes `logs\release-poller.log`. Logs include commands, command
output, backup path, migration result, health/smoke results, rollback, and
final state. The scripts never print `.env`; a defensive redactor also masks
common password/token/secret command-output patterns.

## Install without enabling

Download and verify the worker asset from a successful Release, then extract
it over `C:\VirgoProduction`. Because the repository is private, use the same
fine-grained, single-repository, Contents-read token that polling will use:

```powershell
$tag = 'v1.0.1'
$zip = Join-Path $env:TEMP "virgo-production-worker-$tag.zip"
$checksum = "$zip.sha256"
$secureToken = Read-Host 'Fine-grained GitHub token (Contents: read)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)

try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $headers = @{
    Authorization = "Bearer $token"
    Accept = 'application/vnd.github+json'
    'User-Agent' = 'Virgo-Phase2-Installer'
    'X-GitHub-Api-Version' = '2022-11-28'
  }
  $release = Invoke-RestMethod `
    -Uri "https://api.github.com/repos/flareawesome17/virgo/releases/tags/$tag" `
    -Headers $headers `
    -UseBasicParsing

  foreach ($item in @(
    @{ Name = "virgo-production-worker-$tag.zip"; Path = $zip },
    @{ Name = "virgo-production-worker-$tag.zip.sha256"; Path = $checksum }
  )) {
    $asset = $release.assets | Where-Object { $_.name -eq $item.Name } | Select-Object -First 1
    if (-not $asset) { throw "Release asset missing: $($item.Name)" }
    $headers.Accept = 'application/octet-stream'
    Invoke-WebRequest -Uri $asset.url -Headers $headers -OutFile $item.Path -UseBasicParsing
  }
} finally {
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $token = $null
}

$expected = ((Get-Content -LiteralPath $checksum -Raw) -split '\s+')[0].ToUpperInvariant()
$actual = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
if ($actual -ne $expected) { throw 'Production worker checksum mismatch.' }

Expand-Archive -LiteralPath $zip -DestinationPath C:\VirgoProduction -Force
```

Extraction installs scripts only; it does not initialize state, deploy, or
register a task.

Configure the read-only Releases token before the first poll or deployment:

```powershell
cd C:\VirgoProduction
powershell -NoProfile -ExecutionPolicy Bypass -File .\set-github-token.ps1
```

Before state initialization, verify that `.env` `IMAGE_TAG` exactly matches
the tags actually running in API, web, and dashboard. Then run:

```powershell
cd C:\VirgoProduction
powershell -NoProfile -ExecutionPolicy Bypass -File .\initialize-deployment.ps1
```

If—and only if—the inspected running application images are authoritative and
`.env` is the stale side of a mismatch:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\initialize-deployment.ps1 -ReconcileImageTag
```

Initialization is the first Phase 2 write. Review
`deployment-state.json` before proceeding.

## Manual deployment

Dry run first:

```powershell
cd C:\VirgoProduction
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy.ps1 -Tag v1.0.2 -WhatIf
```

Dry run performs only read-only release, manifest, state, environment, and
container inspections. It does not create a lock or log, change `.env`, create
a backup, run migrations, pull images, recreate containers, or update state.

Deploy manually through the same pipeline used by polling:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy.ps1 -Tag v1.0.2
```

An intentional downgrade requires `-AllowDowngrade`. A corrected retry of a
suppressed release requires `-ForceRetry`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy.ps1 -Tag v1.0.2 -ForceRetry
```

Review the original log and fix its cause before forcing a retry.

## Scheduled Task

Registration is intentionally separate and is never run by a release or by
installation:

```powershell
cd C:\VirgoProduction
powershell -NoProfile -ExecutionPolicy Bypass -File .\register-deployment-task.ps1
```

The default uses the current user's interactive token because Docker Desktop
and its credential helper normally belong to that Windows login. It runs
hidden every five minutes, starts in `C:\VirgoProduction`, ignores overlapping
Scheduled Task instances, and also relies on `deployment.lock`.

Where Docker Desktop is proven to remain available without an interactive
session, register with stored Windows credentials:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\register-deployment-task.ps1 -RunWhetherLoggedOn
```

The one-time prompt is for the Windows account that owns Docker Desktop and
the GHCR login. Test this mode after signing out before relying on it.

Registration does not start the task. Test one poll explicitly:

```powershell
Start-ScheduledTask -TaskName 'Virgo Production Release Poller'
Start-Sleep -Seconds 10
Get-ScheduledTaskInfo -TaskName 'Virgo Production Release Poller'
Get-Content .\logs\release-poller.log -Tail 50
```

## Disable or remove automatic deployment

Emergency stop (does not stop the running application):

```powershell
Disable-ScheduledTask -TaskName 'Virgo Production Release Poller'
```

Equivalent helper:

```powershell
.\register-deployment-task.ps1 -Disable
```

Remove only the scheduler entry:

```powershell
.\register-deployment-task.ps1 -Unregister
```

Do not stop cloudflared and do not run Compose teardown as an automatic
deployment emergency stop.

## Troubleshooting

- **Release stays pending:** confirm the release has
  `virgo-deployable-<tag>.json` and all three manifests match the marker's
  digests. Rerun the Release workflow for the existing tag after fixing
  Actions.
- **GitHub API returns 404:** the private repository is deliberately hidden
  from unauthenticated callers. Run `set-github-token.ps1` as the exact account
  used by the Scheduled Task.
- **Version mismatch:** compare `.env`, `deployment-state.json`, and
  `docker inspect virgo-api/virgo-web/virgo-dashboard`. Do not force state to a
  version that is not actually running.
- **Backup failure:** verify Postgres health, free disk space, and write access
  to `backups`. No migration or new container was started.
- **Migration failure:** the previous app remains active and `IMAGE_TAG` is
  restored. Inspect the deployment log and preserve the named backup.
- **Critical state:** disable the task, capture `docker ps -a` and Compose
  status/logs, and investigate manually. Do not restore the database merely
  because application rollback failed.
- **Interrupted deployment:** Windows releases the lock handle, but state may
  remain `deploying`. Disable the task and reconcile `.env`, state, and actual
  running image tags before an explicit retry.

## Test harness

The repository test suite uses temporary directories and an injected mock
adapter; it never invokes the real Docker daemon or production endpoints:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\deployment\windows\tests\Deployment.Tests.ps1
```

It covers no-op polling decisions, a valid deployment, malformed tags,
incomplete images, stale-marker digest mismatch, backup failure, migration
failure, health-triggered rollback, failed-release suppression, concurrent
locking, stale lock reuse, and dry-run immutability.
