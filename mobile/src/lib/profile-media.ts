import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';
import { ApiError, coverCropRect } from '@/src/api';
import { AuthError } from '@/src/hooks/useAuth';

/**
 * Pictures for a profile, and what to say when changing one fails.
 *
 * Mobile only. The crop runs in expo-image-manipulator, which web has no use
 * for — covers are chosen on the phone — so none of this sits in src/api or
 * src/hooks, where it would have to be copied into the web app as well.
 */

/** Where a profile is shared from. The same default the web app uses. */
export const SITE = process.env.EXPO_PUBLIC_SITE_ORIGIN ?? 'https://virgo.ph';

/** SITE as a person reads it: "virgo.ph", not "https://virgo.ph". */
export const SITE_HOST = SITE.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

/** = COVER_EDGE in api thumbnails.service.ts, which keeps a cover no wider. */
export const COVER_MAX_WIDTH = 2048;

/**
 * The working copy's longest edge. Past this a 48 MP original is still two
 * dozen times the pixels a 2048 px cover needs, and each crop and preview of
 * it costs memory a low-end Android phone does not have.
 */
const WORKING_MAX_EDGE = 4096;

/** Matches AVATAR_EDGE in api/src/storage/thumbnails.service.ts. */
const AVATAR_MAX_EDGE = 512;

/** A local JPEG the right way up, and its real size. */
export interface CoverSource {
  uri: string;
  width: number;
  height: number;
}

/** Frees a native image as soon as it is done with, rather than at GC. */
function release(ref: ImageRef | null): void {
  try {
    ref?.release();
  } catch {
    // Already released. Nothing is lost either way.
  }
}

/**
 * The picked photo, turned upright and bounded, ready to be positioned.
 *
 * Measured after rendering, never from the picker's asset.width: rendering is
 * what applies the EXIF orientation, and a portrait photo whose orientation
 * lives in a tag reports its sensor's landscape size until then — which put
 * the crop rectangle off the edge of the picture.
 */
export async function prepareCoverSource(uri: string): Promise<CoverSource> {
  let upright: ImageRef | null = null;
  let bounded: ImageRef | null = null;
  try {
    upright = await ImageManipulator.manipulate(uri).renderAsync();
    let ref = upright;
    if (Math.max(upright.width, upright.height) > WORKING_MAX_EDGE) {
      bounded = await ImageManipulator.manipulate(upright)
        .resize(
          upright.width >= upright.height
            ? { width: WORKING_MAX_EDGE }
            : { height: WORKING_MAX_EDGE },
        )
        .renderAsync();
      ref = bounded;
    }
    const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
    return { uri: saved.uri, width: saved.width, height: saved.height };
  } finally {
    release(bounded);
    release(upright);
  }
}

/**
 * The cover as it will be stored: cropped where the person put it, at most
 * COVER_MAX_WIDTH wide, re-encoded as JPEG.
 *
 * Throws on any failure, and the caller then uploads nothing. Falling back to
 * the original would send the camera file, EXIF and GPS included, to a public
 * address — the server re-encodes it too, but it should never have to be the
 * only thing standing in the way.
 */
export async function renderCover(
  src: CoverSource,
  focusY: number,
): Promise<{ uri: string; mimeType: 'image/jpeg' }> {
  const rect = coverCropRect(src.width, src.height, focusY);
  const ref = await ImageManipulator.manipulate(src.uri)
    .crop(rect)
    .resize({ width: Math.min(COVER_MAX_WIDTH, rect.width) })
    .renderAsync();
  try {
    const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
    return { uri: saved.uri, mimeType: 'image/jpeg' };
  } finally {
    release(ref);
  }
}

/**
 * Scales a picked photo down before it is uploaded.
 *
 * The picker's `quality: 0.8` only re-encodes — it does not bound dimensions,
 * so a 12 MP camera photo was uploaded at 4032 px to fill an 88 px circle,
 * and counted against the account's storage quota at that size.
 *
 * The API resizes avatars on confirm regardless, so this is not what makes
 * them small; it is what stops several megabytes crossing a mobile connection
 * to be discarded on arrival. Returns the asset untouched if anything fails —
 * not shrinking an upload is no reason to fail it, now that the server
 * re-encodes every avatar and strips what the camera wrote into it.
 */
