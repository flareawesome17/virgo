import { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import {
  useVideoPlayer,
  VideoView,
  type VideoView as VideoViewType,
} from "expo-video";
import {
  ArrowLeft,
  ArrowsOut,
  DownloadSimple,
  FilmSlate,
  Pause,
  PictureInPicture,
  Play,
  SpeakerHigh,
  SpeakerSlash,
  UploadSimple,
  X,
} from "phosphor-react-native";
import { useAlbum, useAlbumFiles } from "@/src/hooks";
import { formatBytes, type StoredFile } from "@/src/api";

const ACCENT = "#C17745";

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const value = Math.floor(seconds);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function VideoPlayer({
  file,
  onClose,
}: {
  file: StoredFile;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const viewRef = useRef<VideoViewType>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(
    file.durationMs ? file.durationMs / 1000 : 0,
  );
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [failed, setFailed] = useState(false);
  const [barWidth, setBarWidth] = useState(0);
  const player = useVideoPlayer(file.url ?? "", (instance) => {
    instance.timeUpdateEventInterval = 0.25;
    instance.play();
  });

  const reveal = () => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (playing)
      hideTimer.current = setTimeout(() => setShowControls(false), 2500);
  };

  useEffect(() => {
    const playingSub = player.addListener("playingChange", ({ isPlaying }) => {
      setPlaying(isPlaying);
      if (!isPlaying) setShowControls(true);
    });
    const timeSub = player.addListener("timeUpdate", ({ currentTime }) => {
      setPosition(currentTime);
      setDuration(player.duration || duration);
    });
    const statusSub = player.addListener("statusChange", ({ status }) => {
      if (status === "error") setFailed(true);
    });
    reveal();
    return () => {
      playingSub.remove();
      timeSub.remove();
      statusSub.remove();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      player.pause();
    };
    // player is stable for this mounted viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  const progress = duration > 0 ? Math.min(position / duration, 1) : 0;
  if (failed) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        className="flex-1 bg-[#141210] items-center justify-center px-8"
      >
        <FilmSlate size={44} color="rgba(255,255,255,.3)" weight="light" />
        <Text className="text-white text-lg font-semibold text-center mt-5">
          This video cannot play on this device
        </Text>
        <Text className="text-white/45 text-sm text-center mt-2">
          The original codec may only be supported on the device that recorded
          it.
        </Text>
        {file.capabilities.download && file.downloadUrl && (
          <Pressable
            onPress={() =>
              Alert.alert("Download original", file.downloadUrl ?? "")
            }
            className="mt-7 bg-[#C17745] rounded-full px-6 py-3 flex-row items-center gap-2"
          >
            <DownloadSimple size={17} color="#fff" weight="light" />
            <Text className="text-white font-semibold">Download original</Text>
          </Pressable>
        )}
        <Pressable
          onPress={onClose}
          className="absolute top-12 left-4 w-11 h-11 rounded-full bg-white/10 items-center justify-center"
        >
          <X size={20} color="#fff" weight="light" />
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-[#141210]">
      <Pressable
        className="flex-1 items-center justify-center"
        onPress={() => (showControls ? setShowControls(false) : reveal())}
      >
        <VideoView
          ref={viewRef}
          player={player}
          style={{ width, aspectRatio: 16 / 9, backgroundColor: "#141210" }}
          contentFit="contain"
          nativeControls={false}
          allowsFullscreen
          allowsPictureInPicture
        />
        {showControls && (
          <>
            <View className="absolute top-0 left-0 right-0 px-4 pt-2 flex-row items-center gap-3">
              <Pressable
                onPress={onClose}
                className="w-11 h-11 rounded-full bg-black/45 items-center justify-center"
              >
                <X size={20} color="#fff" weight="light" />
              </Pressable>
              <View className="flex-1 min-w-0">
                <Text
                  className="text-white text-sm font-semibold"
                  numberOfLines={1}
                >
                  {file.originalName}
                </Text>
                <Text className="text-white/45 text-[10px] font-mono mt-0.5">
                  {formatBytes(file.sizeBytes)}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => (playing ? player.pause() : player.play())}
              className="absolute w-16 h-16 rounded-full bg-black/55 items-center justify-center active:scale-[.94]"
            >
              {playing ? (
                <Pause size={27} color="#fff" weight="fill" />
              ) : (
                <Play size={28} color="#fff" weight="fill" />
              )}
            </Pressable>
            <View className="absolute left-3 right-3 bottom-3 bg-[#211D1A]/95 rounded-[22px] p-1.5">
              <View className="border border-white/10 rounded-[18px] px-4 py-3">
                <Pressable
                  onLayout={(event) =>
                    setBarWidth(event.nativeEvent.layout.width)
                  }
                  onPress={(event) => {
                    if (!duration) return;
                    const next =
                      Math.max(
                        0,
                        Math.min(
                          event.nativeEvent.locationX / Math.max(barWidth, 1),
                          1,
                        ),
                      ) * duration;
                    player.currentTime = next;
                    setPosition(next);
                  }}
                  className="h-6 justify-center"
                >
                  <View className="h-1 rounded-full bg-white/15 overflow-hidden">
                    <View
                      className="h-full bg-[#D89566] rounded-full"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </View>
                </Pressable>
                <View className="flex-row items-center gap-4 mt-2">
                  <Pressable
                    onPress={() => (playing ? player.pause() : player.play())}
                  >
                    {playing ? (
                      <Pause size={18} color="#fff" weight="fill" />
                    ) : (
                      <Play size={18} color="#fff" weight="fill" />
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      const next = !muted;
                      player.muted = next;
                      setMuted(next);
                    }}
                  >
                    {muted ? (
                      <SpeakerSlash
                        size={18}
                        color="rgba(255,255,255,.65)"
                        weight="light"
                      />
                    ) : (
                      <SpeakerHigh
                        size={18}
                        color="rgba(255,255,255,.65)"
                        weight="light"
                      />
                    )}
                  </Pressable>
                  <Text className="text-white/50 text-[10px] font-mono flex-1">
                    {clock(position)} / {clock(duration)}
                  </Text>
                  <Pressable
                    onPress={() => viewRef.current?.startPictureInPicture()}
                  >
                    <PictureInPicture
                      size={18}
                      color="rgba(255,255,255,.65)"
                      weight="light"
                    />
                  </Pressable>
                  <Pressable onPress={() => viewRef.current?.enterFullscreen()}>
                    <ArrowsOut
                      size={18}
                      color="rgba(255,255,255,.65)"
                      weight="light"
                    />
                  </Pressable>
                </View>
              </View>
            </View>
          </>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

export default function VideosScreen() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const [selected, setSelected] = useState<StoredFile | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { data: album, refetch: refetchAlbum } = useAlbum(albumId);
  const filesQuery = useAlbumFiles(albumId);
  const files = filesQuery.videos;
  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchAlbum(), filesQuery.refetch()]);
    setRefreshing(false);
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-[#141210]">
      <FlatList
        data={files}
        keyExtractor={(item) => item.key}
        numColumns={2}
        columnWrapperStyle={{ gap: 10 }}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 60 }}
        onEndReached={() =>
          filesQuery.hasNextPage &&
          !filesQuery.isFetchingNextPage &&
          filesQuery.fetchNextPage()
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={ACCENT}
          />
        }
        ListHeaderComponent={
          <View className="pt-3 pb-6">
            <View className="flex-row items-center gap-3">
              <Pressable
                onPress={() => router.back()}
                className="w-11 h-11 rounded-full bg-white/10 items-center justify-center"
              >
                <ArrowLeft size={19} color="#fff" weight="light" />
              </Pressable>
              <View className="flex-1">
                <Text
                  className="text-white text-2xl font-semibold tracking-[-1px]"
                  numberOfLines={1}
                >
                  {album?.name || "Films"}
                </Text>
                <Text className="text-white/40 text-xs mt-1">
                  {filesQuery.counts.video} film
                  {filesQuery.counts.video === 1 ? "" : "s"}
                </Text>
              </View>
            </View>
            <Text className="text-[#D89566] text-[10px] uppercase tracking-[2px] font-mono mt-8">
              Film room
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => setSelected(item)}
            className="flex-1 mb-10 active:scale-[.985]"
            style={{ marginRight: index % 2 === 0 ? 0 : undefined }}
          >
            <View className="aspect-video rounded-[18px] overflow-hidden bg-[#211D1A]">
              {item.posterUrl ? (
                <Image
                  source={{ uri: item.posterUrl }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                  transition={250}
                />
              ) : (
                <View className="flex-1 items-center justify-center">
                  <FilmSlate
                    size={28}
                    color="rgba(255,255,255,.22)"
                    weight="light"
                  />
                </View>
              )}
              <View className="absolute inset-0 items-center justify-center">
                <View className="w-10 h-10 rounded-full bg-black/55 items-center justify-center">
                  <Play size={15} color="#fff" weight="fill" />
                </View>
              </View>
            </View>
            <Text
              className="text-white text-sm font-semibold mt-3"
              numberOfLines={1}
            >
              {item.originalName}
            </Text>
            <Text className="text-white/35 text-[10px] font-mono mt-1">
              {item.durationMs
                ? clock(item.durationMs / 1000)
                : item.processingStatus === "pending"
                  ? "PREPARING"
                  : formatBytes(item.sizeBytes)}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          !filesQuery.isLoading ? (
            <View className="items-center px-8 pt-24">
              <FilmSlate
                size={42}
                color="rgba(255,255,255,.25)"
                weight="light"
              />
              <Text className="text-white text-lg font-semibold mt-5">
                No films yet
              </Text>
              <Text className="text-white/40 text-sm text-center mt-2">
                Upload a video and Virgo will prepare its poster and playback
                details.
              </Text>
              <Pressable
                onPress={() =>
                  router.push(`/albums/upload?albumId=${albumId}&kind=media`)
                }
                className="mt-7 bg-[#C17745] rounded-full px-6 py-3 flex-row items-center gap-2"
              >
                <UploadSimple size={17} color="#fff" weight="light" />
                <Text className="text-white font-semibold">Upload video</Text>
              </Pressable>
            </View>
          ) : null
        }
      />
      <Modal
        visible={!!selected}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setSelected(null)}
      >
        {selected && (
          <VideoPlayer file={selected} onClose={() => setSelected(null)} />
        )}
      </Modal>
    </SafeAreaView>
  );
}
