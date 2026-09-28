import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { PlayIcon, Volume2Icon, VolumeXIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { RemoteImage } from '@/components/RemoteImage';
import { clock } from '@/src/lib/media-grid';
import type { ShowcasePiece } from '@/src/api';

for (const Icon of [PlayIcon, Volume2Icon, VolumeXIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * A film inside a showcase, played where it sits.
 *
 * **It does not start on its own.** Every feed this is modelled on autoplays,
 * and every one of them has a global CDN behind it; a film here is served by
 * one box in one region, over connections people pay for by the gigabyte. So
 * the poster frame is what scrolls past — which is the frame the maker's
 * worker chose, and a good one — and a film plays because somebody asked it
 * to. Nobody is charged for a film they scrolled past.
 *
 * Until it is asked, no player exists: `useVideoPlayer` is given null and
 * mounts nothing, so a feed of twenty films holds no decoders. The player is
 * created on the first tap and stays for the life of the card, which is what
 * lets pause and resume work without reloading.
 */
export function ShowcaseFilm({
  piece,
  width,
  height,
  /** The feed starts silent, the way every feed does; a detail screen does not. */
  startMuted = true,
  loop = true,
  /**
   * Whether this card is the one on screen. A list passes its own answer; a
   * screen showing one film does not have to, because it is always the answer.
   */
  active = true,
  /**
   * Called the moment somebody asks this one to play, so a parent holding
   * several can make it the only one — two films talking over each other is
   * the thing a set of pieces on one screen makes easy to do by accident.
   */
  onPlay,
}: {
  piece: ShowcasePiece;
  width: number;
  height: number;
  startMuted?: boolean;
  loop?: boolean;
  active?: boolean;
  onPlay?: () => void;
}) {
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(startMuted);
  const [drawn, setDrawn] = useState(false);
  const [failed, setFailed] = useState(false);
  const source = piece.playbackUrl ?? null;

  const player = useVideoPlayer(
    // Nothing is loaded until the tap: null is a player with no source, not a
    // player buffering something nobody asked for. iOS needs telling that a
    // playlist is HLS — the extension is right but contentType is what the
    // platform keys off, and saying so costs nothing.
    !started || failed || !source
      ? null
      : source.endsWith('.m3u8')
        ? { uri: source, contentType: 'hls' as const }
        : source,
    (instance) => {
      instance.loop = loop;
      instance.muted = startMuted;
      instance.play();
    },
  );

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  // Scrolled past, so it stops. A film carried on playing off screen would keep
  // spending somebody's data and — worse — keep talking, with the control that
  // would silence it no longer anywhere on the screen. It is not resumed on the
  // way back: a film that starts itself because a thumb moved is the thing this
  // component exists not to do.
  useEffect(() => {
    if (started && !active) player.pause();
  }, [active, player, started]);

  // A film that will not load goes back to being its poster rather than a black
  // rectangle with a spinner in it. The proxy can be missing, the ladder can be
  // half-written, and the honest answer to either is the still we already have.
  useEffect(() => {
    if (!started) return;
    const status = player.addListener('statusChange', (event) => {
      if (event.status === 'error') setFailed(true);
    });
    // The badge follows the player rather than the tap, so a film that stops on
    // its own — the end of one that is not looping — shows a play button again
    // instead of a still frame with no way to restart it.
    const playback = player.addListener('playingChange', (event) =>
      setPlaying(event.isPlaying),
    );
    return () => {
      status.remove();
      playback.remove();
    };
  }, [player, started]);

  // A film with neither a ladder nor a proxy has nothing to play. It still has
  // its poster, so it is shown as a still rather than as a hole in the feed —
  // the badge is what is missing, not the piece.
  const playable = Boolean(source) && !failed;

  return (
    <View style={{ width, height }} className="bg-muted">
      {started && playable ? (
        <VideoView
          player={player}
          style={{ width, height }}
          contentFit="cover"
          nativeControls={false}
          onFirstFrameRender={() => setDrawn(true)}
        />
      ) : (
        <RemoteImage source={{ uri: piece.url }} style={{ width, height }} contentFit="cover" />
      )}

      {/* The whole frame is the control: the first tap starts it, and every tap
          after that pauses or resumes. Only the badge changes. */}
      <Pressable
        onPress={() => {
          if (!playable) return;
          if (!started) {
            setDrawn(false);
            setStarted(true);
            onPlay?.();
          } else if (playing) {
            player.pause();
          } else {
            player.play();
            onPlay?.();
          }
        }}
        disabled={!playable}
        accessibilityRole="button"
        accessibilityLabel={
          !playable
            ? 'This film cannot be played yet'
            : !started
              ? 'Play this film'
              : playing
                ? 'Pause this film'
                : 'Resume this film'
        }
        accessibilityState={{ disabled: !playable }}
        className="absolute inset-0 items-center justify-center"
      >
        {!playing && (
          <View
            className="w-16 h-16 rounded-full bg-foreground/55 items-center justify-center"
            style={{ opacity: playable ? 1 : 0.4 }}
          >
            {/* Named outright, the way the album player's controls are: a
                lucide fill of currentColor renders hollow on device, and this
                badge sits on a photograph, where white is right in both
                themes. */}
            <PlayIcon size={26} color="#fff" fill="#fff" />
          </View>
        )}
        {!started && piece.durationMs ? (
          <View className="absolute left-3 bottom-3 rounded-full bg-foreground/55 px-2 py-0.5">
            <Text className="text-background text-[11px] font-bold">
              {clock(piece.durationMs / 1000)}
            </Text>
          </View>
        ) : null}
      </Pressable>

      {started && playable && (
        <Pressable
          onPress={() => setMuted((m) => !m)}
          accessibilityRole="button"
          accessibilityLabel={muted ? 'Turn the sound on' : 'Turn the sound off'}
          hitSlop={8}
          className="absolute right-3 bottom-3 w-9 h-9 rounded-full bg-foreground/55 items-center justify-center active:opacity-80"
        >
          {muted ? (
            <VolumeXIcon size={16} className="text-background" />
          ) : (
            <Volume2Icon size={16} className="text-background" />
          )}
        </Pressable>
      )}

      {started && playable && !drawn && (
        <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
          <ActivityIndicator color="#fff" />
        </View>
      )}
    </View>
  );
}
