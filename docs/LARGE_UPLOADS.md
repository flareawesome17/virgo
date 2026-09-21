# Uploading what photographers actually have

Scoping multi-gigabyte and bulk uploads. The app is for people who shoot, and
they arrive with a card full of footage — a single file of several gigabytes, or
a batch adding up to ten. Today the API refuses anything over 500 MB.

## What actually blocks it

Two things, and neither is the storage plan.

**`MAX_UPLOAD_BYTES = 500 * 1024 * 1024`** in `api/src/storage/storage.config.ts`,
enforced by a DTO `@Max` and again in the service. A 4 GB file is refused before
a byte moves.

**`UPLOAD_URL_TTL_SECONDS = 15 * 60`.** A presigned URL is good for fifteen
minutes and the upload is one PUT, so the transfer has to finish inside that
window. On a Philippine mobile connection at a realistic 5 Mbps, fifteen minutes
carries about 560 MB — which is roughly where the 500 MB cap came from, whether
or not that was deliberate. Raising the cap alone would replace "refused
immediately" with "uploads for twenty minutes, then fails, then starts again
from zero and fails the same way".

Storage plans are not the constraint: free is 15 GB, paid are 100 GB and 500 GB
(`api/src/quota/quota.config.ts`). A 10 GB batch fits.

## What makes it possible

S3 multipart upload, which Backblaze's S3-compatible API supports. The object is
started once, sent as independent parts, and assembled server-side:

```
CreateMultipartUpload  -> uploadId
UploadPart  x N        -> one ETag each, each with its own presigned URL
CompleteMultipartUpload(parts) -> the object exists
```

Every part gets its own URL, minted when that part is about to be sent, so the
fifteen-minute window stops mattering. A part that fails retries alone rather
than restarting the file. And a part is a bounded piece of work, which is what
makes progress and resume honest.

The client-side primitive exists on both sides, which was the open question:

- **Web** — `File.slice(start, end)` returns a `Blob`.
- **Mobile** — the current `expo-file-system/legacy` import has no such thing,
  but the modern API does: `File.slice(start, end, contentType): Blob`, plus
  `FileHandle` with `offset`, `size` and `readBytes`. A Blob from `slice` is
  backed by the file rather than the JS heap, so a part does not have to be read
  into memory to be sent.

One design, both clients.

## Shape

**Four endpoints**, beside the existing single-PUT flow rather than replacing it:

| | |
| --- | --- |
| `POST /storage/multipart/start` | returns `key` and `uploadId` |
| `POST /storage/multipart/part-url` | a presigned URL for one part |
| `POST /storage/multipart/complete` | takes the ETags, assembles, then confirms |
| `POST /storage/multipart/abort` | gives up and releases the parts |

Small files keep the single PUT. Multipart costs three extra round trips, which
is noise on 4 GB and waste on a 2 MB photograph — so the client picks by size,
somewhere around 100 MB.

**Part size: 16 MB.** S3 requires at least 5 MB per part except the last, and
allows at most 10,000 parts. At 16 MB a 10 GB file is 640 parts, comfortably
inside that, and each part is a small enough unit that a retry costs seconds.
Larger parts mean fewer round trips and more to lose on a failure.

**Resume** falls out of the queue already persisted in #59. Storing `uploadId`
and the ETags collected so far means an upload interrupted by the app closing
continues from the part it reached, rather than starting the file again —
which for 10 GB is the difference between a nuisance and an impossibility.

## The part that costs money if it is forgotten

**An incomplete multipart upload keeps its parts, and Backblaze bills for
them.** A user who starts a 10 GB upload and gives up leaves 10 GB of parts
that belong to no object, are invisible in the bucket listing, and are charged
for every month until something removes them.

Two things, not one:

1. `abort` called on cancellation and on a failure the client gives up on.
2. A lifecycle rule on the bucket to abort incomplete uploads after a few days,
   because the first one cannot be relied on — the app that was going to call it
   is the one that crashed.

`media-sweep.service.ts` will not catch these; it collects renditions whose row
is gone, and an abandoned part has no row anywhere.

## What has to change besides the upload

- **`MAX_UPLOAD_BYTES`** becomes the multipart ceiling. S3 allows 5 TB; the
  sensible limit is whatever the plan allows, so the check becomes "does this
  fit in your remaining storage" rather than a fixed number.
- **The client-side guard added in #67** currently names 500 MB. It should name
  the real limit, and for a bulk selection it should be checked against the
  batch, not one file at a time.
- **`confirm`** already verifies the object exists; it needs no change, but it
  must run after `complete` rather than after a PUT.

## Risk, honestly

The transfer is the well-understood part. The two things worth watching:

**Memory on older phones.** A Blob from `slice` should be file-backed, not
heap-backed, but "should" is doing work in that sentence — it needs measuring on
a real device with a real 4 GB file before this is called done.

**Orphaned parts.** See above. The lifecycle rule is not optional, and it is a
bucket setting rather than code, so it cannot be reviewed in a pull request.

## Order

1. The API endpoints, with `abort` wired from the start rather than added after.
2. The bucket lifecycle rule.
3. Mobile, since that is where the 10 GB batches come from, and where the file
   primitive is new.
4. Web, which reuses the same endpoints and already has `File.slice`.
5. Raise the cap, last — the ceiling should not move until everything under it
   can carry the weight.
