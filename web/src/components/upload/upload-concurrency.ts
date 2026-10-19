/**
 * How many files go up at once, across the whole app.
 *
 * Six, which is what browsers allow per host. The file bytes go to B2, a
 * different host from the API, so six transfers there still leave the app's
 * own requests their own connections. Three left a wedding drop of hundreds
 * of small photographs waiting on per-file round trips (ticket, PUT,
 * confirm) more than on bandwidth. It is one queue for the whole app, so two
 * quick drops still run six, not twelve.
 *
 * A large file sent in parts runs its own parts concurrently on top of this
 * (multipart-upload.ts); that number is separate and unchanged.
 */
export const UPLOAD_CONCURRENCY = 6;
