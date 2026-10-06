import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { FileTextIcon, ImageIcon, PaperclipIcon, XIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  ApiError,
  fileSizeLabel,
  MAX_SUPPORT_FILES,
  putFileToBucket,
  supportApi,
  supportFileProblem,
  type SupportAttachment,
} from '@/src/api';
import { prepareSupportPhoto } from '@/src/lib/support-files';
import { RemoteImage } from '@/components/RemoteImage';

const interop = { className: { target: 'style', nativeStyleToProp: { color: true } } } as const;
cssInterop(FileTextIcon, interop);
cssInterop(ImageIcon, interop);
cssInterop(PaperclipIcon, interop);
cssInterop(XIcon, interop);

/** One file on its way up, or refused before it went. */
interface PendingFile {
  key: number;
  uri: string;
  name: string;
  size: number;
  type: string;
  progress: number;
  /** The attachment id, once the bytes are in the bucket. */
  id: string | null;
  error: string | null;
}

/**
 * Files for one support message, each uploading the moment it is picked.
 *
 * Photos come through the system picker (no permission: only what is chosen
 * reaches the app) and are re-encoded on the phone first; PDFs come through
 * the document picker. A file that fails stays listed with why, and has to be
 * removed before sending — sending without it would leave support missing the
 * screenshot the person thinks they sent.
 */
export function useSupportUploads() {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const count = useRef(0);
  const live = useRef(files);
  useEffect(() => {
    live.current = files;
  }, [files]);

  const patch = (key: number, change: Partial<PendingFile>) =>
    setFiles((list) => list.map((f) => (f.key === key ? { ...f, ...change } : f)));

  async function send(key: number, file: { uri: string; name: string; type: string; size: number }) {
    try {
      const ticket = await supportApi.signAttachment({
        contentType: file.type,
        contentLength: file.size,
        name: file.name,
      });
      await putFileToBucket(file.uri, ticket, (progress) => patch(key, { progress }));
      patch(key, { id: ticket.id, progress: 1 });
    } catch (error) {
      patch(key, {
        error:
          error instanceof ApiError && error.status !== 0
            ? error.message
            : 'That file did not upload. Remove it and try again.',
      });
    }
  }

  function enqueue(file: { uri: string; name: string; type: string; size: number }, failure?: string) {
    const error = failure ?? supportFileProblem({ type: file.type, size: file.size });
    count.current += 1;
    const key = count.current;
    setFiles((list) => [...list, { key, ...file, progress: 0, id: null, error }]);
    if (!error) void send(key, file);
  }

  /** Room left, saying so when a pick brought more than fits. */
  function fit<T>(picked: T[]): T[] {
    const room = Math.max(0, MAX_SUPPORT_FILES - live.current.length);
    setNote(picked.length > room ? `Up to ${MAX_SUPPORT_FILES} files a message.` : null);
    return picked.slice(0, room);
  }

  async function pickPhotos() {
    const room = MAX_SUPPORT_FILES - live.current.length;
    if (room <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: room,
      quality: 1,
      exif: false,
    });
    if (result.canceled) return;
    for (const asset of fit(result.assets)) {
      try {
        enqueue(await prepareSupportPhoto(asset));
      } catch {
        enqueue(
          { uri: asset.uri, name: asset.fileName ?? 'photo', type: 'image/jpeg', size: 0 },
          "That photo couldn't be read. Try a different one.",
        );
      }
    }
  }

  async function pickPdfs() {
    if (live.current.length >= MAX_SUPPORT_FILES) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    for (const asset of fit(result.assets)) {
      let size = asset.size ?? 0;
      if (!size) {
        const info = await FileSystem.getInfoAsync(asset.uri);
        size = info.exists ? (info.size ?? 0) : 0;
      }
      enqueue({
        uri: asset.uri,
        name: asset.name ?? 'document.pdf',
        type: asset.mimeType ?? 'application/pdf',
        size,
      });
    }
  }

  return {
    files,
    note,
    pickPhotos,
    pickPdfs,
    remove: (key: number) => setFiles((list) => list.filter((f) => f.key !== key)),
    clear: () => {
      setFiles([]);
      setNote(null);
    },
    /** Ids to send with the message. */
    ids: files.flatMap((f) => (f.id && !f.error ? [f.id] : [])),
    /** Still uploading: sending now would leave them behind. */
    busy: files.some((f) => !f.id && !f.error),
    /** A file that failed and is still listed. */
    failed: files.some((f) => !!f.error),
    full: files.length >= MAX_SUPPORT_FILES,
  };
}

export type SupportUploads = ReturnType<typeof useSupportUploads>;

