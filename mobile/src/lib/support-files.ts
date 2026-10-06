import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Photos for a support request, made ready to send.
 *
 * Mobile only, like profile-media: the re-encode runs in
 * expo-image-manipulator, so it stays out of src/api and src/hooks.
 */

/**
 * The longest edge a support photo is sent at. A phone screenshot is about
 * 2,600 px tall; at 2,048 its text is still easy to read, and the file is a
 * few hundred kilobytes rather than several megabytes.
 */
const SUPPORT_PHOTO_EDGE = 2048;

function release(ref: ImageRef | null): void {
  try {
    ref?.release();
  } catch {
    // Already released.
  }
}

/**
 * The picked photo as an upright JPEG no larger than SUPPORT_PHOTO_EDGE.
 *
 * Re-encoding is the point, not a side effect: it drops what the camera wrote
 * into the file (EXIF, GPS) before it leaves the phone, and it turns a HEIC
 * — which no browser in the console can draw — into a JPEG that every one
 * can. Throws when the photo cannot be read; the caller lists it as failed
 * rather than sending the original.
 */
export async function prepareSupportPhoto(asset: {
  uri: string;
  fileName?: string | null;
}): Promise<{ uri: string; name: string; type: 'image/jpeg'; size: number }> {
  let upright: ImageRef | null = null;
  let bounded: ImageRef | null = null;
  try {
    // Rendering applies the orientation tag, so it comes first and the size
    // is measured after it.
    upright = await ImageManipulator.manipulate(asset.uri).renderAsync();
    let ref = upright;
    if (Math.max(upright.width, upright.height) > SUPPORT_PHOTO_EDGE) {
      bounded = await ImageManipulator.manipulate(upright)
        .resize(
          upright.width >= upright.height
            ? { width: SUPPORT_PHOTO_EDGE }
            : { height: SUPPORT_PHOTO_EDGE },
        )
        .renderAsync();
      ref = bounded;
    }
    const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
    const info = await FileSystem.getInfoAsync(saved.uri);
    const stem = (asset.fileName ?? 'photo').replace(/\.[^.]+$/, '') || 'photo';
    return {
      uri: saved.uri,
      name: `${stem}.jpg`,
      type: 'image/jpeg',
      size: info.exists ? (info.size ?? 0) : 0,
    };
  } finally {
    release(bounded);
    release(upright);
  }
}
