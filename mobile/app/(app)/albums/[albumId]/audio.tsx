import { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowsClockwise,
  MusicNotesSimple,
  Pause,
  Play,
  Shuffle,
  SkipBack,
  SkipForward,
  UploadSimple,
} from "phosphor-react-native";
import { useAlbum, useAlbumFiles } from "@/src/hooks";
import { formatBytes, type StoredFile } from "@/src/api";
import { useAlbumAudio } from "@/src/providers/AlbumAudioProvider";

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function AudioScreen() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const [barWidth, setBarWidth] = useState(0);
  const { data: album, refetch: refetchAlbum } = useAlbum(albumId);
  const filesQuery = useAlbumFiles(albumId);
  const files = filesQuery.audio;
  const audio = useAlbumAudio();
  const activeKey =
    audio.current?.albumId === albumId ? audio.current.key : null;
  const progress =
    audio.duration > 0 ? Math.min(audio.position / audio.duration, 1) : 0;
  const select = (file: StoredFile, index: number) => {
    if (activeKey === file.key) audio.toggle();
    else
      audio.playQueue(
        files,
        index,
        album?.name ?? "Virgo album",
        (album as { cover_url?: string | null } | undefined)?.cover_url,
      );
  };
  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchAlbum(), filesQuery.refetch()]);
    setRefreshing(false);
  };
  const rates = [0.5, 1, 1.25, 1.5, 2];
  const nextRate = () =>
    audio.setRate(rates[(rates.indexOf(audio.rate) + 1) % rates.length]);

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-[#141210]">
      <FlatList
        data={files}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: activeKey ? 250 : 80,
        }}
        onEndReached={() =>
          filesQuery.hasNextPage &&
          !filesQuery.isFetchingNextPage &&
          filesQuery.fetchNextPage()
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor="#C17745"
          />
        }
        ListHeaderComponent={
          <View className="pt-3 pb-7">
            <View className="flex-row items-center gap-3">
              <Pressable
                onPress={() => router.back()}
                className="w-11 h-11 rounded-full bg-white/10 items-center justify-center"
              >
                <ArrowLeft size={19} color="#fff" weight="light" />
              </Pressable>
              <View className="flex-1 min-w-0">
                <Text
                  className="text-white text-2xl font-semibold tracking-[-1px]"
                  numberOfLines={1}
                >
                  {album?.name || "Audio"}
                </Text>
                <Text className="text-white/40 text-xs mt-1">
                  {filesQuery.counts.audio} track
                  {filesQuery.counts.audio === 1 ? "" : "s"}
                </Text>
              </View>
            </View>
            <Text className="text-[#D89566] text-[10px] uppercase tracking-[2px] font-mono mt-8">
              Listening room
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const active = activeKey === item.key;
          return (
            <Pressable
              onPress={() => select(item, index)}
              className={`flex-row items-center gap-4 py-4 border-t border-white/[0.07] active:scale-[.99] ${index === 0 ? "border-t-0" : ""}`}
            >
              <View
                className={`w-11 h-11 rounded-full items-center justify-center ${active ? "bg-[#C17745]" : "bg-white/[0.07]"}`}
              >
                {active && audio.playing ? (
                  <Pause size={17} color="#fff" weight="fill" />
                ) : (
                  <Play
                    size={17}
                    color={active ? "#fff" : "rgba(255,255,255,.55)"}
                    weight="fill"
                  />
                )}
              </View>
              <View className="flex-1 min-w-0">
                <Text
                  className={`text-sm font-semibold ${active ? "text-[#D89566]" : "text-white"}`}
                  numberOfLines={1}
                >
                  {item.mediaTitle || item.originalName}
                </Text>
                <Text className="text-white/35 text-xs mt-1" numberOfLines={1}>
                  {item.mediaArtist ||
                    item.contentType?.split("/")[1]?.toUpperCase() ||
                    "AUDIO"}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-white/40 text-[10px] font-mono">
                  {item.durationMs
                    ? clock(item.durationMs / 1000)
                    : item.processingStatus === "pending"
                      ? "INDEXING"
                      : "--:--"}
                </Text>
                <Text className="text-white/20 text-[9px] mt-1">
                  {formatBytes(item.sizeBytes)}
                </Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !filesQuery.isLoading ? (
            <View className="items-center px-8 pt-24">
              <MusicNotesSimple
                size={42}
                color="rgba(255,255,255,.25)"
                weight="light"
              />
              <Text className="text-white text-lg font-semibold mt-5">
                No audio yet
              </Text>
              <Text className="text-white/40 text-sm text-center mt-2">
                Upload a recording or finished track to begin a listening queue.
              </Text>
              <Pressable
                onPress={() =>
                  router.push(`/albums/upload?albumId=${albumId}&kind=audio`)
                }
                className="mt-7 bg-[#C17745] rounded-full px-6 py-3 flex-row items-center gap-2"
              >
                <UploadSimple size={17} color="#fff" weight="light" />
                <Text className="text-white font-semibold">Upload audio</Text>
              </Pressable>
            </View>
          ) : null
        }
      />
      {activeKey && audio.current && (
        <SafeAreaView
          edges={["bottom"]}
          className="absolute bottom-0 left-0 right-0"
        >
          <View className="mx-3 mb-3 bg-[#1B1816] rounded-[26px] p-1.5">
            <View className="border border-white/10 rounded-[21px] px-4 pt-4 pb-3">
              <View className="flex-row items-center gap-3">
                <View className="w-11 h-11 rounded-[14px] bg-[#C17745]/20 items-center justify-center">
                  <MusicNotesSimple size={20} color="#D89566" weight="light" />
                </View>
                <View className="flex-1 min-w-0">
                  <Text
                    className="text-white text-sm font-semibold"
                    numberOfLines={1}
                  >
                    {audio.current.mediaTitle || audio.current.originalName}
                  </Text>
                  <Text
                    className="text-white/35 text-xs mt-0.5"
                    numberOfLines={1}
                  >
                    {audio.current.mediaArtist || album?.name}
                  </Text>
                </View>
                <Text className="text-white/35 text-[10px] font-mono">
                  {clock(audio.position)} / {clock(audio.duration)}
                </Text>
              </View>
              <Pressable
                onLayout={(event) =>
                  setBarWidth(event.nativeEvent.layout.width)
                }
                onPress={(event) =>
                  audio.seekTo(
                    (event.nativeEvent.locationX / Math.max(barWidth, 1)) *
                      audio.duration,
                  )
                }
                className="h-7 justify-center mt-1"
              >
                <View className="h-1 rounded-full bg-white/12 overflow-hidden">
                  <View
                    className="h-full bg-[#D89566] rounded-full"
                    style={{ width: `${progress * 100}%` }}
                  />
                </View>
              </Pressable>
              <View className="flex-row items-center justify-between mt-2 px-1">
                <Pressable
                  onPress={() => audio.setShuffle(!audio.shuffle)}
                  className={`w-9 h-9 items-center justify-center ${audio.shuffle ? "opacity-100" : "opacity-35"}`}
                >
                  <Shuffle size={17} color="#fff" weight="light" />
                </Pressable>
                <Pressable
                  onPress={() => audio.seekBy(-15)}
                  className="w-9 h-9 items-center justify-center"
                >
                  <ArrowCounterClockwise
                    size={18}
                    color="rgba(255,255,255,.65)"
                    weight="light"
                  />
                </Pressable>
                <Pressable
                  onPress={audio.previous}
                  className="w-9 h-9 items-center justify-center"
                >
                  <SkipBack size={20} color="#fff" weight="light" />
                </Pressable>
                <Pressable
                  onPress={audio.toggle}
                  className="w-14 h-14 rounded-full bg-[#C17745] items-center justify-center active:scale-[.94]"
                >
                  {audio.playing ? (
                    <Pause size={23} color="#fff" weight="fill" />
                  ) : (
                    <Play size={24} color="#fff" weight="fill" />
                  )}
                </Pressable>
                <Pressable
                  onPress={audio.next}
                  className="w-9 h-9 items-center justify-center"
                >
                  <SkipForward size={20} color="#fff" weight="light" />
                </Pressable>
                <Pressable
                  onPress={() => audio.seekBy(15)}
                  className="w-9 h-9 items-center justify-center"
                >
                  <ArrowsClockwise
                    size={18}
                    color="rgba(255,255,255,.65)"
                    weight="light"
                  />
                </Pressable>
                <Pressable
                  onPress={audio.cycleRepeat}
                  className={`w-9 h-9 items-center justify-center ${audio.repeat !== "off" ? "opacity-100" : "opacity-35"}`}
                >
                  <ArrowsClockwise size={17} color="#fff" weight="light" />
                </Pressable>
                <Pressable
                  onPress={nextRate}
                  className="absolute right-0 -top-11 bg-white/[0.07] rounded-full px-2 py-1"
                >
                  <Text className="text-white/60 text-[9px] font-mono">
                    {audio.rate}×
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </SafeAreaView>
      )}
    </SafeAreaView>
  );
}
