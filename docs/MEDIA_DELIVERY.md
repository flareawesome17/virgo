# Media delivery

How photographs and films reach a viewer, and what has to change before they
reach one quickly.

Everything here is self-hosted and open source. No Cloudflare Stream, no
Cloudflare Images, no Mux, no Bunny, and no VPS. The production host already
has everything the job needs — a public IP, a gigabit symmetric uplink, and a
location inside the country most viewers are in. It is not currently being
used for any of that.

Audited against the repository at `v1.0.0`.

---

## What happens today

A viewer opening a film in an album gets this:

```
camera export (.mov/.mp4, ≤500 MB)
  → B2 private bucket, US region
  → presigned URL from StorageService.mediaUrl()
  → <video src="…"> in the browser
```

No edge, no transcode, no adaptive bitrate. Three separate defects, and only
one of them is the one people name:

| Defect | Where it lives | What the viewer sees |
|---|---|---|
| **Media has no edge at all** | `CDN_BASE_URL` is consumed only by `StorageConfig.publicUrl()`, which only avatars use. Private media is a presigned URL pointing straight at the B2 endpoint — see [storage.config.ts:220](api/src/storage/storage.config.ts:220) | Every byte crosses the Pacific. Backblaze has no Asia-Pacific region — US West, US East, EU Central and CA East only — so a viewer in Manila is ~200 ms from the origin |
| **No transcode** | [media-processing.service.ts](api/src/storage/media-processing.service.ts) runs `ffprobe` for metadata and one `ffmpeg` call for a poster frame. Nothing re-encodes the film | A 450 MB export plays at its authored bitrate or it stalls. There is no smaller rendition to fall back to |
| **No codec normalisation** | `ALLOWED_CONTENT_TYPES` accepts `video/quicktime` ([storage.config.ts:33](api/src/storage/storage.config.ts:33)) and the bytes are served untouched | HEVC, 10-bit and ProRes `.mov` straight off a camera fail outright. The viewer has a whole failure state for this — *"the original codec may only be supported on the device that recorded it"* — in [media-viewer.tsx](web/src/components/media/media-viewer.tsx) |

---

## The asset nobody is using

The production host is a Windows machine in the Philippines with a public IP
and roughly a gigabit of symmetric bandwidth. Almost every viewer is also in
the Philippines. That combination is worth more than a CDN subscription:

| Origin | Round trip to a Manila viewer |
|---|---|
| **The production host** | ~5–20 ms |
| A Singapore VPS | ~40–60 ms |
| B2 US West — what we use now | ~200 ms |

There is no commercial edge we could buy that would beat serving from inside
the country, and we already own the machine. The design below is therefore
not "build a CDN" — it is **stop sending Philippine traffic to California**.

The reason this has not happened by accident is [docker-compose.prod.yml](docker-compose.prod.yml),
which notes that *"Cloudflare Tunnel dials out, so this host needs no inbound
port and no public IP."* That was the right call for the application. It is
the wrong call for media.

---

## The shape of the fix

```
  ┌────────────────────────────────────────────────────────────┐
  │  PRODUCTION HOST — Philippines, 1 Gbps symmetric            │
  │                                                             │
  │   api · web · dashboard · postgres ──► cloudflared ──► app  │
  │                                         (unchanged)         │
  │   ffmpeg worker  ──►  renditions on local disk              │
  │   nginx + imgproxy ──────────────────► :443 ──► media       │
  │                                     (direct, no tunnel)     │
  └────────────────────────────────────────────────────────────┘
                              │
                              ▼
      hls.js (web) · native HLS (Safari/iOS) · expo-video (mobile)

  B2 keeps the originals. Durable, cold, and off the playback path.
```

Two planes, two routes in:

- **The application plane is untouched.** `virgo.ph`, `web.virgo.ph`,
  `api.virgo.ph`, `client.virgo.ph`, `console.virgo.ph` and `db.virgo.ph` keep
  dialling out through `cloudflared` exactly as they do now. No route changes,
  no new risk on the surfaces that hold the database and the sessions.
- **The media plane gets its own hostname and its own door.** `media.virgo.ph`
  resolves straight to the host's public IP, nginx terminates TLS, and it
  serves static bytes and nothing else.

**Set the `media.virgo.ph` DNS record to DNS-only — grey cloud, not orange.**
That one toggle is what keeps media out of Cloudflare's CDN entirely, which
both satisfies the "no Cloudflare" requirement and removes the question of
whether serving video through their CDN is permitted. Using Cloudflare for
*DNS* is not using them for delivery; the record just points at our IP.

### Where renditions live

**Originals stay in B2. Renditions live on the host's local disk.**

