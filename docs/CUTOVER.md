# Moving production to its own machine

Today one machine does everything: it builds, it runs the development stack,
and its Cloudflare Tunnel serves all eight hostnames. This is the procedure for
splitting that in two — production on its own host, development staying where
it is and keeping the hostnames it actually needs.

Read [DOMAINS.md](DOMAINS.md) first for what each hostname is for.

---

## The tunnel moves; it is not duplicated

**Decision: the existing tunnel moves to the production machine.** Development
keeps no hostnames at all and goes entirely to the LAN.

The appeal is that there is nothing to reconfigure in Cloudflare. A route says
`api.virgo.ph → http://api:3000`, and that address is resolved by whichever
`cloudflared` is running, on its own Docker network. Move the token to the
production host and all seven hostnames follow it — no dashboard edits, no DNS
change, no propagation wait.

**The one rule: never run it on both machines at once.**

A tunnel's token identifies the tunnel, and any `cloudflared` started with it
registers as a **connector**. Cloudflare treats multiple connectors as replicas
and load-balances across them — so with both running, `api.virgo.ph` lands on
the laptop for some requests and the server for others, each hitting its own
database. This is not a caution about copying the token; it is a caution about
the two processes overlapping, even for a minute.

That is why production starts **without** `cloudflared` below, is verified on
loopback first, and only then does the tunnel change hands.

`dev.virgo.ph` moves with everything else and will resolve to the production
machine's `host.docker.internal:8081`, where no bundler is listening — a
harmless 502. Remove that route from the tunnel once the move is done; Metro is
on the LAN afterwards and no longer needs it.

---

## What each machine ends up serving

Every hostname ends up on the production machine. The routes themselves do not
change — only which machine answers them.

| Hostname | Points at | Served by |
|---|---|---|
| `virgo.ph` | `http://web:3000` | production |
| `www.virgo.ph` | `http://web:3000` | production |
| `web.virgo.ph` | `http://web:3000` | production |
| `api.virgo.ph` | `http://api:3000` | production |
| `client.virgo.ph` | `http://api:3000` | production |
| `console.virgo.ph` | `http://dashboard:3002` | production |
| `db.virgo.ph` | `http://pgadmin:80` | production |
| `dev.virgo.ph` | `http://host.docker.internal:8081` | nothing — delete this route |

**Development keeps no hostnames.** Both things a phone needs move to the LAN:

| | Before | After |
|---|---|---|
| API | `https://api.virgo.ph` | `http://<dev-LAN-IP>:3001` |
| Metro bundler | `https://dev.virgo.ph` | `http://<dev-LAN-IP>:8081` |

The API part is what keeps development honest: the phone currently reaches the
development API at `api.virgo.ph`, and after the move that hostname is
production. Left unchanged, every test on a real device writes to production
data.

Two consequences of publishing the API port, both already handled:

- **The rate limiter stopped trusting `CF-Connecting-IP`.** It is unforgeable
  only because Cloudflare overwrites it, which holds while Cloudflare is the
  only way in. A directly reachable port means the caller sets that header
  itself — so a forged value per request would be a limiter that never fires.
  The guard now reads it only when `TRUST_PROXY` is on, and development turns
  it off. Verified: twelve logins with twelve different forged
  `CF-Connecting-IP` values share one bucket and start returning 429.
- **LAN is not the internet.** Do not forward these ports on the router.

---

## Order of work

Do it in this order. Production is fully built and tested **before** any
hostname moves, so the window where anything is broken is a few seconds of DNS
rather than an evening of setup.

### 1. Prepare the production machine

Docker Desktop installed and running. No source tree, no Node, no toolchain.

```powershell
New-Item -ItemType Directory -Force C:\VirgoProduction\backups, C:\VirgoProduction\logs, C:\VirgoProduction\scripts
```

Copy in two files:

- `docker-compose.prod.yml`
- `.env` — the filled-in production environment

Log in to GHCR so the images can be pulled. The images are private to the
repository, so this needs a personal access token with `read:packages`:

```powershell
$env:CR_PAT | docker login ghcr.io -u flareawesome17 --password-stdin
```

### 2. Nothing to do in Cloudflare

