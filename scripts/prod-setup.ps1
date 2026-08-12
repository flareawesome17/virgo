<#
.SYNOPSIS
  First-time production setup for Virgo. Run this ON THE PRODUCTION MACHINE.

.DESCRIPTION
  Brings production up to the point where it is fully running and verified, but
  NOT yet serving the public hostnames. The tunnel is deliberately left for a
  separate, manual step.

  That separation is the whole point of this script. `docker compose up -d`
  would start cloudflared along with everything else, and because the
  production .env carries the same tunnel token the development machine has
  been using, that would put a second connector on the live tunnel -- Cloudflare
  treats connectors as replicas and load-balances across them, so real traffic
  would start landing on a machine that has not been migrated yet.

  Nothing here is destructive. It pulls images, starts Postgres, applies
  migrations to an empty database, and starts the application containers.

.EXAMPLE
  cd C:\VirgoProduction
  powershell -ExecutionPolicy Bypass -File .\prod-setup.ps1
#>

$ErrorActionPreference = 'Stop'
$compose = 'docker-compose.prod.yml'

function Step($n, $text) { Write-Host "`n[$n] $text" -ForegroundColor Cyan }
function Ok($text)       { Write-Host "    OK   $text" -ForegroundColor Green }
function Bad($text)      { Write-Host "    FAIL $text" -ForegroundColor Red }
function Note($text)     { Write-Host "         $text" -ForegroundColor DarkGray }

# -- 1. the two files, and Docker ---------------------------------------------
Step 1 'Checking prerequisites'

foreach ($f in @($compose, '.env')) {
  if (-not (Test-Path $f)) {
    Bad "$f is not in this folder."
    Note 'Copy both docker-compose.prod.yml and .env here first. Compose treats'
    Note 'env_file as mandatory -- a missing .env is a hard error, not a warning.'
    exit 1
  }
  Ok "$f present"
}

try { docker info *> $null; Ok 'Docker is running' }
catch { Bad 'Docker is not running. Start Docker Desktop and try again.'; exit 1 }

# -- 2. the .env is actually filled in ----------------------------------------
Step 2 'Checking .env'

$envText = Get-Content .env -Raw
$pairs = @{}
foreach ($line in ($envText -split "`r?`n")) {
  if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
  $i = $line.IndexOf('=')
  $pairs[$line.Substring(0, $i).Trim()] = $line.Substring($i + 1).Trim()
}

$placeholders = $pairs.GetEnumerator() | Where-Object { $_.Value -match 'REPLACE_ME|^GENERATE$' }
if ($placeholders) {
  Bad 'These are still placeholders:'
  $placeholders | ForEach-Object { Note "  $($_.Key)" }
  exit 1
}
Ok 'no placeholders left'

foreach ($k in @('IMAGE_TAG', 'POSTGRES_DB', 'POSTGRES_PASSWORD', 'CORS_ORIGINS', 'CLOUDFLARE_TUNNEL_TOKEN')) {
  if (-not $pairs.ContainsKey($k) -or -not $pairs[$k]) { Bad "$k is missing or empty"; exit 1 }
}
Ok "IMAGE_TAG = $($pairs['IMAGE_TAG'])"

# Naming, not isolation -- the two databases are on different machines and
# different volumes regardless. This catches a copied-from-development .env.
if ($pairs['POSTGRES_DB'] -eq 'virgo_dev') {
  Bad "POSTGRES_DB is 'virgo_dev'. Production should be 'virgo_prod'."
  exit 1
}
Ok "POSTGRES_DB = $($pairs['POSTGRES_DB'])"

# CORS is required in production -- the API refuses to boot without it, on
# purpose, because the fallback reflects whatever origin asks.
Ok "CORS_ORIGINS = $($pairs['CORS_ORIGINS'])"

# -- 3. this machine is not already running a Virgo stack ---------------------
Step 3 'Checking for an existing Virgo stack'

# Every service pins container_name, and those names are global to the Docker
# daemon rather than scoped to a compose project. Running this on a machine
# that already has a Virgo stack would collide on the first `up` -- and worse,
# it is exactly the mistake that would be made by running it on the DEVELOPMENT
# machine, where a stray recreate could point the development database at a
# production .env.
#
# Docker does refuse a duplicate name on its own. This check is here so the
# refusal is a clear sentence instead of a wall of daemon output halfway
# through, after images have already been pulled.
$existing = docker ps -a --filter 'name=virgo-' --format '{{.Names}}'
if ($existing) {
  Bad 'This machine already has Virgo containers:'
  $existing -split "`r?`n" | Where-Object { $_ } | ForEach-Object { Note "  $_" }
  Note ''
  Note 'Are you on the production machine? This script is for a clean host.'
  Note 'If these are left over from a previous attempt here, remove them with'
  Note "  docker compose -f $compose down"
  exit 1
}
Ok 'no existing Virgo containers'

