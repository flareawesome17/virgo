import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import {
  chatFileSize,
  chatPhotoEdge,
  MAX_CHAT_FILE_BYTES,
  MAX_CHAT_PHOTO_BYTES,
  type ConnectionQuality,
} from '@/src/api';

/**
 * Photos and a PDF from this phone, made ready for a chat (phase 4).
 *
 * Mobile only, like support-files: the shrinking runs in
 * expo-image-manipulator and the copies live in this app's own folders, so it
 * stays out of the shared src/api and src/hooks.
 *
 * Nothing here is native-only at import: on the Expo web preview the picker
 * hands over blob or data URIs, the manipulator draws on a canvas, and there
 * is no folder to copy into, so a URI is kept as it came.
 */

/** A photo or file on this phone, as a chat upload needs it. */
export interface LocalChatFile {
  /** Where the bytes are: the app's documents folder once sent, a cache before. */
  uri: string;
  name: string;
  contentType: string;
  /** Exact: the upload link is signed for this many bytes. */
  size: number;
  width: number | null;
  height: number | null;
}

const isWeb = Platform.OS === 'web';
/** Where a sent photo or file waits until its upload finishes. */
const KEEP_DIR = isWeb ? null : `${FileSystem.documentDirectory}chat-uploads/`;

function release(ref: ImageRef | null): void {
  try {
    ref?.release();
  } catch {
    // Already released.
  }
}

/** How many bytes are at a URI: from the disk on a phone, from the blob on the web. */
async function sizeOf(uri: string): Promise<number> {
  if (isWeb) {
    const blob = await (await fetch(uri)).blob();
    return blob.size;
  }
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists ? (info.size ?? 0) : 0;
}

/** A random name, so two photos called IMG_0001 never meet in the folder. */
function randomStem(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The photo library, images only, several at once. No permission: the
 * person chooses, and only what they chose reaches the app.
 */
export async function pickChatPhotos(limit: number): Promise<ImagePicker.ImagePickerAsset[] | null> {
  if (limit <= 0) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    orderedSelection: true,
    quality: 1,
    exif: false,
    // A HEIC comes as it is; it is turned into a JPEG below, which also drops
    // what the camera wrote into it.
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  });
  if (result.canceled || result.assets.length === 0) return null;
  return result.assets.slice(0, limit);
}

/**
 * One picked photo as an upright JPEG, its long edge at most
 * chatPhotoEdge(quality): about 2,000 px, or 1,280 on a slow line. Weak-signal
 * rule 5. Re-encoding drops EXIF and GPS before it leaves the phone, and turns
 * HEIC into something the server can read.
 *
 * Throws when the photo can't be read.
 */
export async function shrinkChatPhoto(
  asset: Pick<ImagePicker.ImagePickerAsset, 'uri' | 'fileName'>,
  quality: ConnectionQuality,
): Promise<LocalChatFile> {
  const edge = chatPhotoEdge(quality);
  let upright: ImageRef | null = null;
  let bounded: ImageRef | null = null;
  try {
    // Rendering applies the orientation tag, so it comes first and the size
    // is measured after it.
    upright = await ImageManipulator.manipulate(asset.uri).renderAsync();
    let ref = upright;
    if (Math.max(upright.width, upright.height) > edge) {
      bounded = await ImageManipulator.manipulate(upright)
        .resize(upright.width >= upright.height ? { width: edge } : { height: edge })
        .renderAsync();
      ref = bounded;
    }
    const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    const size = await sizeOf(saved.uri);
    if (size <= 0) throw new Error('empty');
    if (size > MAX_CHAT_PHOTO_BYTES) throw new Error('too large');
    const stem = (asset.fileName ?? 'Photo').replace(/\.[^.]+$/, '').trim() || 'Photo';
    return {
      uri: saved.uri,
      name: `${stem}.jpg`,
      contentType: 'image/jpeg',
      size,
      width: saved.width ?? ref.width,
      height: saved.height ?? ref.height,
    };
  } finally {
    release(bounded);
    release(upright);
  }
}

/** What picking a PDF came to. */
export type PickedPdf =
  | { kind: 'file'; file: LocalChatFile }
  | { kind: 'too-big'; words: string }
  | { kind: 'not-pdf'; words: string };

/** One PDF from the phone's files: a call sheet, a contract, a mood board. Null when cancelled. */
export async function pickChatPdf(): Promise<PickedPdf | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const name = asset.name?.trim() || 'File.pdf';
  const type = asset.mimeType ?? (name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '');
  if (type !== 'application/pdf') {
    return { kind: 'not-pdf', words: 'Only PDFs can be sent as a file. Save it as a PDF and try again.' };
  }
  let size = asset.size ?? 0;
  if (!size) size = await sizeOf(asset.uri).catch(() => 0);
  if (size > MAX_CHAT_FILE_BYTES) {
    return {
      kind: 'too-big',
      words: `That file is ${chatFileSize(size)}. A file has to be a PDF under 20 MB. For something bigger, send it from an album.`,
    };
  }
  if (size <= 0) {
    return { kind: 'not-pdf', words: "That file couldn't be read. Try a different one." };
  }
  return { kind: 'file', file: { uri: asset.uri, name, contentType: 'application/pdf', size, width: null, height: null } };
}

/**
 * Moves a file into the app's documents folder, where it stays until its
 * upload finishes. The picker's and the manipulator's cache can be cleared by
 * the system at any time, and a send has to survive the app being closed.
 */
export async function keepChatFile(file: LocalChatFile): Promise<LocalChatFile> {
  if (!KEEP_DIR) return file;
  if (file.uri.startsWith(KEEP_DIR)) return file;
  await FileSystem.makeDirectoryAsync(KEEP_DIR, { intermediates: true }).catch(() => undefined);
  const ext = file.contentType === 'application/pdf' ? 'pdf' : 'jpg';
  const to = `${KEEP_DIR}${randomStem()}.${ext}`;
  await FileSystem.copyAsync({ from: file.uri, to });
  // The cache copy is no longer needed; the picker's own may be shared, so only ours goes.
  if (file.uri.startsWith(FileSystem.cacheDirectory ?? '\0') && file.uri.includes('ImageManipulator')) {
    await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => undefined);
  }
  return { ...file, uri: to };
}

/** Throws away a copy this app made: once sent, or when a send is abandoned. */
export async function dropChatFile(uri: string): Promise<void> {
  if (isWeb) return;
  const ours =
    (KEEP_DIR && uri.startsWith(KEEP_DIR)) ||
    (FileSystem.cacheDirectory && uri.startsWith(FileSystem.cacheDirectory) && uri.includes('ImageManipulator'));
  if (!ours) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}