Renditions are reproducible from the original, so they are a cache, not data.
Writing them to B2 only to pull them back across the Pacific for every viewer
would spend egress and latency to gain nothing. Local disk is faster, free,
and losing it costs CPU rather than customer work.

| | Originals | Renditions |
|---|---|---|
| Home | B2, private bucket | Host local disk |
| Durability | Backblaze's problem | Regenerate from the original |
| On the playback path | No — download only | Yes |
| Counts against customer quota | Yes | No |

Sizing: roughly 300 MB of ladder per film, so ~300 GB per thousand films. An
LRU sweep that drops ladders for albums unshared for N months bounds the
growth; a dropped ladder costs one re-transcode, not a lost file.

**Use a Docker named volume, not a bind mount to `C:\`.** Docker Desktop on
Windows proxies bind-mounted paths across the WSL2 boundary, and the I/O
penalty on a directory full of small segment files is severe. A named volume
lives in the VM's ext4 filesystem and behaves like local disk, which is what
the existing `virgo_pgdata` volume already relies on.

---

## Components

| Job | Software | Licence | Notes |
|---|---|---|---|
| Transcode | **ffmpeg** | LGPL/GPL | Already in the API image — `apk add --no-cache ffmpeg` in [api/Dockerfile](api/Dockerfile) |
| Package HLS | **ffmpeg** `-f hls` | — | fMP4/CMAF segments. Shaka Packager or Bento4 only if we outgrow it |
| Serve media | **nginx** | BSD-2 | Static files from the volume. `sendfile` and range requests, nothing clever |
| Playback auth | **nginx** `ngx_http_secure_link_module` | BSD-2 | Ships in the official `nginx:` image — confirm with `nginx -V` |
| TLS | **Certbot** / **acme.sh**, DNS-01 | Apache-2.0 / MIT | DNS-01 against the Cloudflare DNS API avoids opening port 80 |
| Image resize | **sharp** (libvips) | Apache-2.0 | Already a dependency. See *Images* below for why not imgproxy |
| Web player | **hls.js** | Apache-2.0 | Attaches to a plain `<video>`; no player rewrite |
| Mobile player | **expo-video** | MIT | Already a dependency. HLS is native on both platforms |

### Not needed, now that the host is the edge

An earlier draft of this document proposed a Singapore VPS running
`nginx-s3-gateway` to sign SigV4 reads against a private B2 bucket. With
renditions on local disk none of that applies — nginx opens a file. The
gateway is only worth revisiting if renditions ever move back to object
storage.

### Two things not to use

**MinIO**, if we ever replace B2. It is the reflexive answer for self-hosted
S3 and it is now a trap: the admin console was stripped from the community
edition in May 2025, the project went to maintenance mode that December, and
the open-source repository was archived on 25 April 2026 — no releases, no
patches, no official binaries. The live options are **Garage** (AGPLv3),
**SeaweedFS** (Apache-2.0) or **RustFS** (Apache-2.0).

**PeerTube, MediaCMS, Owncast.** All good software, all the wrong shape. The
first two are complete video platforms with their own accounts, database and
UI — adopting one means bolting a second product onto Virgo rather than adding
a feature. Owncast is live-streaming only. What we want is the pipeline those
platforms use internally: ffmpeg, nginx, hls.js.

---

## Opening port 443 — the honest trade

This is the one genuine downside, and it should be a deliberate decision
rather than a side effect.

Today the host has no inbound ports. The tunnel means the IP is not
advertised, and Cloudflare absorbs anything hostile before it reaches the
building. Pointing `media.virgo.ph` at the IP gives that up for the media
plane: the address becomes public, and a volumetric attack arrives on the
office uplink instead of on Cloudflare's network.

What keeps the blast radius small:

- **Only nginx listens.** No API, no Postgres, no pgAdmin. The application
  plane keeps dialling out through the tunnel and gains no inbound exposure.
- **nginx serves static files and nothing else.** No upstream, no database
  credentials, no request body parsing beyond a signature check.
- **Every path is signature-gated** before a file is opened — see below.
- **Rate limits per IP** with `limit_req` and `limit_conn`, sized to a
  plausible viewer rather than a plausible scraper.
- **A confirmed static IP.** If the ISP assigns dynamically, the record needs
  DDNS or the media host disappears at the next lease renewal. Worth
  confirming before building on it.

If a volumetric attack ever becomes a real problem, the fallback is to flip
that one DNS record back to proxied and accept the CDN question, or to put a
cheap relay in front. Neither requires redesigning anything below.

Do not commit the IP address to this repository. It belongs in the DNS record
and in the `.env`, not in a file that gets cloned.

---

## Storage layout

Renditions mirror the B2 key structure on disk, so the mapping needs no
lookup table:

```
/var/virgo/media/
  users/<uid>/albums/<album>/ceremony-hls/
      master.m3u8
      v0/init.mp4  v0/0001.m4s  …        360p
      v1/init.mp4  v1/0001.m4s  …        720p
      v2/init.mp4  v2/0001.m4s  …        1080p
  users/<uid>/albums/<album>/ceremony-web.mp4     progressive fallback
  users/<uid>/albums/<album>/ceremony-poster.webp (today: B2)
