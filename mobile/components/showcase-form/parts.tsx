import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AlertCircleIcon, PlayIcon, XIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { clock } from '@/src/lib/media-grid';

for (const Icon of [AlertCircleIcon, XIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** A piece of a post: a photograph, or a film. */
export type PieceKind = 'image' | 'video';

/**
 * What is known about a chosen piece beyond its still. All of it is optional:
 * a piece that came with the post being edited has no file name, and a
 * photograph has no length.
 */
export interface PieceAbout {
  name?: string;
  /** The album it was picked from. */
  album?: string;
  durationMs?: number | null;
}

/** `84000` -> `1 min 24 s`, for a line of text; a tile shows the clock. */
export function spokenLength(durationMs: number): string {
  const total = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `${seconds} s`;
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
}

/** "DSC_0418.JPG · from Reyes–Santos wedding", or as much of it as is known. */
export function pieceLine(about: PieceAbout | undefined, withLength = false): string {
  return [
    withLength && about?.durationMs ? spokenLength(about.durationMs) : null,
    !withLength ? about?.name : null,
    about?.album ? `from ${about.album}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The mark that says a tile is a film: a play glyph and how long it runs, in
 * the bottom corner. It was a play button over the middle of the frame, which
 * covered the one thing a poster frame is there to show.
 */
export function FilmMark({ durationMs }: { durationMs?: number | null }) {
  return (
    <View
      pointerEvents="none"
      className="absolute left-1.5 bottom-1.5 flex-row items-center gap-1 rounded-full px-[7px] py-0.5"
      style={{ backgroundColor: 'rgba(20,16,13,0.55)' }}
    >
      <PlayIcon size={9} color="#FFFFFF" fill="#FFFFFF" />
      {durationMs ? (
        <Text className="text-[11px] font-semibold" style={{ color: '#FFFFFF' }}>
          {clock(durationMs / 1000)}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Something the picker has to say about what is chosen, beside the work it is
 * about: why a tap did not add anything, a piece the server turned down, the
 * limit reached. One rounded card each, tinted by how serious it is.
 */
export function PickerNotice({
  tone = 'quiet',
  children,
  onDismiss,
  trailing,
}: {
  tone?: 'quiet' | 'warning' | 'wrong';
  children: ReactNode;
  onDismiss?: () => void;
  /** After the text: the one thing to do about it. */
  trailing?: ReactNode;
}) {
  const surface =
    tone === 'wrong' ? 'bg-destructive/10' : tone === 'warning' ? 'bg-warning/10' : 'bg-muted';
  return (
    <View className={`mx-5 flex-row items-start gap-2.5 rounded-2xl p-3.5 ${surface}`}>
      {tone === 'quiet' ? null : (
        <AlertCircleIcon
          size={18}
          className={tone === 'wrong' ? 'text-destructive' : 'text-warning'}
          style={{ marginTop: 1 }}
        />
      )}
      <View className="flex-1 min-w-0">{children}</View>
      {trailing}
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          hitSlop={8}
          className="w-8 h-8 -mr-1.5 -mt-1.5 items-center justify-center active:opacity-60"
        >
          <XIcon size={16} className="text-muted-foreground" />
        </Pressable>
      ) : null}
    </View>
  );
}

/** The words in a notice. */
export function NoticeText({ children }: { children: ReactNode }) {
  return <Text className="text-foreground text-[14px] leading-5">{children}</Text>;
}
