import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import {
  contentTypeForAsset,
  formatBytes,
  isUploadable,
  MAX_UPLOAD_BYTES,
  storageApi,
} from '@/src/api';
import {
  planUploads,
  possibleDuplicatesMessage,
  possibleDuplicatesTitle,
  skippedSummary,
} from '@/src/api/upload-dedup';
import { useUsage } from '@/src/hooks';
import { useUploadQueue } from '@/src/providers/UploadProvider';

export type UploadSource = 'media' | 'audio';

interface Picked {
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Splits a pick into what can be sent and what cannot.
 *
 * The size limit used to be the API's alone, so an oversized file was picked,
 * listed, queued, and only then refused — with `contentLength must not be
 * greater than 524288000`, which is a number nobody can act on. Checking here
 * means the answer arrives before anything is queued, names the file, and is
 * in the units the file was described in.
 */
function splitBySize(picked: Picked[]): { ok: Picked[]; tooBig: Picked[]; unsupported: Picked[] } {
  // The type too, for the same reason: refused by the API's allow-list, a file
  // sat in the queue as "did not finish" with the reason never shown.
  const uploadable = picked.filter((item) => isUploadable(item.mimeType));
  return {
    ok: uploadable.filter((item) => item.sizeBytes <= MAX_UPLOAD_BYTES),
    tooBig: uploadable.filter((item) => item.sizeBytes > MAX_UPLOAD_BYTES),
    unsupported: picked.filter((item) => !isUploadable(item.mimeType)),
  };
}

/** One message for everything left out of a pick, so there is one dialog. */
function explainLeftOut(tooBig: Picked[], unsupported: Picked[]): void {
  const parts: string[] = [];
  if (tooBig.length > 0) {
    parts.push(
      `Over the ${formatBytes(MAX_UPLOAD_BYTES)} limit:\n${tooBig
        .map((item) => `${item.name} (${formatBytes(item.sizeBytes)})`)
        .join('\n')}`,
    );
  }
  if (unsupported.length > 0) {
    parts.push(
      `Not a format Virgo takes:\n${unsupported.map((item) => item.name).join('\n')}\n\nPhotos (JPEG, PNG, HEIC, WebP, TIFF), videos (MP4, MOV, WebM), audio (MP3, M4A, WAV, AAC, FLAC, OGG) and PDFs.`,
    );
  }
  if (parts.length === 0) return;
  const count = tooBig.length + unsupported.length;
  Alert.alert(count === 1 ? 'One file was left out' : `${count} files were left out`, parts.join('\n\n'));
}

/** The same file twice is once: same name and size is as much as a phone can tell. */
function withoutRepeats(picked: Picked[]): Picked[] {
  const seen = new Set<string>();
  return picked.filter((item) => {
    const id = `${item.name}|${item.sizeBytes}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Photos and videos come from the media library, through the system picker.
 * It needs no photo permission: the person chooses, and only what they chose
 * reaches the app. Asking anyway put a full-library prompt in front of it, and
 * a refusal made uploading impossible.
 */
async function chooseMedia(): Promise<Picked[] | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: true,
    quality: 1,
    // The original, not a copy iOS made more compatible: a HEIC was handed
    // over as a JPEG, which is not what a photographer means by delivering
    // the file. The server thumbnails HEIC itself (ffmpeg), and a film is
    // passed through untranscoded by default.
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  });
  if (result.canceled) return null;
  const picked: Picked[] = [];
  for (const asset of result.assets) {
    // Real size from disk, not a label.
    const info = await FileSystem.getInfoAsync(asset.uri);
    picked.push({
      uri: asset.uri,
      name: asset.fileName ?? asset.uri.split('/').pop() ?? 'file',
      mimeType: contentTypeForAsset({ uri: asset.uri, mimeType: asset.mimeType, name: asset.fileName }),
      sizeBytes: info.exists ? (info.size ?? 0) : 0,
    });
  }
  return picked;
}

/**
 * Audio comes from the document picker.
 *
 * expo-image-picker only exposes the photo library, so asking it for audio
 * opened the gallery — there is no audio in there to choose. The document
 * picker opens the system file browser, which is where audio actually lives.
 */
async function chooseAudio(): Promise<Picked[] | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'audio/*',
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  return result.assets.map((asset) => ({
    uri: asset.uri,
    name: asset.name ?? asset.uri.split('/').pop() ?? 'audio',
    mimeType: contentTypeForAsset({ uri: asset.uri, mimeType: asset.mimeType, name: asset.name }),
    // DocumentPicker reports size directly; fall back to 0 if absent.
    sizeBytes: asset.size ?? 0,
  }));
}

/**
 * Choose files, and they start uploading: the whole of adding to an album.
 *
 * There was a screen between the two. It listed what had been chosen by file
 * name, seven rows to a screen, and waited for "Upload 27 files" to be tapped;
 * the files had already been chosen once, in the phone's own picker, which
 * shows them as pictures. So the picker is the choosing, and this does the
 * rest in the order that screen did it: leaves out what cannot be sent and
 * says which, checks there is room, asks the album what it already holds, and
 * hands the queue what is left. The queue (UploadProvider), the checks and the
 * API calls are the ones that were there; only the screen has gone.
 *
 * Resolves with how many files were handed over, so a caller can go to the
 * album when it was not already there.
 */
export function useUploadPicker({
  albumId,
  albumName,
  billedToMe,
}: {
  albumId: string | undefined;
  albumName: string | undefined;
  /**
   * Whether the files count against this account's storage. The server bills
   * an upload into somebody else's album to that album's owner, so checking
   * yours blocked uploads their storage had room for.
   */
  billedToMe: boolean;
}): { pick: (source: UploadSource) => Promise<number>; busy: boolean } {
  const { enqueue } = useUploadQueue();
  const { storageLimitBytes, storageUsedBytes } = useUsage();
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const pick = useCallback(
    async (source: UploadSource): Promise<number> => {
      if (!albumId || busy) return 0;
      const target = albumId;
      const chosen = source === 'audio' ? await chooseAudio() : await chooseMedia();
      if (!chosen) return 0;

      const { ok, tooBig, unsupported } = splitBySize(withoutRepeats(chosen));
      explainLeftOut(tooBig, unsupported);
      if (ok.length === 0) return 0;

      const bytes = ok.reduce((sum, item) => sum + item.sizeBytes, 0);
      if (billedToMe && storageLimitBytes != null && storageUsedBytes + bytes > storageLimitBytes) {
        Alert.alert(
          'Not enough storage',
          `These files need ${formatBytes(bytes)} but only ${formatBytes(
            Math.max(storageLimitBytes - storageUsedBytes, 0),
          )} is free. Choose fewer, or free up space.`,
        );
        return 0;
      }

      /*
       * The album is asked first which of these it already holds, so picking a
       * batch again after a bad connection sends only what did not arrive
       * (src/api/upload-dedup.ts). The phone can only say name and size, so
       * whatever matches is asked about rather than skipped unseen: two
       * different photographs can share both. A check that fails, or that the
       * connection is too poor to answer quickly, sends everything, as before.
       */
      setBusy(true);
      const plan = await planUploads(
        ok,
        (item) => ({ name: item.name, size: item.sizeBytes }),
        (files) => storageApi.checkUploads(target, files),
      );
      if (mounted.current) setBusy(false);

      const send = (list: Picked[]): number => {
        if (list.length > 0) enqueue(list.map((item) => ({ ...item, albumId: target })));
        return list.length;
      };

      const { upload, duplicates, possible } = plan;
      if (duplicates.length === 0 && possible.length === 0) return send(upload);

      const where = albumName ?? 'this album';
      return new Promise<number>((resolve) => {
        if (possible.length === 0) {
          Alert.alert(
            skippedSummary(duplicates.length),
            upload.length > 0
              ? `They're already in ${where}. The other ${upload.length} will upload.`
              : `They're already in ${where}. There is nothing else to upload.`,
            [
              { text: 'Upload anyway', onPress: () => resolve(send([...upload, ...duplicates])) },
              { text: 'OK', style: 'cancel', onPress: () => resolve(send(upload)) },
            ],
          );
          return;
        }
        Alert.alert(
          possibleDuplicatesTitle(possible.length),
          `${duplicates.length > 0 ? `${skippedSummary(duplicates.length)}. ` : ''}${possibleDuplicatesMessage(possible.length, albumName)}`,
          [
            ...(duplicates.length > 0
              ? [{ text: 'Upload all', onPress: () => resolve(send([...upload, ...possible, ...duplicates])) }]
              : []),
            { text: 'Upload anyway', onPress: () => resolve(send([...upload, ...possible])) },
            { text: 'Skip', style: 'cancel' as const, onPress: () => resolve(send(upload)) },
          ],
        );
      });
    },
    [albumId, albumName, billedToMe, busy, enqueue, storageLimitBytes, storageUsedBytes],
  );

  return { pick, busy };
}
