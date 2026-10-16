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