The tunnel already exists and its routes already point at the right service
addresses. It moves in step 5, by stopping `cloudflared` here and starting it
there — no dashboard edits, no DNS change, no propagation wait.

`CLOUDFLARE_TUNNEL_TOKEN` in the production `.env` is the existing token, which
is correct under this plan. It is the **only** value that may legitimately match
development, and it is safe precisely because the two machines never run it at
the same time.

<!-- Superseded: the two-tunnel arrangement, kept for context only.

### Create the production tunnel

Cloudflare Zero Trust → Networks → Tunnels → **Create a tunnel**. Name it
something that cannot be confused with the existing one — `virgo-production`.

Copy its token into `CLOUDFLARE_TUNNEL_TOKEN` in the production `.env`.

**Do not add any public hostnames to it yet.** Routes are what move traffic;
adding them now would start serving from a stack that has not been migrated.

-->

### 3. Start production, but not the tunnel

**Name the services explicitly. A bare `up -d` starts `cloudflared` too**, and
because the production `.env` already carries the existing token, that would
put a second connector on the live tunnel and start splitting real traffic onto
a machine that has not been migrated yet.

```powershell
cd C:\VirgoProduction
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d postgres
docker compose -f docker-compose.prod.yml run --rm api node dist/database/migrate-cli.js
docker compose -f docker-compose.prod.yml up -d api web dashboard pgadmin
```

The migration is its own step and always will be — publishing a release never
touches a database.

**The production database starts empty.** The accounts, albums and files on the
development machine stay there. That is usually what you want for a first
release; if it is not, see *Bringing data across* below.

### 4. Verify before moving anything

The tunnel has no routes yet, so test on the host through the loopback ports:

```powershell
curl.exe -s -o NUL -w "api      %{http_code}`n" http://127.0.0.1:3001/health
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs api --tail 50
```

What to confirm in the log:

- `API listening on http://localhost:3000`
- No `CORS_ORIGINS is required` — that error means the variable is missing
- The seeded console owner's one-time password, printed once. Copy it now.

### 5. Hand the tunnel over

The only step with an outage, and it is seconds. **Stop before you start** —
the reverse order puts two connectors on the tunnel and splits live traffic
between the machines.

On the **development** machine:

```powershell
cd <repo>\api
docker compose stop cloudflared
```

Confirm it is really down before continuing. From anywhere:

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" https://virgo.ph
```

A 502 or 530 is what you want here — it means no connector is answering.

Then on the **production** machine:

```powershell
cd C:\VirgoProduction
docker compose -f docker-compose.prod.yml up -d cloudflared
```

All seven hostnames now resolve to production. Nothing changed in Cloudflare.

Afterwards, remove the `dev.virgo.ph` route from the tunnel — it points at a
bundler that is not on this machine, and Metro moves to the LAN in the next
step.

### 6. Point development at the LAN

Find the development machine's address on the network:

```powershell
ipconfig | Select-String "IPv4"
```

Take the one on your Wi-Fi or Ethernet adapter — `192.168.x.x` or `10.x.x.x`.
Ignore anything starting `172.` on Windows; that is usually WSL or Hyper-V.

Then repoint everything on that machine that currently names a production
host. These are the exact keys; the values are yours to edit, substituting
your own address for `192.168.1.50`:

**`mobile/.env`**

```env
EXPO_PUBLIC_API_URL=http://192.168.1.50:3001
```

The one that matters most. Left pointing at `api.virgo.ph`, every test on a
physical device writes to production.

**Delete the `EXPO_PACKAGER_PROXY_URL` line entirely.** It advertises
`https://dev.virgo.ph` as the bundler address, and that hostname now resolves
to the production machine. Removed, Expo advertises the LAN address by itself,
which is the arrangement everything else on this machine has moved to.

If Expo picks the wrong interface — Windows machines often have several — pin
it:

```env
REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.50
```

**`api/.env`**

The first two lines are the pair that opens the LAN. Set them together — a
published port while the header is still trusted lets any LAN caller forge
`CF-Connecting-IP` and never hit a rate limit, and an untrusted header while
still behind the tunnel puts every user in one bucket. Both default to today's
values, so nothing changes until you add these lines.

