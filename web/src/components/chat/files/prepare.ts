import {
  CHAT_FILE_TYPES,
  MAX_CHAT_FILE_BYTES,
  MAX_CHAT_PHOTO_BYTES,
  MAX_CHAT_PHOTOS,
  chatFileSize,
  chatPhotoEdge,
  voiceContentType,
  type ConnectionQuality,
} from '@/api';

/*
 * Getting photos and a PDF from this computer ready to send (phase 4).
 *
 * Every photo is shrunk here before anything goes up: to about 2,000 px on
 * its long edge, or 1,280 px on a slow line, as a JPEG at 0.82. That is
 * weak-signal rule 5, and it also drops the photo's EXIF (where it was taken)
 * before it leaves the computer. Full-size files go through an album.
 */

/** The JPEG quality photos go at: about 0.5 MB for a 2,000 px photo. */
const JPEG_QUALITY = 0.82;

/** Anything picked over this is refused before it is read: a PDF's limit, and plenty for a photo. */
export const MAX_PICKED_BYTES = MAX_CHAT_FILE_BYTES;

export type PickedKind = 'photo' | 'file';

/** One photo, PDF or voice note, ready to go: its bytes, and what the dialog and the thread draw. */
export interface PreparedFile {
  /** This computer's own id for it, until the server gives it one. */
  localId: string;
  /** A voice note is recorded here, never picked (phase 5). */
  kind: PickedKind | 'voice';
  blob: Blob;
  name: string;
  contentType: string;
  sizeBytes: number;
  /** A photo's size after shrinking, for drawing its box. */
  width: number | null;
  height: number | null;
  /** A PDF's page count, when it could be read cheaply. */
  pages: number | null;
  /** A voice note's length, by the recorder's clock. */
  durationMs?: number | null;
  /** An object URL for drawing it here, before and after it has gone (or playing it, for a voice note). */
  previewUrl: string | null;
}

let counter = 0;
function localId(): string {
  counter += 1;
  return `local-${Date.now().toString(36)}-${counter}`;
}

/** Whether a picked file is a PDF, by its type or, when the browser gives none, its name. */
export function isPdf(file: File): boolean {
  return (
    (CHAT_FILE_TYPES as readonly string[]).includes(file.type) ||
    (!file.type && /\.pdf$/i.test(file.name))
  );
}

/** Whether a picked file looks like a picture, which is only worth trying to open. */
export function looksLikePhoto(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(file.name);
}

/** "IMG_2041.jpg is 34 MB. Photos and files can be up to 20 MB each." */
export function tooBigProblem(file: File): string {
  return `${file.name} is ${chatFileSize(file.size)}. ${
    isPdf(file) ? 'A PDF can be up to 20 MB.' : 'Send photos over 20 MB from an album.'
  }`;
}

/** "Photo.jpg" from "IMG_2041.HEIC": a shrunk photo is a JPEG, whatever it was. */
function jpegName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').trim() || 'Photo';
  return `${base}.jpg`;
}

/**
 * Shrinks one photo to the long edge for this line and makes it a JPEG.
 *
 * Throws a sentence to show when the browser cannot open it — HEIC in Chrome
 * and Edge, a RAW file, something that only claims to be a picture.
 */
export async function shrinkPhoto(file: File, quality: ConnectionQuality): Promise<PreparedFile> {
  let bitmap: ImageBitmap;
  try {
    // Turned upright from its EXIF first, so a phone photo taken sideways
    // goes the right way up once the EXIF is gone.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(
      `${file.name}: This browser can't open that photo. Save it as a JPEG and try again.`,
    );
  }
  try {
    const edge = chatPhotoEdge(quality);
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height, 1));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no canvas');
    // A PNG's see-through parts would turn black as a JPEG.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) throw new Error('no blob');
    if (blob.size > MAX_CHAT_PHOTO_BYTES) {
      throw new Error(`${file.name} is still too big to send once made smaller. Send it from an album.`);
    }
    return {
      localId: localId(),
      kind: 'photo',
      blob,
      name: jpegName(file.name),
      contentType: 'image/jpeg',
      sizeBytes: blob.size,
      width,
      height,
      pages: null,
      previewUrl: URL.createObjectURL(blob),
    };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith(file.name)) throw err;
    throw new Error(`${file.name}: This browser couldn't make that photo smaller. Try another.`);
  } finally {
    bitmap.close();
  }
}

