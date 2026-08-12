# Moving production to its own machine

Today one machine does everything: it builds, it runs the development stack,
and its Cloudflare Tunnel serves all eight hostnames. This is the procedure for
splitting that in two — production on its own host, development staying where
it is and keeping the hostnames it actually needs.

Read [DOMAINS.md](DOMAINS.md) first for what each hostname is for.

---

## Why two tunnels

Not because the token is secret — because of what happens when two machines
present the same one.

A tunnel's token identifies the tunnel. Any `cloudflared` started with it
registers as a **connector** for that tunnel, and Cloudflare treats multiple
connectors as replicas: it load-balances across them. Run the same token on the
laptop and the server and `api.virgo.ph` lands on one or the other per request,
each resolving `http://api:3000` on its own Docker network to its own API and
its own database. Same hostname, two backends, no way to predict which.

Moving the single tunnel — stop `cloudflared` here, start it there with the
same token — does work and avoids that. But the development machine then loses
`dev.virgo.ph` as well, and per the setup notes this Wi-Fi has client
isolation, so a physical phone cannot reach Metro over the LAN. Development
needs at least one hostname of its own.

So: **production gets a new tunnel that owns the seven production hostnames.
Development keeps its existing tunnel and serves only development hostnames.**

---

## What each machine ends up serving

| Tunnel | Hostname | Points at |
|---|---|---|
| **production** | `virgo.ph` | `http://web:3000` |
| | `www.virgo.ph` | `http://web:3000` |
| | `web.virgo.ph` | `http://web:3000` |
| | `api.virgo.ph` | `http://api:3000` |
| | `client.virgo.ph` | `http://api:3000` |
| | `console.virgo.ph` | `http://dashboard:3002` |
| | `db.virgo.ph` | `http://pgadmin:80` |
| **development** | `dev.virgo.ph` | `http://host.docker.internal:8081` — Metro |

Development keeps **one** hostname, for the Metro bundler. Everything else on
that machine moves to the LAN: the API is now published on `0.0.0.0` rather
than loopback, so a phone reaches it at `http://<dev-LAN-IP>:3001` directly.

That is the piece that keeps mobile development working. The phone currently
reaches the development API at `api.virgo.ph`; after cutover that hostname is
production, so without a replacement every test on a real device would be
writing to production data.

Two consequences of publishing that port, both already handled:

- **The rate limiter stopped trusting `CF-Connecting-IP`.** It is unforgeable
  only because Cloudflare overwrites it, which holds while Cloudflare is the
  only way in. A directly reachable port means the caller sets that header
  itself — so a forged value per request would be a limiter that never fires.
  The guard now reads it only when `TRUST_PROXY` is on, and development sets
  it off. Verified: twelve logins with twelve different forged
  `CF-Connecting-IP` values share one bucket and start returning 429.
- **LAN is not the internet.** Do not forward this port on the router.

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

### 2. Create the production tunnel

Cloudflare Zero Trust → Networks → Tunnels → **Create a tunnel**. Name it
something that cannot be confused with the existing one — `virgo-production`.

Copy its token into `CLOUDFLARE_TUNNEL_TOKEN` in the production `.env`.

**Do not add any public hostnames to it yet.** Routes are what move traffic;
adding them now would start serving from a stack that has not been migrated.

### 3. Start production and migrate

```powershell
cd C:\VirgoProduction
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d postgres
docker compose -f docker-compose.prod.yml run --rm api node dist/database/migrate-cli.js
docker compose -f docker-compose.prod.yml up -d
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

### 5. Move the hostnames

This is the only step with an outage, and it is short. For each of the seven
production hostnames:

1. **Production tunnel** → Public Hostnames → Add, per the table above.
2. **Development tunnel** → remove the same hostname.

Add before removing, per hostname, so the gap is a DNS update rather than a
period with no route at all.

`dev.virgo.ph` stays on the development tunnel. Do not touch it.

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

`EXPO_PACKAGER_PROXY_URL=https://dev.virgo.ph` stays as it is — Metro keeps
the tunnel.

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
  New-NetFirewallRule -DisplayName "Virgo dev API" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow -Profile Private
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

Nothing is destroyed by this procedure, so rollback is moving the routes back:
add the seven hostnames to the development tunnel, remove them from
production's. Production keeps running, unreachable, until you point at it
again.

Revert the development `.env` edits from step 6 at the same time, or
development will still be talking to localhost while serving public hostnames.

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
