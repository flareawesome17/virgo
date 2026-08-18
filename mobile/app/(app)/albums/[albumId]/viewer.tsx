import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  Share,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import {
  DownloadSimple,
  Info,
  ShareNetwork,
  Trash,
  X,
} from "phosphor-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useAlbumFiles } from "@/src/hooks";
import { formatBytes, storageApi } from "@/src/api";

const spring = { damping: 22, stiffness: 220 };

export default function PhotoViewerScreen() {
  const { albumId, index: routeIndex } = useLocalSearchParams<{
    albumId: string;
    index?: string;
  }>();
  const { width, height } = useWindowDimensions();
  const queryClient = useQueryClient();
  const filesQuery = useAlbumFiles(albumId);
  const photos = filesQuery.images;
  const [currentIndex, setCurrentIndex] = useState(
    Math.max(0, Number(routeIndex) || 0),
  );
  const [chrome, setChrome] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [saving, setSaving] = useState(false);
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const photo = photos[currentIndex] ?? photos[0];

  const reset = () => {
    scale.value = withSpring(1, spring);
    translateX.value = withSpring(0, spring);
    translateY.value = withSpring(0, spring);
  };
  const move = (direction: number) => {
    const next = Math.max(
      0,
      Math.min(currentIndex + direction, photos.length - 1),
    );
    if (next === currentIndex) {
      translateX.value = withSpring(0, spring);
      return;
    }
    setCurrentIndex(next);
    setShowInfo(false);
    reset();
    if (
      next >= photos.length - 3 &&
      filesQuery.hasNextPage &&
      !filesQuery.isFetchingNextPage
    )
      filesQuery.fetchNextPage();
  };

  useEffect(() => {
    if (currentIndex >= photos.length && photos.length)
      setCurrentIndex(photos.length - 1);
  }, [currentIndex, photos.length]);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((event) => {
      scale.value = Math.max(1, Math.min(4, startScale.value * event.scale));
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        scale.value = withSpring(1, spring);
        translateX.value = withSpring(0, spring);
        translateY.value = withSpring(0, spring);
      }
    });
  const pan = Gesture.Pan()
    .minDistance(4)
    .onStart(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      if (scale.value > 1.01) {
        const maxX = width * (scale.value - 1) * 0.5;
        const maxY = height * (scale.value - 1) * 0.35;
        translateX.value = Math.max(
          -maxX,
          Math.min(maxX, startX.value + event.translationX),
        );
        translateY.value = Math.max(
          -maxY,
          Math.min(maxY, startY.value + event.translationY),
        );
      } else {
        translateX.value = event.translationX;
      }
    })
    .onEnd((event) => {
      if (scale.value <= 1.01) {
        if (
          Math.abs(event.translationX) > width * 0.2 ||
          Math.abs(event.velocityX) > 700
        )
          runOnJS(move)(event.translationX < 0 ? 1 : -1);
        else translateX.value = withSpring(0, spring);
      }
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.01) {
        scale.value = withSpring(1, spring);
        translateX.value = withSpring(0, spring);
        translateY.value = withSpring(0, spring);
      } else scale.value = withSpring(2.25, spring);
    });
  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => runOnJS(setChrome)(!chrome));
  const gesture = Gesture.Simultaneous(
    pan,
    pinch,
    Gesture.Exclusive(doubleTap, singleTap),
  );
  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ] as const,
  }));

  if (!photo)
    return (
      <View className="flex-1 bg-[#141210] items-center justify-center px-8">
        <Text className="text-white text-lg font-semibold">No photos yet</Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-6 bg-white/10 rounded-full px-6 py-3"
        >
          <Text className="text-white font-semibold">Go back</Text>
        </Pressable>
      </View>
    );

  const sharePhoto = async () => {
    if (!photo.url) return;
    try {
      await Share.share(
        Platform.OS === "ios"
          ? { url: photo.url, message: photo.originalName }
          : { message: `${photo.originalName} — ${photo.url}` },
      );
    } catch {}
  };
  const savePhoto = async () => {
    const source = photo.downloadUrl ?? photo.url;
    if (!source || saving || !photo.capabilities.download) return;
    setSaving(true);
    try {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission needed", "Allow photo access to save images.");
        return;
      }
      const safeName = photo.originalName.replace(/[^a-z0-9._-]/gi, "_");
      const target = `${FileSystem.cacheDirectory}${safeName}`;
      const result = await FileSystem.downloadAsync(source, target);
      if (result.status < 200 || result.status >= 300)
        throw new Error("The image could not be downloaded.");
      await MediaLibrary.saveToLibraryAsync(result.uri);
      await FileSystem.deleteAsync(result.uri, { idempotent: true });
      Alert.alert("Saved", "The photo is in your library.");
    } catch (error) {
      Alert.alert(
        "Could not save",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };
  const deletePhoto = () =>
    Alert.alert(
      "Remove photo?",
      "This permanently removes the original and its thumbnail.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await storageApi.remove(photo.key);
              await queryClient.invalidateQueries({
                queryKey: ["storage", "files", albumId],
              });
              if (photos.length <= 1) router.back();
              else
                setCurrentIndex((value) =>
                  Math.max(0, value - (value === photos.length - 1 ? 1 : 0)),
                );
            } catch (error) {
              Alert.alert(
                "Could not remove photo",
                error instanceof Error ? error.message : "Please try again.",
              );
            }
          },
        },
      ],
    );

  return (
    <View className="flex-1 bg-[#141210]">
      <GestureDetector gesture={gesture}>
        <Animated.View className="flex-1 items-center justify-center overflow-hidden">
          <Animated.View style={[{ width, height: height * 0.78 }, imageStyle]}>
            <Image
              source={{ uri: photo.url ?? undefined }}
              style={{ width: "100%", height: "100%" }}
              contentFit="contain"
              transition={180}
            />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
      {chrome && (
        <>
          <SafeAreaView
            edges={["top"]}
            className="absolute top-0 left-0 right-0"
          >
            <View className="px-4 pt-2 flex-row items-center gap-3">
              <Pressable
                onPress={() => router.back()}
                className="w-11 h-11 rounded-full bg-black/50 items-center justify-center"
              >
                <X size={20} color="#fff" weight="light" />
              </Pressable>
              <View className="flex-1 min-w-0">
                <Text
                  className="text-white text-sm font-semibold"
                  numberOfLines={1}
                >
                  {photo.originalName}
                </Text>
                <Text className="text-white/45 text-[10px] font-mono mt-0.5">
                  {currentIndex + 1} / {filesQuery.counts.image}
                </Text>
              </View>
            </View>
          </SafeAreaView>
          <SafeAreaView
            edges={["bottom"]}
            className="absolute bottom-0 left-0 right-0"
          >
            <View className="px-4 pb-4">
              <FlatList
                horizontal
                data={photos.slice(
                  Math.max(0, currentIndex - 4),
                  currentIndex + 5,
                )}
                keyExtractor={(item) => item.key}
                contentContainerStyle={{
                  gap: 7,
                  justifyContent: "center",
                  flexGrow: 1,
                }}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => {
                  const absolute = photos.indexOf(item);
                  return (
                    <Pressable
                      onPress={() => {
                        setCurrentIndex(absolute);
                        reset();
                      }}
                      className={`w-11 h-11 rounded-[10px] overflow-hidden ${absolute === currentIndex ? "border-2 border-[#C17745]" : "opacity-50"}`}
                    >
                      <Image
                        source={{
                          uri: item.thumbnailUrl ?? item.url ?? undefined,
                        }}
                        style={{ width: "100%", height: "100%" }}
                        contentFit="cover"
                      />
                    </Pressable>
                  );
                }}
              />
              <View className="mt-3 bg-[#211D1A]/95 rounded-[22px] p-1.5">
                <View className="border border-white/10 rounded-[18px] px-4 py-3 flex-row items-center gap-3">
                  <Pressable
                    onPress={sharePhoto}
                    className="w-10 h-10 rounded-full bg-white/8 items-center justify-center"
                  >
                    <ShareNetwork size={18} color="#fff" weight="light" />
                  </Pressable>
                  {photo.capabilities.download && (
                    <Pressable
                      onPress={savePhoto}
                      disabled={saving}
                      className="w-10 h-10 rounded-full bg-white/8 items-center justify-center"
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <DownloadSimple size={18} color="#fff" weight="light" />
                      )}
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => setShowInfo((value) => !value)}
                    className={`w-10 h-10 rounded-full items-center justify-center ${showInfo ? "bg-white/15" : "bg-white/8"}`}
                  >
                    <Info size={18} color="#fff" weight="light" />
                  </Pressable>
                  {photo.capabilities.delete && (
                    <Pressable
                      onPress={deletePhoto}
                      className="w-10 h-10 rounded-full items-center justify-center ml-auto"
                    >
                      <Trash size={18} color="#EFA79E" weight="light" />
                    </Pressable>
                  )}
                </View>
                {showInfo && (
                  <View className="px-4 py-4">
                    <InfoRow
                      label="Date"
                      value={new Date(photo.createdAt).toLocaleDateString()}
                    />
                    <InfoRow
                      label="Size"
                      value={formatBytes(photo.sizeBytes)}
                    />
                    <InfoRow
                      label="Dimensions"
                      value={
                        photo.width && photo.height
                          ? `${photo.width} × ${photo.height}`
                          : "Not available"
                      }
                    />
                  </View>
                )}
              </View>
            </View>
          </SafeAreaView>
        </>
      )}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4 py-1">
      <Text className="text-white/40 text-xs">{label}</Text>
      <Text className="text-white text-xs font-medium">{value}</Text>
    </View>
  );
}
