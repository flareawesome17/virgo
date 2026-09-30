import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { PlayIcon, Volume2Icon, VolumeXIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { RemoteImage } from '@/components/RemoteImage';
import { clock } from '@/src/lib/media-grid';
import { pauseAlbumAudio } from '@/src/providers/AlbumAudioProvider';
import type { ShowcasePiece } from '@/src/api';

for (const Icon of [PlayIcon, Volume2Icon, VolumeXIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * A film inside a showcase.
 *
 * **It does not start on its own.** Every feed this is modelled on autoplays,
 * and every one of them has a global CDN behind it; a film here is served by
 * one box in one region, over connections people pay for by the gigabyte. So
 * the poster frame is what scrolls past — the frame the media worker chose —
 * and a film plays because somebody asked it to.
 *
 * **Until it is asked, there is no player.** This used to hold a `useVideoPlayer`
 * from the moment it rendered, given a null source, and hand it the film later.
 * That meant opening a post built a native player for every film in it before
 * anybody had touched one, and rebuilt each of them on the first tap, because
 * the hook keys on its source. The player now lives in `Film` below, which is
 * not rendered until the tap — so a screen of films that nobody plays
 * constructs nothing, and the player that is constructed is made once, with
 * the film already in it.
 */
export function ShowcaseFilm({
  piece,
  width,
  height,
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
  /**
   * How far up to lift the running time and the sound control, for a parent
   * that lays something over the foot of the film. The feed's placard covers
   * its bottom 32 points, and both controls sat underneath it.
   */
  controlsInset = 0,
}: {
  piece: ShowcasePiece;
  width: number;
  height: number;
  loop?: boolean;
  active?: boolean;
  onPlay?: () => void;
  controlsInset?: number;
}) {
  const [started, setStarted] = useState(false);
  const source = piece.playbackUrl ?? null;

  // A film with neither a ladder nor a proxy has nothing to play. It still has
  // its poster, so it is shown as a still rather than as a hole in the feed —
  // what is missing is the control, not the piece.
  if (!started || !source) {
    return (
      <Poster
        piece={piece}
        width={width}
        height={height}
        playable={Boolean(source)}
        controlsInset={controlsInset}
        onPress={() => {
          pauseAlbumAudio();
          setStarted(true);
          onPlay?.();
        }}
      />
    );
  }

  return (
    <Film
      source={source}
      poster={piece.url}
      width={width}
      height={height}
      loop={loop}
      active={active}
      controlsInset={controlsInset}
      onPlay={onPlay}
      // Back to the still, which is the honest answer to a proxy that is
      // missing or a ladder that is half-written — not a black rectangle.
      onFailed={() => setStarted(false)}
    />
  );
}

/** The still, the play badge and the running time. No player, no decoder. */
function Poster({
  piece,
  width,
  height,
  playable,
  controlsInset,
  onPress,
}: {
  piece: ShowcasePiece;
  width: number;
  height: number;
  playable: boolean;
  controlsInset: number;
  onPress: () => void;
}) {
  return (
    <View style={{ width, height }} className="bg-muted">
      <RemoteImage source={{ uri: piece.url }} style={{ width, height }} contentFit="cover" />
      <Pressable
        onPress={playable ? onPress : undefined}
        disabled={!playable}
        accessibilityRole="button"
        accessibilityLabel={playable ? 'Play this film' : 'This film cannot be played yet'}
        accessibilityState={{ disabled: !playable }}
        className="absolute inset-0 items-center justify-center"
      >
        <View
          className="w-16 h-16 rounded-full bg-foreground/55 items-center justify-center"
          style={{ opacity: playable ? 1 : 0.4 }}
        >
          {/* Named outright, the way the album player's controls are: a lucide
              fill of currentColor renders hollow on a device, and this badge
              sits on a photograph, where white is right in both themes. */}
          <PlayIcon size={26} color="#fff" fill="#fff" />
        </View>
        {piece.durationMs ? (
          <View
            className="absolute left-3 rounded-full bg-foreground/55 px-2 py-0.5"
            style={{ bottom: 12 + controlsInset }}
          >
            <Text className="text-background text-[11px] font-bold">
              {clock(piece.durationMs / 1000)}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

/**
 * The player, mounted only once somebody has asked for it.
 *
 * `source` never changes for the life of this component — it is given at mount
 * and the parent unmounts the whole thing to give up — so `useVideoPlayer`
 * constructs exactly one native player and no subscription ever outlives the
 * object it was registered on.
 */
function Film({
  source,
  poster,
  width,
  height,
  loop,
  active,
  controlsInset,
  onPlay,
  onFailed,
}: {
  source: string;
  poster: string;
  width: number;
  height: number;
  loop: boolean;
  active: boolean;
  controlsInset: number;
  onPlay?: () => void;
  onFailed: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  // Silent until asked, everywhere. A film that starts talking because a post
  // was opened is startling, and on a feed the control that would stop it
  // scrolls away with the card.
  const [muted, setMuted] = useState(true);
  const [drawn, setDrawn] = useState(false);

  const player = useVideoPlayer(
    // iOS needs telling that a playlist is HLS — the extension is right, but
    // contentType is what the platform keys off, and saying so costs nothing.
    source.endsWith('.m3u8') ? { uri: source, contentType: 'hls' as const } : { uri: source },
    (instance) => {
      instance.loop = loop;
      instance.muted = true;
      instance.play();
    },
  );

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    const status = player.addListener('statusChange', (event) => {
      if (event.status === 'error') onFailed();
    });
    // The badge follows the player rather than the tap, so a film that stops
    // on its own shows a play button again instead of a still frame with no
    // way to restart it.
    const playback = player.addListener('playingChange', (event) =>
      setPlaying(event.isPlaying),
    );
    return () => {
      status.remove();
      playback.remove();
    };
    // onFailed is a fresh closure each render and re-subscribing on every one
    // of them would churn native listeners; it only ever calls a setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  /**
   * Scrolled past, so it stops.
   *
   * A film carried on playing off screen would keep spending somebody's data
   * and — worse — keep talking, with the control that would silence it no
   * longer anywhere on the screen. It is not resumed on the way back: a film
   * that starts itself because a thumb moved is the thing this exists not to
   * do.
   */
  useEffect(() => {
    if (!active) player.pause();
  }, [active, player]);

  return (
    <View style={{ width, height }} className="bg-muted">
      <VideoView
        player={player}
        style={{ width, height }}
        contentFit="cover"
        nativeControls={false}
        onFirstFrameRender={() => setDrawn(true)}
      />

      {/* The whole frame is the control: tap to pause, tap to resume. */}
      <Pressable
        onPress={() => {
          if (playing) {
            player.pause();
          } else {
            pauseAlbumAudio();
            player.play();
            onPlay?.();
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause this film' : 'Resume this film'}
        className="absolute inset-0 items-center justify-center"
      >
        {!playing && (
          <View className="w-16 h-16 rounded-full bg-foreground/55 items-center justify-center">
            <PlayIcon size={26} color="#fff" fill="#fff" />
          </View>
        )}
      </Pressable>

      <Pressable
        onPress={() => setMuted((m) => !m)}
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Turn the sound on' : 'Turn the sound off'}
        hitSlop={8}
        className="absolute right-3 w-9 h-9 rounded-full bg-foreground/55 items-center justify-center active:opacity-80"
        style={{ bottom: 12 + controlsInset }}
      >
        {muted ? (
          <VolumeXIcon size={16} className="text-background" />
        ) : (
          <Volume2Icon size={16} className="text-background" />
        )}
      </Pressable>

      {!drawn && (
        <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
          <RemoteImage source={{ uri: poster }} style={{ width, height }} contentFit="cover" />
          <View className="absolute inset-0 items-center justify-center">
            <ActivityIndicator color="#fff" />
          </View>
        </View>
      )}
    </View>
  );
}
