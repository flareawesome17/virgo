import { useMemo, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MusicIcon, PauseIcon, PlayIcon, XIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useAlbumAudio } from '@/src/providers/AlbumAudioProvider';

for (const Icon of [MusicIcon, PauseIcon, PlayIcon, XIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * Album audio, wherever you are.
 *
 * The Audio room had the only controls. Leave it and the recording carried
 * on with no way to pause it short of going back. This is the same strip at
 * the bottom of every other screen — pause, stop, or tap to go back to the
 * room — and the docked film's arrangement: it takes the home indicator's
 * inset and the screens above stop padding for it.
 */
export function AudioDock({ children }: { children: ReactNode }) {
  const audio = useAlbumAudio();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const albumId = audio.current?.albumId ?? null;
  const inRoom = !!albumId && pathname === `/albums/${albumId}/audio`;
  const showing = !!audio.current && !inRoom;

  // The same object until it changes: the provider updates on every tick of
  // playback, and a new inset object each time re-rendered every screen.
  const below = useMemo(() => (showing ? { ...insets, bottom: 0 } : insets), [showing, insets]);

  return (
    <View className="flex-1">
      <SafeAreaInsetsContext.Provider value={below}>
        <View className="flex-1">{children}</View>
      </SafeAreaInsetsContext.Provider>

      {showing && audio.current && (
        <View className="bg-card border-t border-border" style={{ paddingBottom: insets.bottom }}>
          <View className="h-0.5 bg-muted">
            <View
              className="h-0.5 bg-primary"
              style={{
                width: `${audio.duration > 0 ? Math.min(100, (audio.position / audio.duration) * 100) : 0}%`,
              }}
            />
          </View>
          <View className="flex-row items-center gap-1 pl-4 pr-1">
            <Pressable
              onPress={() => albumId && router.push(`/albums/${albumId}/audio`)}
              accessibilityRole="button"
              accessibilityLabel={`${audio.current.mediaTitle || audio.current.originalName}. Open the album's audio`}
              className="flex-1 flex-row items-center gap-3 min-h-[56px] active:opacity-70"
            >
              <View className="w-9 h-9 rounded-lg bg-primary/10 items-center justify-center">
                <MusicIcon size={16} className="text-primary" />
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-foreground text-[14px] font-semibold" numberOfLines={1}>
                  {audio.current.mediaTitle || audio.current.originalName}
                </Text>
                <Text className="text-muted-foreground text-[12px]" numberOfLines={1}>
                  {audio.unplayable
                    ? "Couldn't play this one"
                    : audio.loading
                      ? 'Loading…'
                      : audio.playing
                        ? 'Playing'
                        : 'Paused'}
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={audio.toggle}
              disabled={audio.unplayable}
              accessibilityRole="button"
              accessibilityLabel={audio.playing ? 'Pause' : 'Play'}
              className="w-11 h-11 items-center justify-center active:opacity-60"
            >
              {audio.playing ? (
                <PauseIcon size={20} className="text-foreground" />
              ) : (
                <PlayIcon size={20} className="text-foreground" />
              )}
            </Pressable>
            <Pressable
              onPress={audio.stop}
              accessibilityRole="button"
              accessibilityLabel="Stop and close"
              className="w-11 h-11 items-center justify-center active:opacity-60"
            >
              <XIcon size={18} className="text-muted-foreground" />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