/** The files waiting to go with the message, each removable. */
export function PendingFiles({ uploads }: { uploads: SupportUploads }) {
  if (uploads.files.length === 0 && !uploads.note) return null;
  return (
    <View className="gap-2">
      {uploads.files.length > 0 && (
        <View className="flex-row flex-wrap gap-2">
          {uploads.files.map((f) => (
            <View
              key={f.key}
              className={`flex-row items-center gap-2 rounded-lg border py-1.5 pl-1.5 pr-1 ${f.error ? 'border-destructive' : 'border-border'}`}
            >
              {f.type.startsWith('image/') && !f.error ? (
                <Image source={{ uri: f.uri }} style={{ width: 32, height: 32, borderRadius: 4 }} />
              ) : (
                <View className="h-8 w-8 items-center justify-center rounded bg-muted">
                  <FileTextIcon size={16} className="text-muted-foreground" />
                </View>
              )}
              <View className="max-w-[150px]">
                <Text numberOfLines={1} className="text-[12px] font-semibold text-foreground">
                  {f.name}
                </Text>
                <Text
                  numberOfLines={2}
                  className={`text-[11px] ${f.error ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {f.error ??
                    (f.id ? fileSizeLabel(f.size) : `Uploading… ${Math.round(f.progress * 100)}%`)}
                </Text>
              </View>
              <Pressable
                onPress={() => uploads.remove(f.key)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${f.name}`}
                hitSlop={8}
                className="h-7 w-7 items-center justify-center"
              >
                <XIcon size={14} className="text-muted-foreground" />
              </Pressable>
            </View>
          ))}
        </View>
      )}
      {uploads.note && <Text className="text-[11px] text-muted-foreground">{uploads.note}</Text>}
    </View>
  );
}

/** Photo and PDF buttons with the pending files above them, for the new-request form. */
export function AttachFiles({ uploads, disabled }: { uploads: SupportUploads; disabled?: boolean }) {
  const off = disabled || uploads.full;
  return (
    <View className="gap-2">
      <PendingFiles uploads={uploads} />
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={() => void uploads.pickPhotos()}
          disabled={off}
          accessibilityRole="button"
          style={{ opacity: off ? 0.5 : 1 }}
          className="flex-row items-center gap-1.5 rounded-lg border border-border px-3 py-2"
        >
          <ImageIcon size={15} className="text-foreground" />
          <Text className="text-[13px] font-semibold text-foreground">Photo</Text>
        </Pressable>
        <Pressable
          onPress={() => void uploads.pickPdfs()}
          disabled={off}
          accessibilityRole="button"
          style={{ opacity: off ? 0.5 : 1 }}
          className="flex-row items-center gap-1.5 rounded-lg border border-border px-3 py-2"
        >
          <FileTextIcon size={15} className="text-foreground" />
          <Text className="text-[13px] font-semibold text-foreground">PDF</Text>
        </Pressable>
        <Text className="flex-1 text-[11px] text-muted-foreground">Up to 5, 10 MB each</Text>
      </View>
    </View>
  );
}

/** A paperclip for the reply bar, asking which kind of file. */
export function AttachButton({ uploads, disabled }: { uploads: SupportUploads; disabled?: boolean }) {
  const off = disabled || uploads.full;
  return (
    <Pressable
      onPress={() =>
        Alert.alert('Attach', undefined, [
          { text: 'Photo', onPress: () => void uploads.pickPhotos() },
          { text: 'PDF', onPress: () => void uploads.pickPdfs() },
          { text: 'Cancel', style: 'cancel' },
        ])
      }
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel="Attach a photo or PDF"
      style={{ opacity: off ? 0.5 : 1 }}
      className="h-11 w-11 items-center justify-center rounded-xl border border-border"
    >
      <PaperclipIcon size={18} className="text-foreground" />
    </Pressable>
  );
}

/** Files on a message in the thread: pictures drawn small, PDFs as a row. Tapping opens them. */
export function MessageFiles({ files }: { files?: SupportAttachment[] }) {
  if (!files?.length) return null;
  const pictures = files.filter((f) => f.url && f.content_type.startsWith('image/'));
  const others = files.filter((f) => !pictures.includes(f));
  return (
    <View className="mt-2.5 gap-2">
      {pictures.length > 0 && (
        <View className="flex-row flex-wrap gap-2">
          {pictures.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => void WebBrowser.openBrowserAsync(f.url!)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Open ${f.name}`}
            >
              <RemoteImage
                source={{ uri: f.url! }}
                contentFit="cover"
                style={{ width: 112, height: 112, borderRadius: 8 }}
              />
            </Pressable>
          ))}
        </View>
      )}
      {others.map((f) => (
        <Pressable
          key={f.id}
          onPress={() => f.url && void WebBrowser.openBrowserAsync(f.url)}
          accessibilityRole="link"
          accessibilityLabel={`Open ${f.name}`}
          className="flex-row items-center gap-2 self-start rounded-lg border border-border px-3 py-2"
        >
          <FileTextIcon size={16} className="text-muted-foreground" />
          <Text numberOfLines={1} className="max-w-[190px] text-[13px] text-foreground">
            {f.name}
          </Text>
          <Text className="text-[11px] text-muted-foreground">{fileSizeLabel(f.size_bytes)}</Text>
        </Pressable>
      ))}
    </View>
  );
}