```env
API_BIND=0.0.0.0
TRUST_PROXY=false

CORS_ORIGINS=http://localhost:3005,http://localhost:8081,http://localhost:19006,http://192.168.1.50:3001,http://192.168.1.50:8081
WEB_APP_URL=http://localhost:3005
PUBLIC_APP_URL=http://192.168.1.50:3001
CLIENT_DELIVERY_URL=http://192.168.1.50:3001
PUBLIC_SITE_URL=http://localhost:3005
PUBLIC_API_URL=http://192.168.1.50:3001
CONSOLE_URL=http://localhost:3002
```

`WEB_APP_URL` is the second dangerous one: left as `https://web.virgo.ph`, a
test signup on the development stack emails somebody a confirmation link into
production, where the account does not exist. Pointing it at localhost means
the link only works on the development machine itself — correct, because that
is the only place the development web app runs.

Restart the development stack afterwards:

```powershell
cd <repo>\api
docker compose up -d
```

**Two things that can stop the phone reaching it**, neither of them Virgo:

- **Windows Firewall.** The bind is open, but Windows may still refuse the
  inbound connection. Allow the port once:

  ```powershell
  New-NetFirewallRule -DisplayName "Virgo dev" -Direction Inbound -LocalPort 3001,8081 -Protocol TCP -Action Allow -Profile Private
  ```

- **Client isolation on the Wi-Fi.** Some routers stop devices on the same
  network from talking to each other, which is what made the tunnel necessary
  in the first place. Test from the phone's browser before assuming the app is
  broken:

  ```
  http://192.168.1.50:3001/health
  ```

  A JSON response means the path is clear. A timeout means the network is
  blocking it, and the Metro tunnel arrangement would need extending to the
  API as well — a second hostname on the development tunnel pointing at
  `http://api:3000`.

### 7. Verify both machines

```powershell
# production, through Cloudflare
curl.exe -s -o NUL -w "api      %{http_code}`n" https://api.virgo.ph/health
curl.exe -s -o NUL -w "web      %{http_code}`n" https://web.virgo.ph
curl.exe -s -o NUL -w "site     %{http_code}`n" https://virgo.ph
curl.exe -s -o NUL -w "console  %{http_code}`n" https://console.virgo.ph
curl.exe -s -o NUL -w "client   %{http_code}`n" https://client.virgo.ph/s/nope   # expect 403

# development
curl.exe -s -o NUL -w "dev api  %{http_code}`n" http://192.168.1.50:3001/health
```

Then the thing that actually proves the split: sign in on production, and
confirm the account you use is **not** one of the development accounts. If a
development login works against `api.virgo.ph`, the hostname did not move.

---

## Rollback

Nothing is destroyed by this procedure. To put things back, hand the tunnel the
other way — same rule, stop before you start, never both:

```powershell
# on production
docker compose -f docker-compose.prod.yml stop cloudflared

# on development
docker compose up -d cloudflared
```

Production keeps running, unreachable, until you hand the tunnel back to it.

Revert the development `.env` edits from step 6 at the same time, or
development will be talking to localhost while serving public hostnames.

---

## Bringing data across

Only if you want the development accounts and media in production. For a first
release, usually you do not.

```powershell
# on the development machine
docker exec virgo-postgres pg_dump -U virgo -d virgo_dev -Fc -f /tmp/virgo.dump
docker cp virgo-postgres:/tmp/virgo.dump .\virgo.dump

# copy virgo.dump to the production machine, then
docker cp .\virgo.dump virgo-postgres:/tmp/virgo.dump
docker exec virgo-postgres pg_restore -U virgo -d virgo_prod --clean --if-exists /tmp/virgo.dump
```

Two caveats. Media lives in B2, not Postgres — if development and production
use different buckets, restored rows point at objects production cannot read.
And the restore brings development's admin accounts and their password hashes
with it.

---

## After the move

- Cloudflare Access on `db.virgo.ph` (required) and `console.virgo.ph`
  (recommended). Now genuinely urgent: these front real user data.
- Change the seeded console password from the one in the boot log.
- Take a backup before the first real users arrive, and confirm you can restore
  it. An untested backup is not a backup.
- The development machine no longer serves anything public. Its stack can be
  stopped when you are not working, which was never true before.
