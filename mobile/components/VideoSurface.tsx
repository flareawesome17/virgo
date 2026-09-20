import { useEffect, type ReactNode } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { VideoPlayer } from '@/components/VideoPlayer';
import { useVideoPlayback } from '@/src/providers/VideoPlayerProvider';

/**
 * Where a film is drawn, whatever screen you are on.
 *
 * Wraps the navigator, like UploadBar, because that is the only place a player
 * can live and survive navigation. It used to be a Modal owned by the videos
 * screen, which tied a playing film to that screen staying mounted: going back
 * to the album stopped it, and there was no way to keep watching while doing
 * anything else.
 *
 * **The player is mounted exactly once, in one position in the tree**, and the
 * wrapper around it changes shape. That is the whole trick and it is easy to
 * get wrong: rendering a full-screen branch and a docked branch as two
 * different pieces of JSX would unmount one and mount the other on every
 * change, tearing down the `expo-video` player in between — so the film would
 * stop at the exact moment somebody asked to keep it going. Same element, same
 * position, different style.
 *
 * A Modal is not used for the same reason. Modal content is its own view
 * hierarchy, so moving in and out of one is a remount however carefully the
 * JSX is arranged.
 */
export function VideoSurface({ children }: { children: ReactNode }) {
  const { current, mode, close, minimise, expand } = useVideoPlayback();

  // Android's back button, which a full-screen overlay does not get for free
  // the way a Modal would. Minimising rather than closing matches the swipe,
  // and keeps the film playing — back should put it away, not throw it away.
  useEffect(() => {
    if (!current || mode !== 'full') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      minimise();
      return true;
    });
    return () => sub.remove();
  }, [current, mode, minimise]);

  return (
    <View className="flex-1">
      <View className="flex-1">{children}</View>

      {current && (
        <View
          // Absolute and covering everything when full, an ordinary docked
          // strip when mini. Only the style changes; the player below does
          // not move in the tree.
          style={
            mode === 'full'
              ? [StyleSheet.absoluteFillObject, { zIndex: 50 }]
              : undefined
          }
        >
          <VideoPlayer
            file={current}
            mode={mode}
            onClose={close}
            onMinimise={minimise}
            onExpand={expand}
          />
        </View>
      )}
    </View>
  );
}
