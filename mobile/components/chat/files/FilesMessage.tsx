import { memo, useState, type ReactNode, type Ref } from 'react';
import { Pressable, Text, View, useWindowDimensions, type AccessibilityActionEvent } from 'react-native';
import { Image } from 'expo-image';
import {
  AlertCircleIcon,
  ClockIcon,
  DownloadIcon,
  ForwardIcon,
  ImageIcon,
  WifiOffIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  chatFileSize,
  fileDetailLine,
  filesCaption,
  photoCountLabel,
  type ChatAttachment,
  type ConversationMessage,
} from '@/src/api';
import type { UploadFile, UploadJob } from '@/src/lib/chat-uploads';
import { PALETTES } from '@/theme';

for (const Icon of [AlertCircleIcon, ClockIcon, DownloadIcon, ForwardIcon, ImageIcon, WifiOffIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** The grid's width on the boards; never past 80% of the thread. */
const GRID_WIDTH = 240;
const GAP = 2;
/** Over a photograph the shade is dark in either theme. */
const SCRIM = `${PALETTES.light.foreground}66`;
const PILL = `${PALETTES.light.foreground}B3`;

/** The image cache's key for a chat photo: its id, since its links change every six hours. */
export function chatPhotoKey(attachmentId: string, size: 'thumb' | 'full'): string {
  return `chat-${attachmentId}-${size === 'thumb' ? 't' : 'f'}`;
}

/** What one tile shows. */
interface Tile {
  key: string;
  /** A local file, a thumbnail, or the blur alone. */
  uri: string | null;
  cacheKey: string | null;
  blur: string | null;
  width: number | null;
  height: number | null;
  /**
   * What sits over it: how far its upload has got (yours), waiting for a
   * connection, on its way from someone else, or never arrived.
   */
  over: { kind: 'progress'; fraction: number } | { kind: 'queued' } | { kind: 'waiting' } | { kind: 'arriving' } | { kind: 'failed' } | null;
}

/** This phone's copy of an attachment, while it is still on its way out. */
function localFor(upload: UploadJob | null | undefined, attachmentId: string): UploadFile | null {
  return upload?.files.find((f) => f.attachmentId === attachmentId) ?? null;
}

function overFor(file: UploadFile | null, attachment: ChatAttachment | null): Tile['over'] {
  if (attachment?.status === 'failed' || file?.state === 'failed') return { kind: 'failed' };
  if (attachment?.status === 'ready') return null;
  if (!file) return attachment ? { kind: 'arriving' } : { kind: 'queued' };
  if (file.state === 'uploading') return { kind: 'progress', fraction: file.progress };
  if (file.state === 'waiting') return { kind: 'waiting' };
  if (file.state === 'done') return null;
  return { kind: 'queued' };
}

/** The tiles for a message's photos: its own, or this phone's copies while they upload. */
function messageTiles(
  attachments: ChatAttachment[],
  upload: UploadJob | null | undefined,
  showPictures: boolean,
): Tile[] {
  return attachments.map((a) => {
    const local = localFor(upload, a.id);
    const ready = a.status === 'ready';
    // Your own photo stays your own copy until it's in: nothing to download.
    const useLocal = !!local && local.state !== 'failed' && (!ready || local.state !== 'done');
    let uri: string | null = null;
    let cacheKey: string | null = null;
    if (useLocal) uri = local!.uri;
    else if (ready && showPictures && a.thumbUrl) {
      uri = a.thumbUrl;
      cacheKey = chatPhotoKey(a.id, 'thumb');
    } else if (ready) uri = a.blur;
    return {
      key: a.id,
      uri,
      cacheKey,
      blur: a.blur,
      width: a.width ?? local?.width ?? null,
      height: a.height ?? local?.height ?? null,
      over: overFor(local, a),
    };
  });
}

/** How the grid lays out n photos: rows of tile indexes. */
function rowsFor(n: number): number[][] {
  if (n <= 1) return [[0]];
  if (n === 2) return [[0, 1]];
  if (n === 3) return [[0], [1, 2]];
  return [[0, 1], [2, 3]];
}

/**
 * The photos of one message, as on board 142: one at its own shape, two side
 * by side, three as one big and two small, four as a 2×2, more as a 2×2
 * with "+N" on the last. Each box is drawn at its size before anything loads,
 * the blurred stand-in behind it.
 */
export function PhotoGrid({
  tiles,
  width,
  onPressTile,
  onLongPress,
  waitingForTap,
}: {
  tiles: Tile[];
  width: number;
  onPressTile?: (index: number) => void;
  onLongPress?: () => void;
  /** Pictures wait for a tap on this line: "Tap to load" over the stand-ins. */
  waitingForTap?: boolean;
}) {
  const n = tiles.length;
  const half = Math.floor((width - GAP) / 2);
  const rows = rowsFor(n);
  const more = n > 4 ? n - 4 : 0;

  const heightOf = (row: number[]): number => {
    if (n === 1) {
      const t = tiles[0];
      if (t?.width && t.height) {
        return Math.round(Math.min(Math.max((width * t.height) / t.width, width * 0.6), width * 1.33));
      }
      return Math.round(width * 0.75);
    }
    if (n === 3 && row.length === 1) return Math.round(width * 0.6);
    return half;
  };

  return (
    <View className="rounded-[20px] overflow-hidden bg-muted" style={{ width, gap: GAP }}>
      {rows.map((row) => (
        <View key={row.join('-')} className="flex-row" style={{ gap: GAP, height: heightOf(row) }}>
          {row.map((i) => {
            const tile = tiles[i];
            if (!tile) return null;
            return (
              <Pressable
                key={tile.key}
                onPress={onPressTile ? () => onPressTile(i) : undefined}
                onLongPress={onLongPress}
                delayLongPress={300}
                accessibilityRole={onPressTile ? 'button' : undefined}
                accessibilityLabel={n === 1 ? 'Photo' : `Photo ${i + 1} of ${n}`}
                className="flex-1 bg-muted overflow-hidden active:opacity-90"
              >
                <TileImage tile={tile} />
                {i === 3 && more > 0 ? (
                  <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: SCRIM }}>
                    <Text className="text-action-foreground text-[22px] font-bold">+{more}</Text>
                  </View>
                ) : (
                  <TileOver over={tile.over} big={n === 1} />
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
      {waitingForTap ? (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <View className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5" style={{ backgroundColor: PILL }}>
            <ImageIcon size={14} className="text-action-foreground" />
            <Text className="text-action-foreground text-[13px] font-semibold">Tap to load</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function TileImage({ tile }: { tile: Tile }) {
  if (!tile.uri) return null;
  return (
    <Image
      source={tile.cacheKey ? { uri: tile.uri, cacheKey: tile.cacheKey } : { uri: tile.uri }}
      placeholder={tile.blur && tile.uri !== tile.blur ? { uri: tile.blur } : undefined}
      placeholderContentFit="cover"
      cachePolicy={tile.cacheKey ? 'memory-disk' : 'memory'}
      recyclingKey={tile.key}
      contentFit="cover"
      transition={140}
      style={{ width: '100%', height: '100%' }}
    />
  );
}

function TileOver({ over, big }: { over: Tile['over']; big: boolean }) {
  if (!over) return null;
  if (over.kind === 'arriving') {
    // Someone else's, still on its way to the server: quiet, never a spinner.
    return (
      <View className="absolute inset-0 items-center justify-center">
        <ClockIcon size={18} className="text-muted-foreground" />
      </View>
    );
  }
  if (over.kind === 'failed') {
    return (
      <View className="absolute inset-0 items-center justify-center gap-1 bg-muted px-2">
        <AlertCircleIcon size={18} className="text-muted-foreground" />
        <Text className="text-muted-foreground text-[12px] font-semibold text-center">{"Didn't arrive"}</Text>
      </View>
    );
  }
  const words =
    over.kind === 'progress'
      ? `${Math.round(over.fraction * 100)}%`
      : over.kind === 'waiting'
        ? big
          ? 'Waiting for a connection'
          : null
        : null;
  return (
    <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: SCRIM }}>
      <View className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1" style={{ backgroundColor: PILL }}>
        {over.kind === 'waiting' ? (
          <WifiOffIcon size={13} className="text-action-foreground" />
        ) : over.kind === 'queued' ? (
          <ClockIcon size={13} className="text-action-foreground" />
        ) : null}
        {words ? <Text className="text-action-foreground text-[12px] font-semibold">{words}</Text> : null}
      </View>
    </View>
  );
}

/** "PDF" on a tile, the way a file reads at a glance. */
function PdfTile() {
  return (
    <View className="w-11 h-[52px] rounded-[10px] bg-destructive/10 items-center justify-end pb-2">
      <Text className="text-destructive text-[11px] font-extrabold">PDF</Text>
    </View>
  );
}

/**
 * A PDF in the thread: what it is and how big, before anyone downloads it.
 * The card, or its round button, opens it.
 */
export function FileCard({
  name,
  detail,
  failed,
  canOpen,
  onOpen,
  onLongPress,
  children,
}: {
  name: string;
  detail: string;
  failed: boolean;
  canOpen: boolean;
  onOpen?: () => void;
  onLongPress?: () => void;
  children?: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(268, Math.floor((width - 32) * 0.8));
  return (
    <Pressable
      onPress={canOpen ? onOpen : undefined}
      onLongPress={onLongPress}
      delayLongPress={300}
      accessibilityRole={canOpen ? 'button' : undefined}
      accessibilityLabel={`${name}, ${detail}`}
      accessibilityHint={canOpen ? 'Opens the file' : undefined}
      className="rounded-[20px] bg-card border border-border/40 active:opacity-90"
      style={{ width: cardWidth }}
    >
      <View className="flex-row items-center gap-3 p-2.5">
        <PdfTile />
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>
            {name}
          </Text>
          <Text
            className={`text-[13px] leading-[18px] ${failed ? 'text-destructive' : 'text-muted-foreground'}`}
            numberOfLines={1}
          >
            {detail}
          </Text>
        </View>
        {canOpen ? (
          <Pressable
            onPress={onOpen}
            onLongPress={onLongPress}
            accessibilityRole="button"
            accessibilityLabel={`Download ${name}`}
            className="w-11 h-11 rounded-full bg-muted items-center justify-center active:opacity-70"
          >
            <DownloadIcon size={18} className="text-foreground" />
          </Pressable>
        ) : null}
      </View>
      {children}
    </Pressable>
  );
}

/** The sending line for a file of yours: how far, or why it's waiting. */
function fileProgressLine(file: UploadFile | null, attachment: ChatAttachment | null, size: number): string {
  if (attachment?.status === 'failed' || file?.state === 'failed') return "Didn't arrive";
  if (attachment?.status === 'ready') return fileDetailLine(attachment);
  if (!file) return `PDF · ${chatFileSize(size)} · Sending…`;
  if (file.state === 'waiting') return 'Waiting for a connection';
  if (file.state === 'uploading') return `Sending · ${Math.round(file.progress * 100)}%`;
  return `PDF · ${chatFileSize(size)} · Sending…`;
}

/** Where your send has got, for the line under it. Null once it's all in. */
export function sendingLine(upload: UploadJob | null | undefined, isOffline: boolean): string | null {
  if (!upload) return null;
  if (upload.status === 'failed') {
    return upload.failure === 'storage-full' ? "Didn't send · Out of storage" : "Didn't send · Tap to retry";
  }
  if (upload.status === 'waiting' || upload.files.some((f) => f.state === 'waiting')) {
    return isOffline ? 'Waiting for a connection' : 'Waiting to send · Tap to retry';
  }
  const total = upload.files.length;
  const done = upload.files.filter((f) => f.state === 'done' || f.state === 'failed').length;
  if (done >= total) return null;
  if (!upload.messageId) return 'Sending…';
  return upload.kind === 'photos' && total > 1 ? `Sending ${Math.min(done + 1, total)} of ${total}` : 'Sending…';
}

/** A reply's quote, over the photos or the file. */
function Quote({ sender, line, mine }: { sender: string; line: string; mine: boolean }) {
  return (
    <View
      className={`rounded-xl px-2.5 py-1.5 mb-1 ${mine ? 'bg-muted' : 'bg-card border border-border/40'}`}
      style={{ borderLeftWidth: 2, borderLeftColor: PALETTES.light.primary, maxWidth: 260 }}
    >
      <Text className="text-primary text-[11px] font-bold" numberOfLines={1}>
        {sender}
      </Text>
      <Text className="text-muted-foreground text-xs" numberOfLines={1}>
        {line}
      </Text>
    </View>
  );
}

export interface FilesMessageProps {
  message: ConversationMessage;
  mine: boolean;
  showName: boolean;
  /** "1:40 PM · Seen", or the time alone for theirs. */
  meta: string;
  /** This phone's send of it, while its bytes are still going. */
  upload?: UploadJob | null;
  isOffline: boolean;
  autoLoadMedia: boolean;
  /** The quote's line, when it answers something. */
  quote?: { sender: string; line: string } | null;
  bubbleRef: Ref<View>;
  onHold: () => void;
  onOpenPhoto: (message: ConversationMessage, index: number) => void;
  onOpenFile: (message: ConversationMessage, attachment: ChatAttachment) => void;
  /** A tap on a send of yours that is waiting or failed. */
  onSendingPress?: (upload: UploadJob) => void;
  pills: ReactNode;
  /** Ringed: the search match you are on, or a pin you jumped to. */
  lit: boolean;
  accessibilityActions: { name: string; label: string }[];
  onAccessibilityAction: (e: AccessibilityActionEvent) => void;
}

/**
 * Photos or a PDF from somebody's phone, as board 142 draws them: the grid,
 * then the caption — in your own bubble under it, or inside a white card with
 * the photo for theirs — then the time.
 */
export const FilesMessage = memo(function FilesMessage({
  message,
  mine,
  showName,
  meta,
  upload,
  isOffline,
  autoLoadMedia,
  quote,
  bubbleRef,
  onHold,
  onOpenPhoto,
  onOpenFile,
  onSendingPress,
  pills,
  lit,
  accessibilityActions,
  onAccessibilityAction,
}: FilesMessageProps) {
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.min(GRID_WIDTH, Math.floor((windowWidth - 32) * 0.8));
  const [asked, setAsked] = useState(false);
  const caption = filesCaption(message);
  const attachments = message.attachments ?? [];
  const sending = mine ? sendingLine(upload, isOffline) : null;
  const sendingTappable = !!upload && (upload.status === 'failed' || upload.status === 'waiting' || upload.files.some((f) => f.state === 'waiting'));
  const metaLine = sending ? `${meta.split(' · ')[0]} · ${sending}` : meta;

  const isPhotos = message.kind === 'photos';
  const anyReadyPhoto = attachments.some((a) => a.status === 'ready' && !localFor(upload, a.id));
  const showPictures = autoLoadMedia || asked;
  const tiles = isPhotos ? messageTiles(attachments, upload, showPictures) : [];
  const waitingForTap = isPhotos && !showPictures && anyReadyPhoto;
  const pressTile = (index: number) => {
    if (waitingForTap) {
      setAsked(true);
      return;
    }
    const a = attachments[index];
    if (a?.status === 'ready') onOpenPhoto(message, index);
    else if (upload && sendingTappable) onSendingPress?.(upload);
  };

  const label = [
    message.forwarded ? 'Forwarded' : null,
    `${mine ? 'You' : (message.sender_name ?? 'Someone')}: ${
      isPhotos ? photoCountLabel(attachments.length) : `File, ${attachments[0]?.name ?? 'a PDF'}`
    }`,
    caption,
    metaLine,
  ]
    .filter(Boolean)
    .join(', ');

  const captionInCard = !mine && !!caption;
  const body = isPhotos ? (
    <PhotoGrid
      tiles={tiles}
      width={width}
      onPressTile={pressTile}
      onLongPress={onHold}
      waitingForTap={waitingForTap}
    />
  ) : (
    (() => {
      const a = attachments[0] ?? null;
      const local = a ? localFor(upload, a.id) : null;
      const failed = a?.status === 'failed' || local?.state === 'failed';
      const detail = a ? (mine ? fileProgressLine(local, a, a.sizeBytes) : a.status === 'ready' ? fileDetailLine(a) : failed ? "Didn't arrive" : `PDF · ${chatFileSize(a.sizeBytes)} · Arriving…`) : 'PDF';
      return (
        <FileCard
          name={a?.name ?? 'File'}
          detail={detail}
          failed={failed}
          canOpen={a?.status === 'ready'}
          onOpen={a ? () => onOpenFile(message, a) : undefined}
          onLongPress={onHold}
        >
          {captionInCard ? (
            <Text className="text-foreground text-[15px] leading-5 px-3 pb-2.5">{caption}</Text>
          ) : null}
        </FileCard>
      );
    })()
  );

  return (
    <View className={mine ? 'items-end' : 'items-start'}>
      {showName ? (
        <Text className="text-muted-foreground text-xs mb-0.5 ml-1" numberOfLines={1}>
          {message.sender_name}
        </Text>
      ) : null}
      {message.forwarded ? (
        <View className="flex-row items-center gap-1 mb-1 px-1">
          <ForwardIcon size={12} className="text-muted-foreground" />
          <Text className="text-[12px] text-muted-foreground">Forwarded</Text>
        </View>
      ) : null}
      {quote ? <Quote sender={quote.sender} line={quote.line} mine={mine} /> : null}
      <View
        ref={bubbleRef}
        accessible
        accessibilityLabel={label}
        accessibilityHint="Long press to react, reply, forward or delete"
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={onAccessibilityAction}
        className={mine ? 'items-end gap-1' : 'items-start gap-1'}
        style={
          lit
            ? { outlineWidth: 2.5, outlineStyle: 'solid', outlineOffset: 3, outlineColor: PALETTES.light.ring, borderRadius: 20 }
            : undefined
        }
      >
        {isPhotos && captionInCard ? (
          // Theirs with words: one white card, the photos on top and the words inside.
          <View className="rounded-[20px] bg-card border border-border/40 overflow-hidden" style={{ width: width + 2 }}>
            {body}
            <Pressable onLongPress={onHold} delayLongPress={300}>
              <Text className="text-foreground text-[15px] leading-5 px-3 pt-2 pb-2.5">{caption}</Text>
            </Pressable>
          </View>
        ) : (
          body
        )}
        {mine && caption ? (
          <Pressable
            onLongPress={onHold}
            delayLongPress={300}
            className="rounded-[20px] bg-action px-3.5 py-2.5"
            style={{ maxWidth: Math.max(width, Math.floor((windowWidth - 32) * 0.78)) }}
          >
            <Text className="text-action-foreground text-[15px] leading-5">{caption}</Text>
          </Pressable>
        ) : null}
      </View>
      {sendingTappable && upload && onSendingPress ? (
        <Pressable
          onPress={() => onSendingPress(upload)}
          accessibilityRole="button"
          hitSlop={8}
          className="mt-1 px-1 active:opacity-60"
        >
          <Text className="text-[11px] text-primary font-semibold">{metaLine}</Text>
        </Pressable>
      ) : (
        <Text className="mt-1 px-1 text-[11px] text-muted-foreground">{metaLine}</Text>
      )}
      {pills}
    </View>
  );
});

/**
 * A send of yours that hasn't reached the chat yet: its links are being made,
 * or it is waiting for a connection, or the server said no before anything
 * went (out of storage). Drawn from this phone's copies, the same way the
 * message will be.
 */
export const PendingFilesBubble = memo(function PendingFilesBubble({
  upload,
  isOffline,
  onPress,
}: {
  upload: UploadJob;
  isOffline: boolean;
  onPress: (upload: UploadJob) => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.min(GRID_WIDTH, Math.floor((windowWidth - 32) * 0.8));
  const status = sendingLine(upload, isOffline) ?? 'Sending…';
  const failed = upload.status === 'failed';
  const tappable = failed || upload.status === 'waiting';
  const over: Tile['over'] = failed ? null : upload.status === 'waiting' ? { kind: 'waiting' } : { kind: 'queued' };
  const tiles: Tile[] = upload.files.map((f, i) => ({
    key: `${upload.clientId}-${i}`,
    uri: f.uri,
    cacheKey: null,
    blur: null,
    width: f.width,
    height: f.height,
    over,
  }));
  const file = upload.files[0];

  return (
    <View className="items-end">
      {upload.replyToLine ? (
        <Quote sender={upload.replyToSender ?? 'Message'} line={upload.replyToLine} mine />
      ) : null}
      <Pressable
        onPress={tappable ? () => onPress(upload) : undefined}
        accessibilityRole={tappable ? 'button' : undefined}
        accessibilityLabel={`You: ${upload.kind === 'photos' ? photoCountLabel(upload.files.length) : `File, ${file?.name ?? 'a PDF'}`}${upload.caption ? `, ${upload.caption}` : ''}, ${status}`}
        className="items-end gap-1"
        style={failed ? { opacity: 0.75 } : undefined}
      >
        {upload.kind === 'photos' ? (
          <View pointerEvents="none">
            <PhotoGrid tiles={tiles} width={width} />
          </View>
        ) : file ? (
          <View pointerEvents="none">
            <FileCard
              name={file.name}
              detail={failed ? "Didn't send" : upload.status === 'waiting' ? 'Waiting for a connection' : `PDF · ${chatFileSize(file.size)} · Sending…`}
              failed={failed}
              canOpen={false}
            />
          </View>
        ) : null}
        {upload.caption ? (
          <View className="rounded-[20px] bg-action px-3.5 py-2.5" style={{ maxWidth: Math.floor((windowWidth - 32) * 0.78) }}>
            <Text className="text-action-foreground text-[15px] leading-5">{upload.caption}</Text>
          </View>
        ) : null}
        <View className="flex-row items-center gap-1 mt-0.5 px-1">
          {failed ? <AlertCircleIcon size={12} className="text-destructive" /> : null}
          <Text className={`text-[11px] ${failed || tappable ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
            {status}
          </Text>
        </View>
      </Pressable>
    </View>
  );
});
