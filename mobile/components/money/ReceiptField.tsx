import { useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { FileTextIcon, ReceiptIcon, XIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  ApiError,
  fileSizeLabel,
  moneyApi,
  putFileToBucket,
  receiptFileProblem,
  type MoneyReceipt,
} from '@/src/api';
import { prepareSupportPhoto } from '@/src/lib/support-files';

for (const Icon of [FileTextIcon, ReceiptIcon, XIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * The receipt on the form: one already saved on the entry, or one on its way
 * up. `id` is set once the bytes are in the bucket — that is what the entry
 * sends — and `error` says why it never will be.
 */
export interface ReceiptDraft {
  id: string | null;
  name: string;
  contentType: string;
  sizeBytes: number;
  /** A photo on this phone, or the signed link of a saved one. */
  previewUri: string | null;
  progress: number;
  error: string | null;
}

export function draftOf(receipt: MoneyReceipt | null | undefined): ReceiptDraft | null {
  if (!receipt) return null;
  return {
    id: receipt.id,
    name: receipt.name,
    contentType: receipt.contentType,
    sizeBytes: receipt.sizeBytes,
    previewUri: receipt.url,
    progress: 1,
    error: null,
  };
}

/** Still going up: saving now would leave it behind. */
export function receiptBusy(draft: ReceiptDraft | null): boolean {
  return !!draft && !draft.id && !draft.error;
}

/**
 * A photo or PDF of the receipt, uploaded the moment it is picked.
 *
 * Photos come through the system picker — no permission, only what is chosen
 * reaches the app — and are re-encoded on the phone first, which drops the
 * camera's GPS and turns a HEIC into a JPEG. Taking a picture here would need
 * the camera permission, which is a store build; until then a receipt is
 * photographed with the Camera app and picked from the library.
 */
export function ReceiptField({
  value,
  onChange,
  disabled,
  label = 'Add receipt',
  hint = 'A photo or a PDF, up to 10 MB',
  imagesOnly = false,
}: {
  value: ReceiptDraft | null;
  onChange: (next: ReceiptDraft | null) => void;
  disabled?: boolean;
  /** What the empty field says: a receipt, or a payment method's QR code. */
  label?: string;
  hint?: string;
  /** A QR code is a picture; offer no PDF. */
  imagesOnly?: boolean;
}) {
  // Which pick is current: a second pick, or a removal, while one is still
  // uploading must not be overwritten when the first one finishes.
  const attempt = useRef(0);
  // The value as last rendered, for an upload that finishes later.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  async function upload(file: { uri: string; name: string; type: string; size: number }) {
    attempt.current += 1;
    const mine = attempt.current;
    const problem = receiptFileProblem({ type: file.type, size: file.size });
    const draft: ReceiptDraft = {
      id: null,
      name: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      previewUri: file.type.startsWith('image/') ? file.uri : null,
      progress: 0,
      error: problem,
    };
    onChange(draft);
    if (problem) return;
    const update = (change: Partial<ReceiptDraft>) => {
      if (attempt.current !== mine || !latest.current) return;
      onChange({ ...latest.current, ...change });
    };
    try {
      const ticket = await moneyApi.signReceipt({
        contentType: file.type,
        contentLength: file.size,
        name: file.name,
      });
      await putFileToBucket(file.uri, ticket, (progress) => update({ progress }));
      update({ id: ticket.id, progress: 1 });
    } catch (error) {
      update({
        error:
          error instanceof ApiError && error.status !== 0
            ? error.message
            : "The receipt didn't upload. Remove it and try again.",
      });
    }
  }

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 1,
      exif: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    try {
      await upload(await prepareSupportPhoto(asset));
    } catch {
      attempt.current += 1;
      onChange({
        id: null,
        name: asset.fileName ?? 'photo',
        contentType: 'image/jpeg',
        sizeBytes: 0,
        previewUri: null,
        progress: 0,
        error: "That photo couldn't be read. Try a different one.",
      });
    }
  }

  async function pickPdf() {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    let size = asset.size ?? 0;
    if (!size) {
      const info = await FileSystem.getInfoAsync(asset.uri);
      size = info.exists ? (info.size ?? 0) : 0;
    }
    await upload({
      uri: asset.uri,
      name: asset.name ?? 'receipt.pdf',
      type: asset.mimeType ?? 'application/pdf',
      size,
    });
  }

  const choose = () =>
    imagesOnly
      ? void pickPhoto()
      : Alert.alert('Add a receipt', undefined, [
          { text: 'Photo', onPress: () => void pickPhoto() },
          { text: 'PDF', onPress: () => void pickPdf() },
          { text: 'Cancel', style: 'cancel' },
        ]);

  const remove = () => {
    attempt.current += 1;
    onChange(null);
  };

  if (!value) {
    return (
      <Pressable
        onPress={choose}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${hint}`}
        style={{ opacity: disabled ? 0.5 : 1 }}
        className="min-h-14 flex-row items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-3 active:opacity-70"
      >
        <ReceiptIcon size={18} className="text-muted-foreground" />
        <View className="flex-1">
          <Text className="text-foreground text-sm font-semibold">{label}</Text>
          <Text className="text-muted-foreground text-xs mt-0.5">{hint}</Text>
        </View>
      </Pressable>
    );
  }

  const isImage = value.contentType.startsWith('image/');
  const uploading = receiptBusy(value);
  const open = () => {
    if (value.id && value.previewUri?.startsWith('http')) {
      void WebBrowser.openBrowserAsync(value.previewUri);
    }
  };

  return (
    <View
      className={`flex-row items-center gap-3 rounded-2xl border bg-card p-2.5 ${
        value.error ? 'border-destructive' : 'border-border'
      }`}
    >
      <Pressable
        onPress={open}
        disabled={!value.id}
        accessibilityRole="button"
        accessibilityLabel={`Open ${value.name}`}
        className="flex-1 flex-row items-center gap-3 active:opacity-70"
      >
        {isImage && value.previewUri && !value.error ? (
          <Image
            source={{ uri: value.previewUri }}
            style={{ width: 44, height: 44, borderRadius: 10 }}
            contentFit="cover"
          />
        ) : (
          <View className="h-11 w-11 items-center justify-center rounded-[10px] bg-muted">
            <FileTextIcon size={18} className="text-muted-foreground" />
          </View>
        )}
        <View className="flex-1 min-w-0">
          <Text numberOfLines={1} className="text-foreground text-sm font-semibold">
            {value.name}
          </Text>
          <Text
            numberOfLines={2}
            className={`text-xs mt-0.5 ${value.error ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {value.error ??
              (uploading
                ? `Uploading… ${Math.round(value.progress * 100)}%`
                : value.sizeBytes > 0
                  ? fileSizeLabel(value.sizeBytes)
                  : 'Receipt')}
          </Text>
        </View>
      </Pressable>
      {uploading ? <ActivityIndicator size="small" /> : null}
      <Pressable
        onPress={remove}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${value.name}`}
        hitSlop={8}
        className="h-9 w-9 items-center justify-center rounded-full active:bg-muted"
      >
        <XIcon size={16} className="text-muted-foreground" />
      </Pressable>
    </View>
  );
}
