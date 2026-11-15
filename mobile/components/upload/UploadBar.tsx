import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckIcon, ChevronUpIcon, XIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { UploadThumb } from '@/components/upload/UploadThumb';
import { formatBytes } from '@/src/api';
import { useTheme } from '@/src/hooks';
import { useKeyboardUp } from '@/src/lib/keyboard';
import { uploadsSheet } from '@/src/lib/uploads-sheet';
import { useUploadQueue, type UploadTask } from '@/src/providers/UploadProvider';
import { PALETTES } from '@/theme';

for (const Icon of [CheckIcon, ChevronUpIcon, XIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** How long "27 uploaded" stays before the bar goes. */
const DONE_HOLD_MS = 2800;

type Phase = 'uploading' | 'failed' | 'done';

/** This album's share of the queue, and where it has got to. */
function useAlbumUploads(albumId: string) {
  const { tasks, retry, remove } = useUploadQueue();
  const mine = tasks.filter((task) => task.albumId === albumId);
  const running = mine.filter((task) => task.status === 'queued' || task.status === 'uploading');
  const failed = mine.filter((task) => task.status === 'failed');
  const done = mine.filter((task) => task.status === 'done').length;
  return { mine, running, failed, done, retry, remove };
}

/**
 * The bar an album shows while files are going into it, and for a moment
 * after: what is uploading, how far along, and a way into the list.
 *
 * Only here, in the album the files are for. Everywhere else, and here too
 * while the keyboard is up or files are being selected, the same thing is the
 * small ring that floats and can be dragged out of the way (UploadRing): a bar
 * across the bottom of a chat sits on the message box for as long as the
 * upload runs, which is why the ring was made. It tells the ring when it is on
 * screen, so there is never both.
 */
export function UploadBar({
  albumId,
  albumName,
  hidden,
}: {
  albumId: string;
  albumName: string;
  /** The album has something else along its bottom: the selection's bar. */
  hidden?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const keyboardUp = useKeyboardUp();
  const { mine, running, failed, done, retry } = useAlbumUploads(albumId);

  // "27 uploaded", briefly, when a batch into this album ends clean.
  const [justDone, setJustDone] = useState(0);
  const wasRunning = useRef(false);
  useEffect(() => {
    if (running.length > 0) {
      wasRunning.current = true;
      setJustDone(0);
      return;
    }
    if (!wasRunning.current) return;
    wasRunning.current = false;
    if (failed.length === 0 && done > 0) setJustDone(done);
  }, [running.length, failed.length, done]);
  useEffect(() => {
    if (justDone === 0) return;
    const timer = setTimeout(() => setJustDone(0), DONE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [justDone]);

  // Put away by hand: it stays away until something about the failures changes.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const failedCount = failed.length;
  useEffect(() => {
    if (dismissedAt !== null && dismissedAt !== failedCount) setDismissedAt(null);
  }, [failedCount, dismissedAt]);

  const phase: Phase | null =
    running.length > 0 ? 'uploading' : failedCount > 0 && dismissedAt === null ? 'failed' : justDone > 0 ? 'done' : null;
  const showing = phase !== null && !hidden && !keyboardUp;

  useEffect(() => {
    uploadsSheet.setBarShowing(showing);
    return () => uploadsSheet.setBarShowing(false);
  }, [showing]);

  if (!showing || !phase) return null;

  const total = mine.length;
  const totalBytes = mine.reduce((sum, task) => sum + task.sizeBytes, 0);
  const sentBytes = mine.reduce((sum, task) => sum + task.sizeBytes * (task.status === 'done' ? 1 : task.progress), 0);
  const fraction = totalBytes > 0 ? Math.min(sentBytes / totalBytes, 1) : 0;
  // On the dark card of the light theme the terracotta is too dark to read;
  // on the cream card of the dark theme it is right.
  const accent = isDark ? palette.primary : '#E79A6F';
  const ink = palette.background;

  const title =
    phase === 'uploading'
      ? `Uploading ${Math.min(done + 1, total)} of ${total}`
      : phase === 'failed'
        ? done > 0
          ? `${done} uploaded, ${failedCount} didn’t`
          : `${failedCount} didn’t upload`
        : `${justDone} uploaded to ${albumName}`;
  const detail =
    phase === 'uploading'
      ? `${formatBytes(sentBytes)} of ${formatBytes(totalBytes)}`
      : phase === 'failed'
        ? failed[0]?.error || 'Tap to see why'
        : null;

  return (
    <View
      pointerEvents="box-none"
      className="absolute left-0 right-0 px-3"
      style={{ bottom: Math.max(insets.bottom, 8) + 4 }}
    >
      <Pressable
        onPress={uploadsSheet.open}
        accessibilityRole="button"
        accessibilityLabel={`${title}. Open the uploads`}
        accessibilityLiveRegion="polite"
        className="min-h-[60px] rounded-[20px] bg-foreground overflow-hidden flex-row items-center gap-3 pl-3.5 pr-1.5 active:opacity-90"
        style={{
          shadowColor: '#000',
          shadowOpacity: isDark ? 0.5 : 0.25,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        {phase === 'uploading' ? (
          <ActivityIndicator size="small" color={accent} />
        ) : phase === 'failed' ? (
          <View className="w-[30px] h-[30px] rounded-full bg-destructive items-center justify-center">
            <Text className="text-white text-[16px] font-extrabold">!</Text>
          </View>
        ) : (
          <View className="w-[30px] h-[30px] rounded-full bg-success items-center justify-center">
            <CheckIcon size={16} color="#FFFFFF" strokeWidth={3} />
          </View>
        )}
        <View className="flex-1 min-w-0 py-2.5">
          <Text className="text-background text-[15px] leading-5 font-semibold" numberOfLines={1}>
            {title}
          </Text>
          {detail ? (
            <Text className="text-background/65 text-[12px] leading-4" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
              {detail}
            </Text>
          ) : null}
        </View>
        {phase === 'failed' ? (
          <>
            <Pressable
              onPress={() => failed.forEach((task) => retry(task.id))}
              accessibilityRole="button"
              accessibilityLabel={failedCount === 1 ? 'Try it again' : 'Try them again'}
              className="h-10 px-3.5 rounded-full bg-background/15 items-center justify-center active:opacity-70"
            >
              <Text className="text-background text-[14px] font-semibold">Retry</Text>
            </Pressable>
            <Pressable
              onPress={() => setDismissedAt(failedCount)}
              accessibilityRole="button"
              accessibilityLabel="Put this away"
              className="w-10 h-10 items-center justify-center active:opacity-60"
            >
              <XIcon size={18} color={ink} />
            </Pressable>
          </>
        ) : phase === 'uploading' ? (
          <View className="w-11 h-11 items-center justify-center">
            <ChevronUpIcon size={20} color={ink} />
          </View>
        ) : null}
        {phase === 'uploading' ? (
          <View pointerEvents="none" className="absolute left-0 right-0 bottom-0 h-[3px]">
            <View className="h-full" style={{ width: `${Math.round(fraction * 100)}%`, backgroundColor: accent }} />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

/** How many of the files on their way are drawn before "+N". */
const SHOWN = 9;

/**
 * The files on their way into this album, at the top of its grid, as the
 * pictures they are: sending, waiting, or failed.
 *
 * Once a file has arrived it is the album's, and shows in the grid below like
 * any other; these are only the ones that are not there yet.
 */
export function PendingUploads({ albumId, tile }: { albumId: string; tile: number }) {
  const { running, failed, mine, done } = useAlbumUploads(albumId);
  // The one sending first, then failures, then what is waiting.
  const pending: UploadTask[] = [
    ...running.filter((task) => task.status === 'uploading'),
    ...failed,
    ...running.filter((task) => task.status === 'queued'),
  ];
  if (pending.length === 0) return null;
  const shown = pending.slice(0, SHOWN);
  const more = pending.length - shown.length;

  return (
    <View>
      <View className="px-5 pt-4 pb-2.5 flex-row items-baseline gap-2">
        <Text className="text-foreground text-[15px] leading-5 font-bold" accessibilityRole="header">
          {running.length > 0 ? 'Uploading now' : 'Didn’t upload'}
        </Text>
        <Text className="text-muted-foreground text-[13px] leading-[18px]">
          {running.length > 0 ? `${done} of ${mine.length}` : `${failed.length}`}
        </Text>
      </View>
      <View className="flex-row flex-wrap" style={{ gap: 2 }}>
        {shown.map((task, at) => {
          const last = at === shown.length - 1 && more > 0;
          return (
            <Pressable
              key={task.id}
              onPress={uploadsSheet.open}
              accessibilityRole="button"
              accessibilityLabel={`${task.name}, ${
                task.status === 'failed'
                  ? 'did not upload'
                  : task.status === 'uploading'
                    ? `${Math.round(task.progress * 100)} percent`
                    : 'waiting'
              }`}
              style={{ width: tile, height: tile }}
              className="bg-muted overflow-hidden active:opacity-80"
            >
              <UploadThumb task={task} />
              {task.status === 'uploading' ? (
                <>
                  <View className="absolute inset-0 bg-foreground/40" />
                  <View className="absolute left-2 right-2 bottom-2 h-1 rounded-full bg-white/40 overflow-hidden">
                    <View className="h-full rounded-full bg-white" style={{ width: `${Math.round(Math.min(task.progress, 1) * 100)}%` }} />
                  </View>
                </>
              ) : task.status === 'failed' ? (
                <>
                  <View className="absolute inset-0 bg-destructive/30" />
                  <View className="absolute right-1.5 top-1.5 w-[22px] h-[22px] rounded-full bg-destructive border-2 border-background items-center justify-center">
                    <Text className="text-white text-[12px] font-extrabold">!</Text>
                  </View>
                </>
              ) : (
                <View className="absolute inset-0 bg-background/55" />
              )}
              {last ? (
                <View className="absolute inset-0 bg-foreground/60 items-center justify-center">
                  <Text className="text-background text-[17px] font-bold">+{more}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