# -- 4. pull ------------------------------------------------------------------
Step 4 "Pulling images for $($pairs['IMAGE_TAG'])"
Note 'The images are private to the repository. If this fails with'
Note 'unauthorized/denied, log in first:'
Note '  $env:CR_PAT | docker login ghcr.io -u <github-username> --password-stdin'
Note '(a personal access token with read:packages)'

docker compose -f $compose pull
if ($LASTEXITCODE -ne 0) { Bad 'Pull failed -- see above.'; exit 1 }
Ok 'images pulled'

# -- 5. database, then migrations ---------------------------------------------
Step 5 'Starting Postgres'
docker compose -f $compose up -d postgres
if ($LASTEXITCODE -ne 0) { Bad 'Postgres failed to start.'; exit 1 }

Write-Host '         waiting for it to report healthy' -ForegroundColor DarkGray
$healthy = $false
foreach ($attempt in 1..30) {
  Start-Sleep -Seconds 2
  $state = docker inspect virgo-postgres --format '{{.State.Health.Status}}' 2>$null
  if ($state -eq 'healthy') { $healthy = $true; break }
}
if (-not $healthy) { Bad 'Postgres did not become healthy. docker compose logs postgres'; exit 1 }
Ok 'Postgres healthy'

Step 6 'Applying migrations'
Note 'A deliberate, separate step. Publishing a release never touches a database.'
docker compose -f $compose run --rm api node dist/database/migrate-cli.js
if ($LASTEXITCODE -ne 0) { Bad 'Migrations failed. Nothing else has been started.'; exit 1 }
Ok 'schema applied'

# -- 7. application, but NOT the tunnel ---------------------------------------
Step 7 'Starting the application (without the tunnel)'
docker compose -f $compose up -d api web dashboard pgadmin
if ($LASTEXITCODE -ne 0) { Bad 'Something failed to start.'; exit 1 }

Write-Host '         waiting for the API' -ForegroundColor DarkGray
$apiOk = $false
foreach ($attempt in 1..30) {
  Start-Sleep -Seconds 2
  try {
    $port = if ($pairs['API_PORT']) { $pairs['API_PORT'] } else { '3001' }
    $r = Invoke-WebRequest "http://127.0.0.1:$port/health" -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -eq 200) { $apiOk = $true; break }
  } catch { }
}
if ($apiOk) { Ok 'API answering on loopback' }
else {
  Bad 'API is not answering. Check the log:'
  Note "  docker compose -f $compose logs api --tail 60"
  Note 'A "CORS_ORIGINS is required" error means that variable is missing.'
  exit 1
}

docker compose -f $compose ps

# -- what is left, and why it is manual ---------------------------------------
Write-Host "`n$('=' * 68)" -ForegroundColor Green
Write-Host ' Production is running and verified. It is NOT serving the domains yet.' -ForegroundColor Green
Write-Host $('=' * 68) -ForegroundColor Green

Write-Host @"

The tunnel is the last step, and it is manual because it must not overlap.

  1. Find the console owner's one-time password in the log and save it:

       docker compose -f $compose logs api | Select-String -Pattern 'password'

  2. On the DEVELOPMENT machine, make sure its connector is stopped. It should
     already be -- it now sits behind a 'tunnel' profile -- but confirm:

       docker ps --filter name=virgo-cloudflared

     Anything listed there must be stopped first. Two connectors on one tunnel
     are replicas, and Cloudflare will split live traffic between the machines.

  3. Confirm nothing is answering, from anywhere:

       curl.exe -s -o NUL -w "%{http_code}" https://virgo.ph

     Expect 530. That is Cloudflare saying no connector is listening.

  4. Then, here:

       docker compose -f $compose up -d cloudflared

     All seven hostnames now resolve to this machine. Nothing changes in the
     Cloudflare dashboard -- the routes point at service names, and this
     connector resolves them on its own Docker network.

  5. Check them:

       virgo.ph  www.virgo.ph  web.virgo.ph  api.virgo.ph
       client.virgo.ph  console.virgo.ph  db.virgo.ph

     Then sign in and confirm the account you use is NOT a development
     account. If a development login works, the tunnel did not actually move.

  6. Put Cloudflare Access in front of db.virgo.ph, and ideally
     console.virgo.ph. Both front real user data now.

  7. Take a backup and confirm you can restore it before real users arrive.

"@ -ForegroundColor Gray