```

Add `hlsPrefixFor(key)` beside the existing `thumbKeyFor` and `posterKeyFor`
helpers, following the same `-suffix` convention.

**Quota is unaffected.** `QuotaService.storageUsed()` sums
`user_files.size_bytes` ([quota.service.ts:216](api/src/quota/quota.service.ts:216)),
and renditions never get a `user_files` row — exactly as thumbnails and
posters behave today. A ladder costs us disk, not the customer's allowance.

---

## The ladder

With `MAX_UPLOAD_BYTES` at 500 MB the sources are exports, not camera masters.
Three rungs cover every real viewing condition:

| Variant | Height | Video | Audio | Serves |
|---|---|---|---|---|
| `v0` | 360p | 800 kbps | 128 kbps | Mobile data, weak signal |
| `v1` | 720p | 2,500 kbps | 128 kbps | Good LTE, typical home fibre |
| `v2` | 1080p | 4,500 kbps | 128 kbps | Desktop review |

**Never encode a rung taller than the source.** We already store `width_px`
and `height_px` on `user_files`, so the rung list is chosen in TypeScript
before the command is built, and explicit `scale=W:H` values are emitted
rather than `-2:360`. This matters more than it looks: a `-2:360` on a 9:16
phone film yields a 202 px wide rendition, and vertical delivery is common for
this audience.

```bash
ffmpeg -i "$SOURCE" \
  -filter_complex "[0:v]split=3[a][b][c]; \
                   [a]scale=640:360[a1];[b]scale=1280:720[b1];[c]scale=1920:1080[c1]" \
  -map "[a1]" -c:v:0 libx264 -b:v:0 800k  -maxrate:v:0 856k  -bufsize:v:0 1200k \
  -map "[b1]" -c:v:1 libx264 -b:v:1 2500k -maxrate:v:1 2675k -bufsize:v:1 3750k \
  -map "[c1]" -c:v:2 libx264 -b:v:2 4500k -maxrate:v:2 4815k -bufsize:v:2 6750k \
  -map a:0 -map a:0 -map a:0 -c:a aac -b:a 128k -ac 2 \
  -preset veryfast -profile:v main -pix_fmt yuv420p \
  -force_key_frames "expr:gte(t,n_forced*2)" \
  -f hls -hls_time 6 -hls_playlist_type vod \
  -hls_segment_type fmp4 -hls_flags independent_segments \
  -hls_fmp4_init_filename "init.mp4" \
  -hls_segment_filename "$OUT/v%v/%04d.m4s" \
  -master_pl_name master.m3u8 \
  -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2" \
  "$OUT/v%v/playlist.m3u8"
