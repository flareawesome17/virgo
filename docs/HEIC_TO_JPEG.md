# HEIC photos are stored as JPEGs

An iPhone saves photos as HEIC. Android phones, Windows and most browsers can't
open one, so a client who downloaded their delivery got files their phone
wouldn't show. A client link that fell back to the original drew nothing where
the photo should be. Every HEIC (and HEIF) photo is now decoded at full size
and stored as a JPEG that every device opens.

Code: `api/src/storage/heic/`. Migration: `117_heic_to_jpeg.sql`.

## What the JPEG keeps

- **Every pixel at full resolution.** libheif (WebAssembly build,
  `libheif-js`) reads the whole tile grid an iPhone stores a photo as. It also
  applies the file's own rotation and mirroring. The result is refused unless
  it is exactly the size the file's header says, so a single 512 px tile is
  never stored in place of the photo. (An older ffmpeg decodes one tile from a
  grid, which is why some iPhone uploads had no preview at all.)
- **Quality 95, 4:4:4.** Colour is kept at full resolution, not halved, so
  fine edges and saturated colours stay as sharp as they were.
- **The colour profile.** An iPhone photo is Display P3. The profile is written
  into the JPEG as bytes, without converting the pixels, so the colours are the
  ones the iPhone showed.
- **The EXIF**, with the orientation set upright. Date, camera and lens come
  along. The orientation is reset because libheif has already turned the
  pixels, and a viewer obeying the camera's "rotate 90°" would turn them a
  second time.

**What does not survive:** an iPhone photo's HDR gain map. A JPEG has nowhere to
keep it, so HDR highlights show as the standard image every non-HDR screen
already showed.

**Size:** the JPEG is roughly two to three times the HEIC, because HEVC simply
compresses better. It counts against the owner's storage like any other file.

## When it happens

1. **New uploads.** The confirm's background job (`ThumbnailsService.generate`)
   claims the file and converts it before making previews. The thumbnail,
   display copies and blur are then made from the JPEG, without ffmpeg. The
   HEIC is read from the bucket once.
2. **Everything already uploaded,** and anything whose conversion failed:
   `HeicSweepService`, every minute. It takes newest first, up to
   `HEIC_CONVERT_PER_MINUTE` (default 12), one at a time, and pauses while an
   upload's own previews are being made. Previews a file was missing are made
   then too.

Both claim a file through `heic_attempts` and `heic_next_at` (a 15-minute
lease, `for update skip locked` in the sweep), so two processes never convert
one file. A failure is retried after 10 minutes, 40 minutes, about 2.5 hours
and about 10 hours. After five tries the file is left as the HEIC it is, with
`heic_error` saying why.

Not converted:
- anything over 64 megapixels (`MAX_CONVERT_PIXELS`; an iPhone's 48 MP still
  is under it) or over 40 MB;
- public keys (avatars, covers, showcase copies), which are re-encoded to WebP
  on confirm anyway;
- a HEIF that is not HEVC.

Each decode runs in its own worker thread that ends with it. A WebAssembly
memory only grows, so this gives the memory back, and the API's own thread
never stalls for the seconds a decode takes. Two conversions run at once, and
only one of those may be over 24 MP.

## What changes, and what doesn't

The **key stays** (it still ends in `.heic`). Eight tables point at
`user_files.key` and none would follow a rename. In the row:
- `content_type` becomes `image/jpeg`;
- `size_bytes` and `etag` become the JPEG's;
- `original_name` becomes `IMG_1234.jpg`;
- `source_name`, `source_size_bytes` and `source_content_type` keep what it was.

So that everything else works the same:
- **Delivery names** (`deliveryName`) take the extension from the type. Client
  link downloads and zips say `.jpg`.
- **The re-upload check** (`findUploadMatches`) also matches on the HEIC's
  name and size, because that is what a re-sent batch still has.
- **A repeat confirm** (`recordFile`) leaves a converted row's type, size,
  name, ETag and status alone. The phone sends the HEIC's name, and its HEAD
  may have read the object a moment before it was replaced.
- **The download cache** drops its copy of the key when it is converted. The
  sweep also checks recent conversions for a cached copy of the wrong size,
  left by a download that was reading the HEIC at the moment it was replaced.

## The way back

The bucket keeps an overwritten object as an older version. Each replaced
HEIC's version id goes into `replaced_versions` and is deleted by the sweep
after seven days (`KEEP_REPLACED_DAYS`). Until then, a conversion that turned
out wrong can be undone in B2 by restoring that version, then setting the row
back from its `source_*` columns.

## Switches

- `HEIC_TO_JPEG=off` leaves every HEIC as it is, exactly as before. Unset is on.
- `HEIC_CONVERT_PER_MINUTE=0` stops the sweep. New uploads are still
  converted.
