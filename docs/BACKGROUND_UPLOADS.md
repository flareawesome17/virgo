# Background uploads on the phone

Scoping the work to make an upload survive the app being closed, and correcting
a claim made in #56 while doing it.

## The correction first

#56 says, in its description and in its commit message:

> It does not survive the app being backgrounded. iOS suspends JavaScript a few
> seconds after the app leaves the screen, and an upload in flight stalls.

**That is wrong.** The transfer already runs in a native background session on
both platforms, and has all along. From `expo-file-system`'s own type
definitions, on `FileSystemUploadOptions` — the options both `uploadAsync` and
`createUploadTask` take:

> A session type. Determines if tasks can be handled in the background. On
> Android, sessions always work in the background and you can't change it.
> `@default FileSystemSessionType.BACKGROUND` `@platform ios`

So the bytes keep moving when the app leaves the screen. What stops is
JavaScript, and the consequences of that are narrower — and cheaper to fix —
than a native module.

## How an upload works today

Three steps, in `mobile/src/api/endpoints/storage.ts`:

1. **Ticket** — `POST /storage/upload-url` returns a presigned PUT URL, the
   object key, and required headers.
2. **PUT** — `FileSystem.createUploadTask(ticket.uploadUrl, fileUri, …)` sends
   the file straight to Backblaze. Binary content, streamed from disk, never
   read into memory.
3. **Confirm** — `POST /storage/confirm` with the key and album id. This is
   what attaches the object to an album and makes it real to the rest of the
   product.

Step 2 is the long one and it is the one already handled natively. Steps 1 and 3
are ordinary API calls that need JavaScript to be running.

## What actually breaks, and how badly

### The app is backgrounded, not killed

The PUT continues. JavaScript is suspended, so:

- `onProgress` stops firing — the bar and the notification freeze at whatever
  they last showed
- the promise resolves on resume, and `confirm()` runs then

**Severity: cosmetic.** The upload completes and is confirmed a moment after
you return. The progress display lies for the duration, which is worth fixing
but is not data loss.

### The app is terminated

The session can still finish the transfer, and iOS will relaunch the app in the
background to hand over the result — `expo-file-system` registers
`application(_:handleEventsForBackgroundURLSession:completionHandler:)` for
exactly this, in `FileSystemBackgroundSessionHandler.swift`.

But the JavaScript promise that would have called `confirm()` belonged to a
process that no longer exists. Nothing re-establishes it.

**Severity: this is the real bug.** The bytes land in Backblaze, the object
occupies storage, and it is attached to no album and counted in nothing. It is
invisible to the person who uploaded it and to every screen in the app. There
is no sweep for this: `media-sweep.service.ts` collects renditions whose row is
gone, not objects that were never confirmed in the first place.

### The queue waits more than fifteen minutes

`UPLOAD_URL_TTL_SECONDS` is `15 * 60`. A ticket minted for a file that has not
started uploading by then is dead, and the PUT will fail with a signature error
that reads like nothing in particular.

**Severity: real, and more likely than it sounds** — twenty large videos on a
slow connection will take longer than fifteen minutes to get through, and every
ticket after the first few is minted before it is needed.

## The work

In the order the value actually falls.

### A. Persist the queue and reconcile on launch

JavaScript only.

Write the queue to storage as tasks change — key, album id, local uri, status.
On launch, for anything left `uploading`, call `confirm()`: it already answers
`{ exists, size }`, so the server tells us whether the object landed. Confirm
the ones that did, re-queue the ones that did not, and drop the row.

This closes the orphan hole, which is the only part of this that loses
somebody's photographs.

**Cost:** a day, roughly. `expo-sqlite` or AsyncStorage, both already
dependencies. **Ships over the air** — no new binary, no fingerprint change.

### B. Mint the ticket at the last moment, and re-ticket on expiry

JavaScript only.

Today `uploadFile` tickets and PUTs in one call, so a queued file tickets when
its turn comes — which is already correct. What is missing is the retry: a PUT
that fails on an expired signature should ticket again and retry once, rather
than surfacing as a failed upload.

**Cost:** half a day. **Ships over the air.**

### C. Live progress while the app is away

Native.

Android can show real progress in a foreground service notification. iOS
cannot — there is no progress notification on that platform, and Apple gives no
way to update a delivered one from a suspended app.

**Cost:** a config plugin and a native service on Android, nothing achievable on
iOS. **Needs a new binary**, and therefore a fingerprint change and a runtime
version that existing installs will not match until they update.

**Recommendation: do not.** It buys an accurate progress bar on one platform
for the price of a native dependency and a forced binary update. A and B make
the upload *correct*; this only makes it prettier while nobody is looking.

### D. A custom Expo module wrapping URLSession and WorkManager

This is what #56 implied was necessary. Having read the library, it is not:
`expo-file-system` already uses the background session, and a module of our own
would be reimplementing it to gain the ability to run `confirm()` from a
relaunched process — which A achieves in JavaScript, at a fraction of the cost.

There is no maintained off-the-shelf library to lean on either.
`react-native-background-upload` was last published in **October 2022**, four
years ago, against `react-native >= 0.47`; this app is on 0.81 with the New
Architecture.

**Recommendation: no, unless A proves insufficient in practice.**

## What to do

1. **A**, then **B**. Both are JavaScript, both ship over the air, and together
   they turn "the upload may silently vanish" into "the upload completes or is
   retried".
2. Nothing else, until there is evidence something else is needed.

The honest summary is that #56 delivered more than it claimed, and the gap that
remains is not the transfer — it is the bookkeeping either side of it.