```

Flag by flag, because most of these are load-bearing:

- **`-hls_segment_type fmp4`** — CMAF. The same segments can serve DASH later
  without re-packaging, and fMP4 is the only HLS container that carries HEVC
  if we ever want a 4K rung.
- **`-force_key_frames "expr:gte(t,n_forced*2)"`** — a keyframe every two
  seconds on every rung, independent of source frame rate. Fixed `-g 48` only
  aligns cleanly at some frame rates; misaligned keyframes make the player
  stutter at exactly the moment it switches quality, which is the thing this
  whole document exists to prevent.
- **`-hls_flags independent_segments`** — declares each segment separately
  decodable. Players need this to switch rungs mid-stream.
- **`-pix_fmt yuv420p`** — forces 8-bit 4:2:0. Camera exports are frequently
  10-bit or 4:2:2, which browsers cannot decode. This single flag is most of
  the fix for the "cannot play in this browser" state.
- **`-preset veryfast`** — the CPU trade. See *Capacity* below.
- **`%v` must appear in the output path** for `-var_stream_map` to fan out.
  Verify init-segment placement on the image's ffmpeg build the first time it
  runs; the `v%v/` directory layout is what the master playlist assumes.

Produce a **progressive `+faststart` MP4 alongside the ladder** — the 720p
rung with the moov atom at the front. It is the fallback for anything that
cannot do HLS, and what a player falls back to while a ladder is still
building. One extra `-map`.

---

## Playback authentication

Media is private. The token goes **in the path, not the query string**:

```
https://media.virgo.ph/<expiry>/<hmac>/users/<uid>/albums/<a>/ceremony-hls/master.m3u8
```

```nginx
location ~ "^/(?<e>\d+)/(?<h>[\w-]+)/(?<key>.+)$" {
    secure_link      $h,$e;
    secure_link_md5  "$e/$key $media_secret";
    if ($secure_link = "")  { return 403; }   # bad signature
    if ($secure_link = "0") { return 410; }   # expired
    root             /var/virgo/media;
    try_files        /$key =404;
}
```

**A path prefix rather than a query parameter, because query strings do not
survive.** A playlist's segment URIs are relative, and no player propagates
the manifest's query string to them — not native Safari, not ExoPlayer, not
AVPlayer. hls.js can be made to with a custom loader, but the other two
cannot, and we have three playback surfaces. A signed *path prefix* is
inherited automatically by every relative URI beneath it, so `v1/0007.m4s`
resolves under the same signature with no player cooperation at all.

This is the same shape as the existing client-delivery model, where
[the token is the credential](DOMAINS.md).

Sign the expiry rounded down to a window, the way `MEDIA_URL_WINDOW_SECONDS`
already does for presigned URLs ([storage.config.ts:87](api/src/storage/storage.config.ts:87)).
Byte-identical URLs inside a window are what let the browser reuse what it
has instead of refetching. For playlists use the 24-hour
`PUBLISHED_URL_TTL_SECONDS` so a long film cannot expire mid-playback.

The API needs the same secret to mint these — one new `MEDIA_LINK_SECRET` in
`.env`, read by both the API and the nginx container.

---

## When transcoding happens

**Not on upload.** A client-delivery archive is write-heavy and read-light:
most films are uploaded, delivered to one couple, and never streamed again.
Building a ladder for every upload spends CPU and disk on work nobody will
stream.

**Build the ladder when an album is shared**, in `AlbumShareService`, and on
first playback as a backstop. The share flow is already a deliberate,
user-initiated moment with a natural place to show "preparing your films", and
it limits ladder storage to albums that actually get delivered.

Either way, **do not block `processing_status = 'ready'` on the transcode.**
Metadata and the poster stay on the fast path so galleries render immediately;
the ladder lands afterwards and the player falls back to the progressive copy
until `hls_key` is set. Add `'packaging'` as a status alongside the existing
`pending` / `ready` / `failed`.

The claim loop needs no redesign. `MediaProcessingService.claimBatch()`
already does lease-based claiming with `for update skip locked`, attempt
counting and exponential backoff — a transcode is just a slower job in the
same queue.

---

## Images

We generate one fixed 640 px WebP (`THUMB_EDGE` in
[thumbnails.service.ts](api/src/storage/thumbnails.service.ts)) for the grid,
and then serve the **full original** the moment anybody opens one — a 6 MB
camera JPEG, or a 40 MB TIFF, to fill a viewport about 1400 px wide, fetched
from California. Intermediate copies fix that.

### Not imgproxy, and the reason is specific to this codebase

The obvious answer is an on-demand resizer — imgproxy on the media host,
reading B2, negotiating AVIF/WebP, any size on request. That was the plan
here until phase 2 made the shape of the problem concrete.

**`ThumbnailsService.generate` already reads the entire original out of B2, on
the confirm path, into a buffer.** It has to: it is making the thumbnail. So
at the exact moment a display copy is wanted, the bytes are already in memory
and the expensive part is already paid. A resize from that buffer is noise
next to the fetch that produced it.

An on-demand resizer would throw that away and make the same trans-Pacific
fetch again — per size, per cold cache miss, with somebody waiting. A
200-photo gallery opened for the first time would pull 200 originals across
the Pacific to produce a few hundred kilobytes each.

So the copies are made where the source already is. The costs of that choice,
stated plainly:

- **The width set is fixed** (`DISPLAY_WIDTHS`), not arbitrary. Changing it
  means re-running the backfill, not editing a URL.
- **No format negotiation.** Everything is WebP. AVIF would save perhaps
  another 30% and costs seconds per image to encode, which on a 200-photo
  wedding is minutes added to a request somebody is waiting on.
- **Storage instead of CPU.** Two extra files per photograph, on a volume
  that still has no sweep.

imgproxy remains the right answer if arbitrary sizes or AVIF ever matter more
than those three. Nothing here blocks it — it would slot in behind the same
signed paths.

---

## Client changes

| Surface | File | Change |
|---|---|---|
| Web app | [media-viewer.tsx](web/src/components/media/media-viewer.tsx) | `VideoPlayer` attaches hls.js to the existing `<video>` when `hlsUrl` is present and `canPlayType('application/vnd.apple.mpegurl')` is empty. Safari uses the URL natively. The whole custom control bar is untouched |
| Mobile | [videos.tsx](mobile/app/(app)/albums/[albumId]/videos.tsx) | Pass `hlsUrl` as the `VideoSource`. On iOS set `contentType: 'hls'` — expo-video needs it when the URI does not end in `.m3u8` |
| Client gallery | [client-gallery.template.ts](api/src/albums/share/client-gallery.template.ts) | hls.js must be **served from our own origin** and carry the page nonce. This route is server-rendered with `script-src 'nonce-…'` and no external script sources |

`src/api/**` and `src/hooks/**` are duplicated byte-for-byte between `web/` and
`mobile/`. Adding `hlsUrl` to `StoredFile` means changing both, then running
`node scripts/check-client-sync.mjs`.

### CSP — three changes, all of them blocking

`AlbumShareService.contentSecurityPolicy()`
([album-share.service.ts:172](api/src/albums/share/album-share.service.ts:172))
needs all three before hls.js works at all:

1. **`connect-src` must be added.** It is absent today, so it inherits
   `default-src 'self'`. hls.js fetches segments over XHR rather than through
   the video element, so every segment request is blocked until
   `media.virgo.ph` is listed here. Native HLS does not hit this, which makes
   it present as a Chrome-only bug.
2. **`media-src` needs `blob:`.** MSE attaches the stream through a blob URL.
3. **`script-src`** must admit the self-hosted hls.js bundle under the nonce.

`StorageConfig.mediaOrigins()` is the right place to add the media hostname —
it already exists to feed exactly these directives and is documented as
needing to reflect where media really resolves.

### CORS on the media host

For the same reason, nginx must return `Access-Control-Allow-Origin` for the
app origins. hls.js reads segments with `fetch`/XHR, which is a cross-origin
request subject to CORS; a plain `<video src>` is not. Missing this produces
exactly the same symptom as the CSP gap — works in Safari, fails everywhere
else.

---

## Capacity

**Uplink.** A gigabit symmetric connection, budgeting ~60% for media:

| Rendition | Bitrate | Concurrent viewers |
|---|---|---|
| 1080p | 4.5 Mbps | ~130 |
| 720p | 2.5 Mbps | ~240 |
| 360p | 0.8 Mbps | ~750 |

Adaptive bitrate raises the real figure well above these, because most mobile
viewers settle on 720p or below. This is not the binding constraint at any
plausible near-term scale.

**Transcode CPU is the binding constraint.** A three-rung 1080p ladder at
`-preset veryfast` runs roughly 3–6× realtime on a decent eight-core machine —
a five-minute film is one to two minutes of one core. `BATCH_SIZE = 4` in
[media-processing.service.ts](api/src/storage/media-processing.service.ts:14)
is sized for poster frames, not transcodes; four concurrent ladders will
saturate the host and starve the API and Postgres alongside it. **Drop
transcode concurrency to 1–2 and widen `CLAIM_LEASE_MINUTES`.**

If the box has an NVIDIA GPU, `h264_nvenc` is 10–20× faster than libx264 and
frees the CPU entirely — but GPU passthrough into Docker Desktop on Windows
needs WSL2 with the CUDA runtime, which is enough friction to treat as a later
optimisation rather than part of the first build.

**Disk.** ~300 MB per film. Watch the volume, and add the LRU sweep before it
matters rather than after.

**B2 egress falls, it does not rise.** Originals are pulled once per transcode
instead of once per view. Streaming stops touching B2 entirely.

---

## Related hazard: `download.zip`

Worth recording because it shares the uplink and will be the first thing to
saturate it.

`GET /s/:token/download.zip` ([album-share.controller.ts:206](api/src/albums/share/album-share.controller.ts:206))
streams every original out of B2, through the API, through `cloudflared`, to
the client. One client downloading a 20 GB wedding album consumes B2 egress,
inbound bandwidth and outbound bandwidth simultaneously, for as long as it
takes.

Gigabit makes this survivable rather than fixed. The real fix is to stop
proxying bytes we do not need to touch: single-file downloads should be a 302
to a presigned B2 URL rather than a stream through the API, and the zip route
should be rate-limited per token. Out of scope here, but it belongs on the
same list.

---

## Phase 1 runbook — standing up the media host

Built. What exists in the repository:

| File | Role |
|---|---|
| [deployment/media/nginx.conf.template](deployment/media/nginx.conf.template) | The whole media host. Rendered by the official image's envsubst entrypoint |
| [deployment/media/cloudflare-dns.ini.example](deployment/media/cloudflare-dns.ini.example) | Template for the certbot DNS-01 token |
| [docker-compose.prod.yml](docker-compose.prod.yml) | `media` and `certbot` services, `virgo_media` and `virgo_certs` volumes |
| [scripts/sign-media-url.mjs](scripts/sign-media-url.mjs) | Mints signed URLs. Verification tool now, reference implementation for the API later |
| [.env.production.example](.env.production.example) | `MEDIA_HOST`, `MEDIA_LINK_SECRET`, `MEDIA_CERT_EMAIL` |

Nothing serves media yet — the volume is empty and no application code points
at the hostname. That is the point of doing it first: the door gets proven
before anything depends on it.

### 1. DNS and the router

Add an `A` record for `media.virgo.ph` pointing at the WAN address, **DNS-only
— grey cloud, not orange**, and no tunnel route. Forward TCP 443 to the
production machine.

Confirm the record is not proxied before going further. A proxied record
returns a Cloudflare certificate and the DNS-01 challenge still passes, so the
mistake does not announce itself — it just quietly puts media back on a CDN.

```powershell
# Should print the WAN address, not a Cloudflare 104.x / 172.x address.
Resolve-DnsName media.virgo.ph -Type A -Server 1.1.1.1 | Select-Object IPAddress
```

### 2. Secrets

In the production `.env`:

```powershell
MEDIA_HOST=media.virgo.ph
MEDIA_LINK_SECRET=<openssl rand -base64 36>
MEDIA_CERT_EMAIL=<a mailbox someone reads>
```

Then the certbot token, which is a separate file because certbot wants an ini:

```powershell
Copy-Item deployment\media\cloudflare-dns.ini.example .\cloudflare-dns.ini
# Fill in a token scoped to Zone → DNS → Edit on virgo.ph and nothing wider.
```

`cloudflare-dns.ini` is gitignored. It belongs beside `docker-compose.prod.yml`
on the host, not in the repository.

### 3. The first certificate

A one-off, because nginx cannot start without a certificate and a container
that cannot read one crash-loops rather than waiting. The `--entrypoint`
override is needed because the `certbot` service replaces the image's
entrypoint with a renewal loop.

```powershell
docker compose -f docker-compose.prod.yml run --rm --entrypoint certbot certbot `
  certonly --dns-cloudflare `
  --dns-cloudflare-credentials /run/secrets/cloudflare.ini `
  --dns-cloudflare-propagation-seconds 30 `
  -d media.virgo.ph `
  --email $env:MEDIA_CERT_EMAIL --agree-tos --no-eff-email --non-interactive
```

Add `--dry-run` first. Let's Encrypt allows five duplicate certificates per
week and a typo in the token burns an attempt.

### 4. Start

```powershell
docker compose -f docker-compose.prod.yml up -d media certbot
```

```powershell
docker compose -f docker-compose.prod.yml logs --tail 40 media
```

The envsubst entrypoint prints the template it rendered. If `${MEDIA_HOST}`
appears literally in that output, `NGINX_ENVSUBST_FILTER` is not matching and
the config is broken in a way nginx will not complain about.

### 5. Prove it

Drop a probe file into the volume. The compose project prefixes volume names
with the directory name, so read the real name rather than assuming it:

```powershell
$vol = docker volume ls --format '{{.Name}}' | Select-String 'virgo_media' | ForEach-Object { $_.ToString() }
docker run --rm -v "${vol}:/srv/media" alpine sh -c 'echo ok > /srv/media/probe.txt'
```

Mint a URL. Signing is offline, so this runs anywhere the repository and the
secret are — the production host does not need a checkout:

```powershell
$env:MEDIA_HOST = 'media.virgo.ph'
$env:MEDIA_LINK_SECRET = '<the same value as .env>'
node scripts/sign-media-url.mjs probe.txt
```

Four checks, and all four matter:

| Request | Expected | Proves |
|---|---|---|
| The signed URL | `200 ok` | Certificate, routing, port forward, signature verification |
| `https://media.virgo.ph/probe.txt` | `404` | Unsigned paths are not served |
| The signed URL with one character of the signature changed | `403` | Signatures are actually checked, not merely parsed |
| A URL signed with `ttl` of `-86400` | `410` | Expiry is enforced |

```powershell
curl.exe -sS -o NUL -w "%{http_code}`n" "<signed url>"
```

The 403 case is the one worth being fussy about. A misconfigured
`secure_link_md5` expression fails open in exactly one direction — it can
return 403 for everything, which looks obviously broken, or it can be fed a
signature it never really validates, which looks like success. Tamper with a
character and confirm the 403 before trusting it.

---

## Phase 2 runbook — the proxy rendition

Built. A film now gets a second copy — 1280 on its long edge, H.264/AAC,
`+faststart` — written to the media volume and handed to players in place of
the camera original.

| File | Change |
|---|---|
| [api/migrations/060_media_proxy_rendition.sql](api/migrations/060_media_proxy_rendition.sql) | `proxy_key`, and a requeue of existing films |
| [api/src/storage/media-link.service.ts](api/src/storage/media-link.service.ts) | Signs rendition URLs, stages and publishes files, removes them |
| [api/src/storage/media-processing.service.ts](api/src/storage/media-processing.service.ts) | `createProxy`, `proxyScale`, and the concurrency changes below |
| [api/src/storage/storage.service.ts](api/src/storage/storage.service.ts) | `proxyUrl` on every listed file; rendition cleanup on all three delete paths |
| [api/src/albums/share/album-share.service.ts](api/src/albums/share/album-share.service.ts) | `proxyUrl` on the client gallery, plus the media origin in its CSP |
| [api/Dockerfile](api/Dockerfile) | `/srv/media` created owned by `node` |
| web + mobile `storage.ts`, the three players | Prefer `proxyUrl`, fall back to `url` |

**`MEDIA_HOST` empty turns all of it off.** No renditions are produced,
`proxyUrl` is null everywhere, and every player falls back to the B2 original
exactly as before. That is the safe state to deploy into.

### Ordering, because one step is not reversible in place

1. **Rebuild and deploy the API image first.** The Dockerfile change is what
   makes the volume writable, and it only takes effect when Docker seeds an
   *empty* volume from the image. A `virgo_media` created during phase 1
   already exists and is root-owned, so on that machine it needs a one-off:

   ```powershell
   $vol = docker volume ls --format '{{.Name}}' | Select-String 'virgo_media' | ForEach-Object { $_.ToString() }
   docker run --rm -v "${vol}:/srv/media" alpine chown -R 1000:1000 /srv/media
   ```

   1000:1000 is `node` in the official Node images. Skipping this looks like
   success — the worker logs `Proxy failed … EACCES` at warn level and every
   film silently keeps falling back to the original.

2. **Then run migration 060.** Its tail requeues every existing film, so the
   worker starts encoding as soon as it is applied. On a library of any size
   that is hours of CPU at two concurrent jobs — deliberate, but worth
   starting when nobody is waiting on an upload.

3. **Watch the first few.**

   ```powershell
   docker compose -f docker-compose.prod.yml logs -f api | Select-String 'Proxy|MediaLink'
   ```

### What changed about how hard the worker runs

`BATCH_SIZE` drops from 4 to 2 and `CLAIM_LEASE_MINUTES` rises from 15 to 45.
Four concurrent poster frames is nothing; four concurrent H.264 encodes on a
box also running Postgres, the API and two Next servers is an outage. The
lease has to outlast the slowest job it can claim — `PROXY_TIMEOUT_MS` is 20
minutes — or a second tick picks up a film that is still encoding and both
write the same output.

The presigned source URL also went from 20 minutes to 60: ffmpeg reads the
original over HTTP for the whole encode, and a URL that expires mid-transcode
fails at whatever percentage it had reached.

### Failure is soft, and that has a consequence

`createProxy` never throws, on the same reasoning as
`ThumbnailsService.generate`: metadata and the poster are already computed by
the time it runs, and losing those to a failed encode would cost the gallery
its film tile as well as its playback.

The cost of that choice is that **a failed proxy is never retried by the
queue** — the job completes, `proxy_key` stays null, the player falls back.
`proxy_key is null` is the backfill predicate and the `update` at the end of
migration 060 is the tool for it.

### Deletion

Renditions are not bucket objects, so the B2 sweep does not reach them. All
three delete paths clean up explicitly, and the key is *derived* from the
original rather than read from the row — which means it still works for
objects whose `user_files` row was never written, of which the bucket has
had more than anyone would like.

| Path | Cleanup |
|---|---|
| `deleteObject` | `removeFor([key])` |
| `deleteKeys` | `removeFor(keys)` — from what was asked for, not what came back deleted |
| `wipeAll` | `removeTree('users/<id>')` — one call, and it collects orphans too |

### Still outstanding

- **No LRU sweep yet.** Nothing bounds the volume. `proxy_key` plus
  `processed_at` is enough to write one; until then, watch the disk.
- **Audio gets no proxy**, deliberately — there is nothing worth re-encoding
  for a player that already handles mp3, aac and flac.

---

## Phase 3 runbook — responsive photographs

Built. A photograph now gets up to two intermediate copies — 1024 and 2048 on
the long edge, WebP — written to the media volume by the sharp pass that was
already reading the original.

| File | Change |
|---|---|
| [api/migrations/061_image_display_renditions.sql](api/migrations/061_image_display_renditions.sql) | `display_widths integer[]` |
| [api/src/storage/media-link.service.ts](api/src/storage/media-link.service.ts) | `DISPLAY_WIDTHS`, `displayKeyFor`, `renditionKeysFor`, `displaySources`, `write` |
| [api/src/storage/thumbnails.service.ts](api/src/storage/thumbnails.service.ts) | `createDisplayCopies`, off the buffer it already had |
| [api/src/storage/storage.service.ts](api/src/storage/storage.service.ts), [album-share.service.ts](api/src/albums/share/album-share.service.ts) | `displaySources` on both list paths |
| web + mobile `storage.ts` | `displaySources`, `displaySrcSet`, `largestDisplaySource` |
| [media-viewer.tsx](web/src/components/media/media-viewer.tsx), [viewer.tsx](mobile/app/(app)/albums/[albumId]/viewer.tsx), [client-gallery.template.ts](api/src/albums/share/client-gallery.template.ts) | Real `srcset` on web and the gallery; widest copy on mobile |

`DISPLAY_WIDTHS` is `[1024, 2048]`. Two, not a ladder: 1024 covers a phone
lightbox and a grid tile at any density, 2048 covers a laptop at 1x and a
phone at 3x, and anything between them is a rounding error the browser
resolves by itself. A source is never enlarged, so a 900 px scan gets
neither.

### No requeue in the migration, unlike 060

Display copies are made on the **confirm path**, not by the background queue.
Generating them for an existing library means reading every original back out
of B2 — a real egress bill and a long run — so it is an operator decision:

```powershell
docker compose -f docker-compose.prod.yml exec api node scripts/backfill-thumbnails.mjs
```

Until that runs, older photographs keep serving their original on open, which
is exactly what they did before. Nothing breaks while it is pending.

### One thing that was already true and is now load-bearing

The web viewer preloaded the two neighbouring images on every step through an
album, from `url` — the originals. That was two camera files nobody had asked
to see yet, on every arrow-key press. It now preloads the display copy.

### What it costs

Two extra sharp passes on confirm, from a buffer that is already in memory.
The B2 read dominates that request by an order of magnitude, so the added
latency is small — but it is on a request somebody is waiting on, which is
why the widths stop at two and the format stays WebP.

Storage: roughly 150–400 KB per photograph for both copies, against originals
measured in megabytes. **The volume still has no sweep.** Between this and
the film proxies, that is now the thing most likely to need attention first.

---

## Sequencing

Each phase is independently shippable and independently useful.

1. **Stand up `media.virgo.ph`** — DNS-only record, nginx on 443 with
   Let's Encrypt via DNS-01, `secure_link`, rate limits, serving an empty
   volume. Proves the door works before anything depends on it. **Built —
   see the runbook above.**
2. **`+faststart` 720p proxy** per film, written by the existing worker to the
   volume. Retires the "cannot play in this browser" state and most
   buffering, and puts real traffic on the new host. **Built — see the
   runbook above.**
3. **Responsive image sizes** across the three surfaces. **Built — see the
   runbook above.** Done with the existing `sharp` rather than imgproxy; the
   *Images* section has the reasoning.
4. **The HLS ladder**, hls.js and expo-video. The adaptive-bitrate piece.

Phases 1 and 2 are most of what a viewer will notice. Phase 4 is the feature
as originally framed and is worth doing, but it is the least urgent of the
four — and it is much less work once the host and the transcode path exist.

---

## What this design gives up

**Viewers outside the Philippines get a worse experience than a global CDN
would give them.** Someone watching from California hits a Manila origin
instead of a nearby edge. For a network built around Philippine creatives and
their local clients that is the correct trade, but destination weddings and
overseas family are a real segment and this will be visible to them. The
mitigation, if it becomes a complaint, is one cache node abroad — the design
above does not have to change to accommodate one.

**Availability is now our problem.** If the host is down, media is down. That
was already true of the application, so it adds no new single point of
failure, but it does put films on the same fate-sharing line as the API.

---

## Open questions

- **Is the public IP static?** If the ISP assigns dynamically, `media.virgo.ph`
  needs DDNS or it breaks at the next lease renewal.
- **Does the box have a usable GPU?** NVENC would remove transcode CPU as the
  binding constraint entirely.
- **Retention policy for ladders.** Renditions are reproducible, so a sweep
  that drops them for albums unshared for N months bounds disk growth at the
  cost of one re-transcode. What is N?
