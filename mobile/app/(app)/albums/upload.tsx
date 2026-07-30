import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeftIcon,
  ImageIcon,
  CheckCircleIcon,
  CloudIcon,
  AlertCircleIcon,
  XIcon,
  PauseIcon,
  PlayIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ImageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CloudIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(AlertCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(XIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PauseIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlayIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

interface UploadItem {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio';
  size: string;
  progress: number;
  status: 'uploading' | 'done' | 'failed' | 'queued';
  speed?: string;
}

const SIMULATED_UPLOADS: UploadItem[] = [
  { id: '1', name: 'IMG_4821.CR3', type: 'image', size: '32.4 MB', progress: 0, status: 'queued' },
  { id: '2', name: 'IMG_4822.CR3', type: 'image', size: '28.1 MB', progress: 0, status: 'queued' },
  { id: '3', name: 'IMG_4823.CR3', type: 'image', size: '35.2 MB', progress: 0, status: 'queued' },
  { id: '4', name: 'DSC_0018.ARW', type: 'image', size: '41.7 MB', progress: 0, status: 'queued' },
  { id: '5', name: 'BTS_Reel_01.mp4', type: 'video', size: '156.3 MB', progress: 0, status: 'queued' },
  { id: '6', name: 'Voice_Memo_032.m4a', type: 'audio', size: '4.8 MB', progress: 0, status: 'queued' },
];

function ProgressBar({ progress }: { progress: number }) {
  return (
    <View className="h-1.5 bg-muted rounded-full overflow-hidden">
      <View
        className="h-full rounded-full"
        style={{
          width: `${progress}%`,
          backgroundColor: progress === 100 ? '#6B8E4E' : '#B66A40',
        }}
      />
    </View>
  );
}

export default function UploadProgressScreen() {
  const [items, setItems] = useState<UploadItem[]>(SIMULATED_UPLOADS);
  const [paused, setPaused] = useState(false);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);

  useEffect(() => {
    if (paused) {
      intervalsRef.current.forEach(clearInterval);
      intervalsRef.current = [];
      return;
    }

    intervalsRef.current = items.map((item, i) => {
      if (item.status === 'done' || item.status === 'failed') return null as any;
      return setInterval(() => {
        setItems((prev) =>
          prev.map((it, idx) => {
            if (idx !== i) return it;
            if (it.status === 'done' || it.status === 'failed') return it;

            const increment = it.type === 'video' ? 2.5 : it.type === 'audio' ? 12 : 5;
            const newProgress = Math.min(it.progress + increment, 100);
            const newStatus = newProgress >= 100 ? 'done' : 'uploading';
            const speed =
              newStatus === 'uploading'
                ? `${(Math.random() * 3 + 1.5).toFixed(1)} MB/s`
                : undefined;

            return {
              ...it,
              progress: Math.round(newProgress),
              status: newStatus,
              speed,
            };
          })
        );
      }, 600);
    });

    return () => {
      intervalsRef.current.forEach(clearInterval);
    };
  }, [paused]);

  const totalProgress = Math.round(
    items.reduce((s, it) => s + it.progress, 0) / items.length
  );
  const doneCount = items.filter((i) => i.status === 'done').length;
  const uploadingCount = items.filter((i) => i.status === 'uploading').length;

  const allDone = doneCount === items.length;
  const totalSize = items.reduce((s, i) => {
    const num = parseFloat(i.size);
    return s + num;
  }, 0);
  const uploadedSize = items.reduce((s, i) => s + (parseFloat(i.size) * i.progress) / 100, 0);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{
              shadowColor: '#000',
              shadowOpacity: 0.04,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }}
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <View>
            <Text className="text-foreground text-[22px] font-bold tracking-tight">Upload</Text>
            <Text className="text-muted-foreground text-sm mt-0.5">
              {allDone
                ? 'All uploads complete'
                : `${doneCount} of ${items.length} done · ${uploadingCount} uploading`}
            </Text>
          </View>
        </View>

        {/* ── Overall Progress Card ── */}
        <View
          className="mx-5 mt-3 bg-card rounded-2xl p-5"
          style={{
            shadowColor: '#000',
            shadowOpacity: 0.05,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
          }}
        >
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-3">
              <View
                className={`w-11 h-11 rounded-2xl items-center justify-center ${
                  allDone ? 'bg-[#6B8E4E18]' : 'bg-primary/10'
                }`}
              >
                {allDone ? (
                  <CheckCircleIcon size={22} style={{ color: '#6B8E4E' }} />
                ) : (
                  <CloudIcon size={22} className="text-primary" />
                )}
              </View>
              <View>
                <Text className="text-foreground text-base font-bold">
                  {allDone ? 'Upload Complete' : 'Uploading...'}
                </Text>
                <Text className="text-muted-foreground text-xs mt-0.5">
                  {uploadedSize.toFixed(1)} MB of {totalSize.toFixed(0)} MB
                </Text>
              </View>
            </View>
            <Text className="text-foreground text-2xl font-extrabold">{totalProgress}%</Text>
          </View>
          <ProgressBar progress={totalProgress} />

          <View className="flex-row items-center gap-3 mt-4">
            <Pressable
              onPress={() => setPaused(!paused)}
              className={`flex-1 rounded-xl py-2.5 flex-row items-center justify-center gap-2 active:scale-[0.96] ${
                allDone ? 'bg-muted' : 'bg-muted'
              }`}
              disabled={allDone}
            >
              {paused ? (
                <PlayIcon size={15} className="text-primary" />
              ) : (
                <PauseIcon size={15} className="text-primary" />
              )}
              <Text className="text-primary text-sm font-bold">
                {paused ? 'Resume' : 'Pause'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.back()}
              className={`flex-1 rounded-xl py-2.5 items-center active:scale-[0.96] ${
                allDone ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <Text
                className={`text-sm font-bold ${allDone ? 'text-white' : 'text-muted-foreground'}`}
              >
                {allDone ? 'Done' : 'Minimize'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ── File List ── */}
        <View className="px-5 mt-5">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-3 ml-1">
            Files
          </Text>
          <View
            className="bg-card rounded-2xl overflow-hidden"
            style={{
              shadowColor: '#000',
              shadowOpacity: 0.04,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 3 },
              elevation: 3,
            }}
          >
            {items.map((item, i) => (
              <View
                key={item.id}
                className="px-4 py-3 gap-2"
                style={
                  i < items.length - 1
                    ? { borderBottomWidth: 1, borderBottomColor: '#F0E8E2' }
                    : undefined
                }
              >
                <View className="flex-row items-center gap-3">
                  {/* Icon */}
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor:
                        item.status === 'done'
                          ? '#6B8E4E18'
                          : item.status === 'failed'
                          ? '#C76B4A18'
                          : '#B66A4018',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {item.status === 'done' ? (
                      <CheckCircleIcon size={16} style={{ color: '#6B8E4E' }} />
                    ) : item.status === 'failed' ? (
                      <AlertCircleIcon size={16} style={{ color: '#C76B4A' }} />
                    ) : (
                      <ImageIcon size={16} className="text-primary" />
                    )}
                  </View>

                  {/* Info */}
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View className="flex-row items-center gap-2 mt-0.5">
                      <Text className="text-muted-foreground text-[11px] font-medium">
                        {item.size}
                      </Text>
                      {item.speed && item.status === 'uploading' && (
                        <>
                          <Text className="text-muted-foreground text-[10px]">·</Text>
                          <Text className="text-muted-foreground text-[11px] font-medium">
                            {item.speed}
                          </Text>
                        </>
                      )}
                      {item.status === 'done' && (
                        <>
                          <Text className="text-muted-foreground text-[10px]">·</Text>
                          <Text className="text-[#6B8E4E] text-[11px] font-semibold">Done</Text>
                        </>
                      )}
                    </View>
                  </View>

                  {/* Progress / Cancel */}
                  {item.status === 'uploading' || item.status === 'queued' ? (
                    <Text className="text-foreground text-sm font-bold">{item.progress}%</Text>
                  ) : item.status === 'failed' ? (
                    <Pressable className="w-7 h-7 rounded-full bg-muted items-center justify-center active:scale-[0.90]">
                      <XIcon size={11} className="text-muted-foreground" />
                    </Pressable>
                  ) : null}
                </View>

                {/* Mini progress */}
                {item.status !== 'done' && item.status !== 'failed' && (
                  <View className="ml-[48px]">
                    <ProgressBar progress={item.progress} />
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