export async function renderAvatar(
  asset: ImagePickerAsset,
): Promise<{ uri: string; mimeType?: string }> {
  const original = { uri: asset.uri, mimeType: asset.mimeType };
  const longest = Math.max(asset.width ?? 0, asset.height ?? 0);
  if (!longest || longest <= AVATAR_MAX_EDGE) return original;

  try {
    // Only the longer edge is given; the other is derived to keep the ratio.
    const size =
      (asset.width ?? 0) >= (asset.height ?? 0)
        ? { width: AVATAR_MAX_EDGE }
        : { height: AVATAR_MAX_EDGE };

    const rendered = await ImageManipulator.manipulate(asset.uri)
      .resize(size)
      .renderAsync();
    try {
      const out = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.82,
      });
      return { uri: out.uri, mimeType: 'image/jpeg' };
    } finally {
      release(rendered);
    }
  } catch {
    return original;
  }
}

/** The profile actions that can fail in front of somebody. */
export type ProfileAction = 'cover' | 'photo' | 'setting' | 'connect' | 'accept' | 'message';

const ACTION_COPY: Record<ProfileAction, string> = {
  cover: "Couldn't update your cover. Try again later.",
  photo: "Couldn't update your photo. Try again later.",
  setting: "Couldn't save that setting. Try again later.",
  connect: "Couldn't send the request. Try again.",
  accept: "Couldn't accept the request. Try again.",
  message: "Couldn't open the chat. Try again.",
};

const OFFLINE = 'Check your connection and try again.';

function codeOf(err: unknown): string | undefined {
  if (err instanceof AuthError) return err.code;
  if (err instanceof ApiError && err.body && typeof err.body === 'object') {
    const code = (err.body as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/**
 * What a failed profile action says. Never the error's own message.
 *
 * Fixed copy per action rather than the server's text, because the text an
 * older API answers with is not written for people: a switch it does not know
 * comes back as "property showStudio should not exist", and a cover it has no
 * route for as "Cannot PATCH /me/profile/cover". The codes that mean something
 * the person can act on get their own line.
 *
 * Status 0 is only "check your connection" when a request actually failed to
 * get out — the client attaches what fetch threw. uploadFile raises status 0
 * with no body for things that happened on the phone (a file that vanished,
 * an upload that could not be verified), and blaming the connection for those
 * sends somebody off to fix the wrong thing.
 */
export function profileActionMessage(err: unknown, action: ProfileAction): string {
  let status: number | undefined;
  if (err instanceof AuthError) {
    // useAuth's updateProfile wraps every failure: status 0 there is only ever
    // the transport, and a missing status is something it could not classify.
    if (err.status === 0) return OFFLINE;
    status = err.status;
  } else if (err instanceof ApiError) {
    if (err.status === 0) return err.body !== undefined ? OFFLINE : ACTION_COPY[action];
    status = err.status;
  } else {
    // A file-system or manipulator failure: nothing the server said.
    return ACTION_COPY[action];
  }

  const code = codeOf(err);
  if (code === 'EMAIL_NOT_VERIFIED') {
    return 'Confirm your email address first. The link is in your inbox.';
  }
  if (code === 'COVER_UNUSABLE') return "That photo couldn't be used as a cover. Try a different one.";
  if (code === 'AVATAR_UNUSABLE' && action === 'photo') {
    return "That photo couldn't be used. Try a different one.";
  }
  // The upload ticket refused on quota. "Try again later" would never come
  // true, so say what will. The previous API sends the same 403 with no code;
  // B2's own 403 on the upload itself has no JSON body, so it never matches.
  const uncoded403 =
    status === 403 && code === undefined && err instanceof ApiError &&
    typeof err.body === 'object' && err.body !== null;
  if ((action === 'photo' || action === 'cover') && (code === 'STORAGE_FULL' || uncoded403)) {
    return 'Your storage is full. Free up space, or upgrade your plan, to add photos.';
  }
  if (status === 429) return "You're doing that a lot. Wait a moment and try again.";
  if (action === 'connect' && status === 404) return "This profile isn't available any more.";
  return ACTION_COPY[action];
}
