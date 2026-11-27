import { memo, useCallback, useMemo } from 'react';
import { Alert, FlatList, Pressable, Text, View, useWindowDimensions, type ListRenderItem } from 'react-native';
import { CheckIcon, RotateCwIcon, XIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BottomSheet } from '@/components/BottomSheet';
import { UploadThumb } from '@/components/upload/UploadThumb';
import { formatBytes } from '@/src/api';
import { uploadsSheet, useUploadsSheetOpen } from '@/src/lib/uploads-sheet';
import { useUploadQueue, type UploadTask } from '@/src/providers/UploadProvider';

for (const Icon of [CheckIcon, RotateCwIcon, XIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** What is going first, then what failed, then what is waiting, then what is done. */
const ORDER = { uploading: 0, failed: 1, queued: 2, done: 3 } as const;

/**
 * Every file that is on its way up, and what it is doing.
 *
 * One sheet, mounted once over the whole app, opened by the floating ring and
 * by the bar an album shows. It was a screen of its own, reached only from the
 * ring; a file that failed in an album was looked up by leaving the album.
 *
 * Anything not finished can be removed — a file already sending is stopped —
 * and a failure can be tried again, with its reason in full: it is usually
 * something the person can fix (no space left, a file that has gone).
 *
 * A list, not a scroll view: a batch of 294 drew 294 rows at once, each with
 * its photograph, and drew them all again for every step of every bar. Only
 * the rows on screen exist now, and a row redraws only when its own file
 * moves.
 */
export function UploadsSheet() {
  const visible = useUploadsSheetOpen();
  const { height } = useWindowDimensions();
  const { tasks, active, overall, retry, remove, clearFinished } = useUploadQueue();

  const summary = useMemo(() => {
    let done = 0;
    let totalBytes = 0;
    let sentBytes = 0;
    const failed: UploadTask[] = [];
    const running: UploadTask[] = [];
    for (const task of tasks) {
      totalBytes += task.sizeBytes;
      sentBytes += task.sizeBytes * (task.status === 'done' ? 1 : task.progress);
      if (task.status === 'done') done += 1;
      else if (task.status === 'failed') failed.push(task);
      else running.push(task);
    }
    // Stable, so files of one kind keep the order they were picked in.
    const sorted = [...tasks].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
    return { done, totalBytes, sentBytes, failed, running, sorted };
  }, [tasks]);
  const { done, totalBytes, sentBytes, failed, running, sorted } = summary;

  const title = active
    ? `Uploading ${Math.min(done + 1, tasks.length)} of ${tasks.length}`
    : failed.length > 0
      ? `${failed.length} didn’t upload`
      : tasks.length > 0
        ? `${done} uploaded`
        : 'Nothing uploading';

  const renderItem = useCallback<ListRenderItem<UploadTask>>(
    ({ item, index }) => <Row task={item} first={index === 0} onRetry={retry} onRemove={remove} />,
    [retry, remove],
  );

  return (
    <BottomSheet visible={visible} onClose={uploadsSheet.close}>
      <View className="px-5 pt-1">
        <View className="flex-row items-baseline justify-between gap-3">
          <Text className="flex-1 text-foreground text-[18px] leading-[26px] font-bold" accessibilityRole="header" accessibilityLiveRegion="polite">
            {title}
          </Text>
          {running.length > 1 ? (
            // A batch could only be stopped one file at a time.
            <Pressable
              onPress={() =>
                Alert.alert('Stop these uploads?', 'Files already uploaded stay in the album.', [
                  { text: 'Keep going', style: 'cancel' },
                  { text: 'Stop all', style: 'destructive', onPress: () => running.forEach((task) => remove(task.id)) },
                ])
              }
              accessibilityRole="button"
              hitSlop={10}
              className="active:opacity-60"
            >
              <Text className="text-destructive text-[14px] font-semibold">Stop all</Text>
            </Pressable>
          ) : failed.length > 1 ? (
            <Pressable
              onPress={() => failed.forEach((task) => retry(task.id))}
              accessibilityRole="button"
              hitSlop={10}
              className="active:opacity-60"
            >
              <Text className="text-primary text-[14px] font-semibold">Retry all</Text>
            </Pressable>
          ) : done > 0 && !active ? (
            <Pressable onPress={clearFinished} accessibilityRole="button" hitSlop={10} className="active:opacity-60">
              <Text className="text-muted-foreground text-[14px] font-semibold">Clear</Text>
            </Pressable>
          ) : null}
        </View>

        {tasks.length > 0 && (
          <>
            <View className="mt-2.5 mb-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
              <View
                className={`h-full rounded-full ${active ? 'bg-action' : failed.length > 0 ? 'bg-destructive' : 'bg-success'}`}
                style={{ width: `${Math.round(Math.min(active ? overall : 1, 1) * 100)}%` }}
              />
            </View>
            <Text className="text-muted-foreground text-[13px] leading-[18px]">
              {active
                ? `${formatBytes(sentBytes)} of ${formatBytes(totalBytes)}. It carries on if you leave.`
                : failed.length > 0
                  ? 'The rest are in their albums.'
                  : 'They are in their albums now.'}
            </Text>
          </>
        )}
      </View>

      <FlatList
        data={sorted}
        keyExtractor={keyOf}
        renderItem={renderItem}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={5}
        style={{ maxHeight: Math.round(height * 0.5) }}
        alwaysBounceVertical={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 12 }}
        ListEmptyComponent={
          <Text className="text-muted-foreground text-[14px] leading-5 py-6">
            Files you add to an album show here while they upload.
          </Text>
        }
      />
    </BottomSheet>
  );
}

function keyOf(task: UploadTask): string {
  return task.id;
}

/**
 * One file. Redrawn only when its own task changes: the queue keeps the same
 * object for every file that did not move, and the handlers never change.
 */
const Row = memo(function Row({
  task,
  first,
  onRetry,
  onRemove,
}: {
  task: UploadTask;
  first: boolean;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const failed = task.status === 'failed';
  const going = task.status === 'uploading';
  return (
    <View className={`min-h-[60px] flex-row items-center gap-3 py-2 ${first ? '' : 'border-t border-border/40'}`}>
      <View className="w-11 h-11 rounded-xl overflow-hidden bg-muted">
        <UploadThumb task={task} glyph={18} />
        {failed ? <View className="absolute inset-0 bg-destructive/25" /> : null}
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>
          {task.name}
        </Text>
        <Text
          className={`text-[13px] leading-[18px] ${failed ? 'text-destructive' : 'text-muted-foreground'}`}
          numberOfLines={failed ? 3 : 1}
        >
          {failed
            ? task.error || 'This file did not upload.'
            : task.status === 'done'
              ? 'Uploaded'
              : task.status === 'queued'
                ? `Waiting · ${formatBytes(task.sizeBytes)}`
                : formatBytes(task.sizeBytes)}
        </Text>
        {going ? (
          <View className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
            <View className="h-full rounded-full bg-action" style={{ width: `${Math.round(Math.min(task.progress, 1) * 100)}%` }} />
          </View>
        ) : null}
      </View>

      {task.status === 'done' ? (
        <CheckIcon size={18} className="text-success" strokeWidth={2.6} />
      ) : (
        <View className="flex-row items-center">
          {going ? (
            <Text className="text-secondary-foreground text-[13px] font-semibold" style={{ fontVariant: ['tabular-nums'] }}>
              {Math.round(task.progress * 100)}%
            </Text>
          ) : null}
          {failed ? (
            <Pressable
              onPress={() => onRetry(task.id)}
              accessibilityRole="button"
              accessibilityLabel={`Try ${task.name} again`}
              className="h-9 px-3 rounded-full bg-muted flex-row items-center gap-1.5 active:opacity-70"
            >
              <RotateCwIcon size={13} className="text-foreground" />
              <Text className="text-foreground text-[13px] font-semibold">Retry</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => onRemove(task.id)}
            accessibilityRole="button"
            accessibilityLabel={going ? `Stop uploading ${task.name}` : `Remove ${task.name} from uploads`}
            hitSlop={6}
            className="w-9 h-9 items-center justify-center active:opacity-60"
          >
            <XIcon size={16} className="text-muted-foreground" />
          </Pressable>
        </View>
      )}
    </View>
  );
});
