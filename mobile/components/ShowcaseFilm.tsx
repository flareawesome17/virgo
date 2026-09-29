import { useEffect, useRef, useState } from 'react';
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
 * **One player, made empty, for the life of the card.** `useVideoPlayer` keys
 * on the source, so passing the URL only once somebody taps would tear the
 * native player down and build another one mid-interaction — with this
 * component's listeners and their cleanup straddling the swap, calling
 * `remove()` on subscriptions belonging to an object that had already been
 * released. Instead the source is always null and the film is loaded into the
 * player that already exists, with `replaceAsync`. Nothing is fetched until
 * then either way, which was the point of the original arrangement.
 *
 * Nothing is asked of the player before it holds a film. It is not told to
 * play, unmuted, or paused while it is empty: an empty player is not a paused
 * one, and on Android unmuting reaches the audio-focus machinery, which this
 * has no business waking for a card somebody has only scrolled past.
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
}: {
  piece: ShowcasePiece;
  width: number;
  height: number;
  loop?: boolean;
  active?: boolean;
  onPlay?: () => void;
}) {
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  // Silent until asked, everywhere. A film that starts talking because a post
  // was opened is startling, and the control that would stop it is on a card
  // the reader may already have scrolled past.
  const [muted, setMuted] = useState(true);
  const [drawn, setDrawn] = useState(false);
  const [failed, setFailed] = useState(false);
  const loading = useRef(false);

  const source = piece.playbackUrl ?? null;

  // Always null: see the note above. The film arrives through replaceAsync, so
  // this player is constructed once and never swapped underneath a listener.
  const player = useVideoPlayer(null, (instance) => {
    instance.loop = loop;
    instance.muted = true;
  });

  // Registered against a player whose identity never changes, so this runs
  // once and its cleanup always removes subscriptions from a live object.
  useEffect(() => {
    const status = player.addListener('statusChange', (event) => {
      // A film that will not load goes back to being its poster rather than a
      // black rectangle with a spinner in it. The proxy can be missing, the
      // ladder can be half-written, and the honest answer to either is the
      // still we already have.
      if (event.status === 'error') setFailed(true);
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
  }, [player]);

  useEffect(() => {
    if (started) player.muted = muted;
  }, [muted, player, started]);

  /**
   * Scrolled past, so it stops.
   *
   * A film carried on playing off screen would keep spending somebody's data
   * and — worse — keep talking, with the control that would silence it no
   * longer anywhere on the screen. It is not resumed on the way back: a film
   * that starts itself because a thumb moved is the thing this component
   * exists not to do.
   */
  useEffect(() => {
    if (started && !active) player.pause();
  }, [active, player, started]);

  // A film with neither a ladder nor a proxy has nothing to play. It still has
  // its poster, so it is shown as a still rather than as a hole in the feed —
  // the badge is what is missing, not the piece.
  const playable = Boolean(source) && !failed;

  const press = () => {
    if (!playable || !source) return;

    if (!started) {
      // Guarded because the load is asynchronous and a second tap before it
      // returns would put two films into one player.
      if (loading.current) return;
      loading.current = true;
      setDrawn(false);
      setStarted(true);
      onPlay?.();
      void player
        // iOS needs telling that a playlist is HLS — the extension is right,
        // but contentType is what the platform keys off, and saying so costs
        // nothing.
        .replaceAsync(
          source.endsWith('.m3u8') ? { uri: source, contentType: 'hls' } : { uri: source },
        )
        .then(() => player.play())
        .catch(() => setFailed(true))
        .finally(() => {
          loading.current = false;
        });
      return;
    }

    if (playing) {
      player.pause();
    } else {
      player.play();
      onPlay?.();
    }
  };

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
        onPress={press}
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
