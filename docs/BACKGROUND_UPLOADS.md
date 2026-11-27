# Background uploads on the phone

How a batch keeps uploading after Virgo leaves the screen, and why it needed
native code after all.

## History

The first version of this document (bde4961) argued that no native module was
needed: expo-file-system already sends each file in a background URL session,
so it recommended only (A) saving the queue and reconciling it on launch, and
(B) asking for a fresh ticket when one expires. Both shipped, as did a burst of
eight small files handed to iOS when the app leaves the screen (#236).

In use that was not enough. A 294-file batch stopped when the app left the
screen (2026-11-27), because:

- **Only the file in flight carried on.** Starting the next file needs
  JavaScript, which iOS suspends within seconds. The burst of eight was capped
  by the fifteen-minute ticket: a file handed over too far back in the line
  reached its turn with a dead URL.
- **Android paused as well.** expo-file-system sends Android uploads with
  OkHttp inside the app's own process, not a system service, and Android 14
  freezes a cached app's process shortly after it leaves the screen.
- **A relaunched app could not find its transfers.** expo-file-system names
  its iOS background session with a fresh UUID in every process, so after iOS
  ends the app nothing can ask what that session still holds. Re-sending blind
  stores a file twice; waiting blind leaves it stuck.

## Design

Three parts. Each works without the others being current: the server half is
additive, and builds without the native module keep the queue they have.

### 1. The server takes over finishing (`api/src/storage/upload-handoff.*`)

`POST /storage/handoffs` takes up to 50 files for one album and returns, for
each, everything needed to send it with no further API call:

- under `MULTIPART_MIN_BYTES`: one presigned PUT;
- from it: a multipart upload with a presigned URL for **every** part.

Each URL lives `HANDOFF_URL_TTL_SECONDS` (24 hours) instead of fifteen
minutes, so the whole batch can be handed over at once. Type and length are
still signed in, and the key is still the server's.

Every handed-over file is a row in `upload_handoffs` (migration 116). A job
runs every minute and finishes the ones that have landed, exactly as the
phone's confirm would: for a single PUT it HEADs the object; for parts it lists
them on B2 (`ListParts`), completes the upload when all are there, and holds
the result to the same size and storage checks as `completeMultipart`. Then
`statObject` files it in its album and a thumbnail is made. So a batch arrives
in its album with Virgo closed and never reopened.

The phone still finishes what it sees land (`POST /storage/handoffs/finish`),
so files appear at once while Virgo is open; both paths are idempotent. A plain
`confirm` of a handed-over key also closes its row. `POST
/storage/handoffs/cancel` releases what the person removed. Rows past their
URLs' lifetime are closed and their parts released.

### 2. The phone hands every file to the system (`mobile/modules/virgo-uploads`)

One Expo module, the same interface on both platforms:

```ts
enqueue(items: { id: string; url: string; headers: Record<string, string>;
  file: string; offset?: number; length?: number }[]): Promise<number>;
active(): Promise<string[]>;          // ids queued or sending
takeResults(): Promise<{ id: string; status: number; error?: string }[]>;
cancel(ids: string[]): Promise<void>;
// events: 'progress' { id, sent, total }, 'finished' { id, status, error? }
```

Every item is a PUT. `offset`/`length` name one part of a file.

- **iOS:** a background `URLSession` with a fixed identifier, so a relaunched
  app reconnects to it and iOS can wake Virgo when transfers finish
  (`handleEventsForBackgroundURLSession`, through Expo's app delegate
  subscribers). All tasks are created at once, while the app is in front: iOS
  slows down tasks created from the background. A part is cut into its own
  file at enqueue (the URL session sends whole files) and deleted when sent.
  Results are written to disk as they arrive, for `takeResults` to drain
  whenever JavaScript next runs.
- **Android:** a WorkManager job that runs as a foreground service of type
  `dataSync`, with an "Uploading 12 of 294" notification. It streams each
  file, or each part's byte range, with OkHttp. It survives the app leaving
  the screen and, on most phones, being swiped away. The queue and results are
  files in the app's own storage.

### 3. The queue uses it when it is there (`UploadProvider`)

With the module present, the runner no longer sends files itself. It asks
for handoffs in batches, enqueues them natively, and from then on only
listens: progress and results update the rows, a landed file is finished at
once, and a failed one is marked for "Try again", which hands it over afresh.
On launch it reconciles: results that arrived while it was away are drained,
anything the system still holds stays in flight, and anything else is asked
of the server by its key before it is sent again. Builds without the module
(installed 1.3.4 and 1.3.5 phones) keep the queue they have.

## Limits no app gets round

- **iOS stops everything when the app is swiped away** from the app switcher:
  the system cancels a force-quit app's background transfers. Leaving the app
  or locking the phone is fine.
- iOS decides when background transfers run. On cellular or low battery it
  can be slower than in front.
- Android 15 limits a `dataSync` foreground service to six hours a day; past
  that the job carries on as an ordinary one, which the system may pause.
- The picker's copies live in the app's cache, which iOS may clear under
  storage pressure. A file gone before it was sent fails with that reason.

## Rollout

1. Server first: migration 116 and the endpoints are additive; nothing calls
   them until the new builds.
2. New iOS and Android builds with the module. It changes the runtime
   fingerprint, so it reaches phones through the stores and the virgo.ph APK,
   not an OTA.
