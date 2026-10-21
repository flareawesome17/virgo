# Client downloads — what broke, and the long-term plan

## What broke (Oct 2026)

| Symptom | Cause | Fixed in |
|---|---|---|
| "InvalidRequest … must use valid extended value syntax" | `filename*` left `! ' ( ) *` unencoded; B2 rejects the signed header | `download-names.ts` |
| XML "Request has expired" after leaving the tab open | Gallery embedded pre-signed B2 URLs (valid 18–24 h) | `GET /s/:token/files/:id/download` signs at click time |
| Raw storage error pages for clients | Any signing defect surfaced as B2 XML | Same route; failures render our own page |
| Gallery 500 on certain album names | `encodeURIComponent` throws on a half-cut emoji | `contentDisposition` repairs surrogates |
| Downloads do nothing in Messenger/Facebook | In-app browsers cannot save files | Banner telling the client to open in Safari/Chrome |
| Slow zips | One B2 round trip per file, strictly serial | `streamZip` opens the next object while sending the current one |
| Dead page (524) on a big zip when storage is slow | No bytes sent for 100 s | `flushHeaders()` (was uncommitted; now committed) |
| 1 GB+ "Download all" stuck on "Preparing", then "could not prepare" | archiver's `append()` only queues, so `zipInto` opened every file at once (up to the whole 50-socket B2 pool); one connection storage dropped while it waited froze the archive with no error until the 3-minute stall check | `zipInto`: truly one ahead (paced on archiver's `entry` events), a broken read carries on from its byte offset (`reopen`), and an unreadable entry ends the zip at once |
| API process exits when a zip build is stopped | The stall, abandon and cache-full checks destroy the build's file stream with an error nobody listened for yet: an uncaught exception. The restart also wiped every built zip | `ZipCacheService.build` listens on the stream; `finished(out)` still reports the error |
| Connections left open after a build stopped | Opened-but-unread streams were never closed | `zipInto` closes every stream it opened when the zip ends |
| "139 of 139 files, about a minute left" with most of the gigabyte to come | Progress counted opens, not bytes written | Progress and ETA by bytes from `user_files.size_bytes` |
| Client loses their place after switching to Messenger | Queued zips dropped after 5 min, builds after 10, without a page refresh; phones pause background tabs | 30 min for both |
| Page frozen on "Preparing" while the zip quietly downloads | The waiting page's refresh turned into the download | The refresh (`?wait`) lands on "Your download is ready" with a Download button; failed builds retry themselves 3 times (`?try`) |
| Resumed zip downloads stall (206 then no bytes) or reset | A path ending in `.zip` is cache-eligible at Cloudflare (`cf-cache-status: BYPASS`, Cache-Control rewritten), so ranges take its origin-range path; single files (`DYNAMIC`) were fine at the same moment | Zips moved to `/s/:token/zip` and `/s/:token/picks/zip`; the `.zip` addresses redirect there |

## Long-term plan

1. **Measure first.** Pull B2 egress and the API's zip logs for 2 weeks. Decide with numbers.
2. **Move delivery bytes off B2-US-East.** Backblaze has no Asia region; every byte crosses the Pacific
   (~200 ms RTT) and is billed past the free 3x-stored allowance. Preferred: copy delivered albums to
   Cloudflare R2 (egress free, Manila PoP) behind a signing Worker, matching `docs/MEDIA_DELIVERY.md`.
   Fallback: serve from the Philippine host's volume with the existing nginx `secure_link`.
3. **Resumable zips.** Send `Content-Length` (stored zips are computable) and support `Range`, so a
   dropped mobile connection resumes instead of restarting a multi-GB album.
4. **Pre-built zips.** Build the album zip once when the album is delivered, store it, serve a signed
   link. Removes API/uplink load from the click path entirely.
5. **Alerting.** Count download refusals/502s per day and notify on a spike, so the next regression
   is found by us before a client.
6. **Contract test.** Keep the RFC 5987 grammar test; add a nightly real-B2 probe that signs a hostile
   filename and fetches it.

## Host download cache (Oct 2026)

Client downloads (single file and zips) now go through `DownloadCacheService`: a bounded disk cache on the
production host (`virgo_dlcache` volume, `DOWNLOAD_CACHE_MAX_GB`, default 40; `DOWNLOAD_CACHE_MAX_OBJECT_MB`,
default 2048; `0` disables). First download of an object tees B2 -> disk -> client; later ones are served from
the host's own uplink with Range/resume support and no B2 egress. Partial copies are never served (`.part` then
atomic rename), LRU eviction keeps it under the cap, and any cache failure falls back to the signed B2 link, so
the cache can only help. Cost: $0 (disk and uplink already owned). Bytes still ride the existing Cloudflare
tunnel, exactly as zips already did.
