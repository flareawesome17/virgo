import { useState } from "react";
import {
  FlatList,
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
  ArrowLeft,
  ImageSquare,
  SquaresFour,
  UploadSimple,
} from "phosphor-react-native";
import { useAlbum, useAlbumFiles } from "@/src/hooks";

const GAP = 8;

function Skeleton({ width }: { width: number }) {
  const item = (width - 42) / 2;
  return (
    <View className="flex-row flex-wrap px-4 gap-2">
      {Array.from({ length: 10 }).map((_, index) => (
        <View
          key={index}
          className="rounded-[18px] bg-white/[0.06]"
          style={{ width: item, height: index % 3 === 0 ? item * 1.25 : item }}
        />
      ))}
    </View>
  );
}

export default function GalleryScreen() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const { width } = useWindowDimensions();
  const [refreshing, setRefreshing] = useState(false);
  const { data: album, refetch: refetchAlbum } = useAlbum(albumId);
  // Reuse the unfiltered request already populated by the album overview.
  const filesQuery = useAlbumFiles(albumId);
  const photos = filesQuery.images;
  const itemWidth = (width - 32 - GAP) / 2;
  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchAlbum(), filesQuery.refetch()]);
    setRefreshing(false);
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-[#141210]">
      <View className="px-4 pt-3 pb-5 flex-row items-center gap-3">
        <Pressable
          onPress={() => router.back()}
          className="w-11 h-11 rounded-full bg-white/10 items-center justify-center active:scale-[.94]"
        >
          <ArrowLeft size={19} color="#fff" weight="light" />
        </Pressable>
        <View className="flex-1 min-w-0">
          <Text
            className="text-white text-2xl font-semibold tracking-[-1px]"
            numberOfLines={1}
          >
            {album?.name || "Photos"}
          </Text>
          <Text className="text-white/40 text-xs mt-1">
            {filesQuery.counts.image} photo
            {filesQuery.counts.image === 1 ? "" : "s"}
          </Text>
        </View>
        <View className="w-11 h-11 rounded-full border border-white/10 items-center justify-center">
          <SquaresFour size={18} color="rgba(255,255,255,.55)" weight="light" />
        </View>
      </View>
      <Text className="text-[#D89566] text-[10px] uppercase tracking-[2px] font-mono px-4 pb-4">
        Contact sheet
      </Text>
      {filesQuery.isLoading && photos.length === 0 ? (
        <Skeleton width={width} />
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(item) => item.key}
          numColumns={2}
          columnWrapperStyle={{ gap: GAP, alignItems: "flex-start" }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80 }}
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
          renderItem={({ item, index }) => {
            const ratio =
              item.width && item.height ? item.width / item.height : 1;
            const height = Math.max(
              itemWidth * 0.72,
              Math.min(itemWidth * 1.35, itemWidth / ratio),
            );
            return (
              <Pressable
                onPress={() =>
                  router.push(`/albums/${albumId}/viewer?index=${index}`)
                }
                className="mb-2 active:scale-[.985]"
                style={{ width: itemWidth, height }}
              >
                <View className="flex-1 overflow-hidden rounded-[18px] bg-white/[0.06]">
                  <Image
                    source={{ uri: item.thumbnailUrl ?? item.url ?? undefined }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                    transition={250}
                  />
                  {item.processingStatus === "pending" && (
                    <View className="absolute top-2 left-2 bg-black/60 rounded-full px-2 py-1">
                      <Text className="text-white/70 text-[8px] font-mono tracking-wider">
                        INDEXING
                      </Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View className="items-center px-8 pt-24">
              <ImageSquare
                size={42}
                color="rgba(255,255,255,.25)"
                weight="light"
              />
              <Text className="text-white text-lg font-semibold mt-5">
                The contact sheet is empty
              </Text>
              <Text className="text-white/40 text-sm text-center mt-2">
                Upload photographs to begin arranging this album.
              </Text>
              <Pressable
                onPress={() =>
                  router.push(`/albums/upload?albumId=${albumId}&kind=media`)
                }
                className="mt-7 bg-[#C17745] rounded-full px-6 py-3 flex-row items-center gap-2"
              >
                <UploadSimple size={17} color="#fff" weight="light" />
                <Text className="text-white font-semibold">Upload photos</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