/**
 * A PDF's pages, counted from its page objects. Cheap and best-effort: a PDF
 * that packs its objects into compressed streams says nothing this way, and
 * the card then reads "PDF · 1.2 MB".
 */
async function countPdfPages(file: File): Promise<number | null> {
  try {
    const text = await file.text();
    const matches = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g);
    return matches && matches.length > 0 ? matches.length : null;
  } catch {
    return null;
  }
}

/** A PDF as it goes: as it is, bytes untouched. */
export async function preparePdf(file: File): Promise<PreparedFile> {
  return {
    localId: localId(),
    kind: 'file',
    blob: file,
    name: file.name || 'File.pdf',
    contentType: 'application/pdf',
    sizeBytes: file.size,
    width: null,
    height: null,
    pages: await countPdfPages(file),
    previewUrl: null,
  };
}

/** The name a voice note's file goes up under; the server names it its own way. */
function voiceFileName(contentType: string): string {
  if (contentType === 'audio/webm') return 'Voice note.webm';
  if (contentType === 'audio/ogg') return 'Voice note.ogg';
  if (contentType === 'audio/aac') return 'Voice note.aac';
  return 'Voice note.m4a';
}

/**
 * A recording as it goes: as the browser made it, at the low bitrate it was
 * recorded at (rule 5). The server re-encodes it to AAC when it arrives.
 * Its own copy plays here while it is still on its way.
 */
export function prepareVoice(take: { blob: Blob; mimeType: string; durationMs: number }): PreparedFile {
  const contentType = voiceContentType(take.mimeType || take.blob.type);
  return {
    localId: localId(),
    kind: 'voice',
    blob: take.blob,
    name: voiceFileName(contentType),
    contentType,
    sizeBytes: take.blob.size,
    width: null,
    height: null,
    pages: null,
    durationMs: Math.round(take.durationMs),
    previewUrl: URL.createObjectURL(take.blob),
  };
}

/**
 * What was picked or dropped, sorted into what can go together.
 *
 * Photos and a PDF never go in one message, and a PDF goes on its own, so
 * a mixed pick keeps the photos (or the first PDF, when there are none) and
 * says what was left out and why.
 */
export function sortPicked(
  files: File[],
  room: number = MAX_CHAT_PHOTOS,
): { mode: PickedKind | null; take: File[]; problems: string[] } {
  const problems: string[] = [];
  const photos: File[] = [];
  const pdfs: File[] = [];
  for (const file of files) {
    if (isPdf(file)) pdfs.push(file);
    else if (looksLikePhoto(file)) photos.push(file);
    else problems.push(`${file.name}: Only photos and PDFs can be sent here.`);
  }
  const fits = (file: File) => {
    if (file.size <= MAX_PICKED_BYTES) return true;
    problems.push(tooBigProblem(file));
    return false;
  };

  if (photos.length > 0) {
    if (pdfs.length > 0) problems.push('A PDF goes on its own. Send it in a message of its own.');
    const ok = photos.filter(fits);
    if (ok.length > room) {
      problems.push(`Up to ${MAX_CHAT_PHOTOS} photos go in one message. Send the rest in another.`);
    }
    return { mode: 'photo', take: ok.slice(0, Math.max(0, room)), problems };
  }
  if (pdfs.length > 0) {
    if (pdfs.length > 1) problems.push('Send one PDF at a time.');
    const first = pdfs.find(fits);
    return { mode: first ? 'file' : null, take: first ? [first] : [], problems };
  }
  return { mode: null, take: [], problems };
}

/** Lets go of a prepared file's preview, once nothing draws it. */
export function releasePreview(file: Pick<PreparedFile, 'previewUrl'>): void {
  if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
}
