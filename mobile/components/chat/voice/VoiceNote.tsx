import { memo, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import { PauseIcon, PlayIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  voiceAttachment,
  voiceBars,
  voiceClock,
  voiceLength,
  voiceRateLabel,
  voiceSpokenLength,
  type ChatAttachment,
  type ConversationMessage,
  type VoiceRate,
} from '@/src/api';
import { useTheme } from '@/src/hooks';
import { attachmentLink } from '@/src/hooks/useChatFiles';
import {
  cycleVoiceRate,
  pauseVoice,
  playVoice,
  seekVoice,
  useVoicePlayback,
  type VoicePlayback,
} from '@/src/lib/voice-player';
import { PALETTES } from '@/theme';

for (const Icon of [PauseIcon, PlayIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** The bars, as board ChatVoicePlay draws them: 3 px wide, 2 px apart, 26 px tall at most. */
const BAR = 3;
const BAR_GAP = 2;
const BARS_HEIGHT = 26;
const CIRCLE = 40;
/** The speed chip (w-11) and the gap before it (gap-2.5). */
const CHIP = 44;
const GAP = 10;
/** The length on your own bubble, so the bars can be counted before anything is laid out. */
const LENGTH_WIDTH = 36;
/** The bubbles' widths on the board: yours, and theirs with the chip. */
const MINE_WIDTH = 250;
const THEIRS_WIDTH = 284;

/** A voice note on the thread: what it is, how it is playing, and what can be done with it. */
export interface VoiceNoteState {
  attachment: ChatAttachment | null;
  playback: VoicePlayback;
  /** It is the note playing, or the one paused part-way. */
  active: boolean;
  /** As the player has it once loaded, else as the message says. 0 when unknown. */
  durationMs: number;
  /** Arrived: there is something to play. */
  playable: boolean;
  /** Play, carry on, or pause. Tried again after it failed. */
  toggle: () => void;
  cycleRate: () => void;
  /** To a point in it, from 0 to 1. Only while it is the active note. */
  seekTo: (fraction: number) => void;
}

/**
 * One voice message's playback, through the one shared player. Called for
 * every photos or file message too (with null), so the bubble's hooks never
 * change order; with no note it is the idle state and nothing else.
 *
 * Nothing loads until play is tapped (weak-signal rule 6). The link the
 * message came with is tried first, and a fresh one asked for when there is
 * none, or after a try that failed.
 */
export function useVoiceNote(message: ConversationMessage | null): VoiceNoteState {
  const attachment = message ? voiceAttachment(message) : null;
  const playback = useVoicePlayback(attachment?.id ?? null);
  const active = !!attachment && playback.id === attachment.id;
  const durationMs = (active && playback.durationMs > 0 ? playback.durationMs : 0) || attachment?.durationMs || 0;
  const playable = attachment?.status === 'ready';

  const conversationId = message?.conversation_id;
  const messageId = message?.id;
  const attachmentId = attachment?.id;
  const url = attachment?.url ?? null;
  const knownMs = attachment?.durationMs ?? null;
  const playing = active && playback.playing;

  const toggle = useCallback(() => {
    if (!playable || !attachmentId || !messageId || !conversationId) return;
    if (playing) {
      pauseVoice();
      return;
    }
    void playVoice({
      id: attachmentId,
      url,
      durationMs: knownMs,
      freshUrl: () =>
        attachmentLink(conversationId, messageId, attachmentId)
          .then((r) => r.url)
          .catch(() => null),
    });
  }, [playable, attachmentId, messageId, conversationId, playing, url, knownMs]);

  const seekTo = useCallback(
    (fraction: number) => {
      if (!active || !attachmentId || durationMs <= 0) return;
      seekVoice(attachmentId, Math.round(Math.max(0, Math.min(1, fraction)) * durationMs));
    },
    [active, attachmentId, durationMs],
  );

  return { attachment, playback, active, durationMs, playable, toggle, cycleRate: cycleVoiceRate, seekTo };
}

/** Why it can't be played: still on its way, never arrived, or wouldn't play. Null when it can. */
function statusOf(voice: VoiceNoteState, mine: boolean, sendingHere: boolean): string | null {
  const a = voice.attachment;
  if (!a) return null;
  if (a.status === 'failed') return "Didn't arrive";
  // Yours from this phone says how far it has got in the line under the bubble.
  if (a.status === 'uploading') return mine ? (sendingHere ? null : 'Sending…') : 'Arriving…';
  if (voice.active && voice.playback.failed) return "Couldn't play · Tap to try again";
  return null;
}

/** Part-way through, or playing: the clock is worth showing rather than the length. */
function underway(voice: VoiceNoteState): boolean {
  return voice.active && (voice.playback.playing || voice.playback.positionMs > 0);
}

/**
 * What a screen reader says for the note, after who sent it: "Voice note,
 * 32 seconds", then how it is playing, or why it can't.
 */
export function voiceNoteLabel(voice: VoiceNoteState, mine: boolean, sendingHere = false): string {
  const parts = [voice.durationMs > 0 ? `Voice note, ${voiceSpokenLength(voice.durationMs)}` : 'Voice note'];
  const status = statusOf(voice, mine, sendingHere);
  if (status) {
    parts.push(voice.active && voice.playback.failed ? "Couldn't play. Double-tap to try again" : status);
  } else if (voice.active && voice.playback.loading) {
    parts.push('Loading');
  } else if (underway(voice)) {
    const at = `${voiceClock(voice.playback.positionMs)} of ${voiceClock(voice.durationMs)}`;
    parts.push(voice.playback.playing ? `Playing, ${at}` : `Paused at ${at}`);
  }
  if (voice.active && voice.playback.rate !== 1) parts.push(`at ${voice.playback.rate} times speed`);
  return parts.join(', ');
}

/** The bubble's own actions for a screen reader: play or pause, and the speed while it is the active one. */
export function voiceNoteActions(voice: VoiceNoteState): { name: string; label: string }[] {
  const actions: { name: string; label: string }[] = [];
  if (voice.playable) {
    actions.push({ name: 'activate', label: voice.active && voice.playback.playing ? 'Pause' : 'Play' });
  }
  if (voice.active) {
    actions.push({ name: 'speed', label: `Playback speed, ${voice.playback.rate} times. Change it` });
  }
  return actions;
}

/** Runs one of voiceNoteActions; false when the action is somebody else's. */
export function runVoiceNoteAction(voice: VoiceNoteState, name: string): boolean {
  if (name === 'activate') {
    voice.toggle();
    return true;
  }
  if (name === 'speed') {
    voice.cycleRate();
    return true;
  }
  return false;
}

/** How wide a bubble is, and how many bars fit in it with the speed chip's room kept. */
function useVoiceLayout(mine: boolean): { width: number; bars: number } {
  const { width: windowWidth } = useWindowDimensions();
  const room = windowWidth - 32;
  const width = mine
    ? Math.min(MINE_WIDTH, Math.floor(room * 0.8))
    : Math.min(THEIRS_WIDTH, Math.floor(room * 0.82));
  // Padding, the circle and the gaps; on yours the length too, on theirs the border.
  const fixed = mine ? 8 + 14 + CIRCLE + GAP + GAP + LENGTH_WIDTH : 8 + 10 + 2 + CIRCLE + GAP;
  // The chip's room is kept whether or not it shows, so the bars never move when it does.
  const barsRoom = width - fixed - (CHIP + GAP);
  return { width, bars: Math.max(8, Math.floor((barsRoom + BAR_GAP) / (BAR + BAR_GAP))) };
}

/** The waveform, filling with colour as it plays. A tap on it jumps there while it is the active note. */
function Bars({
  waveform,
  count,
  mine,
  progress,
  onSeek,
  onLongPress,
}: {
  waveform: number[] | null | undefined;
  count: number;
  mine: boolean;
  /** 0 to 1 while it is the active note; null otherwise. */
  progress: number | null;
  onSeek?: (fraction: number) => void;
  onLongPress?: () => void;
}) {
  const levels = useMemo(() => voiceBars(waveform, count), [waveform, count]);
  const span = count * BAR + (count - 1) * BAR_GAP;
  const played = progress === null ? 0 : Math.round(progress * count);
  // What has played fills in; the rest stays as it was before play.
  const rest = mine ? 'bg-action-foreground/60' : 'bg-muted-foreground/40';
  const done = mine ? 'bg-action-foreground' : 'bg-action';
  return (
    <Pressable
      // Measured on the row itself: the bars take no touches, so the tap's x is across all of them.
      onPress={onSeek ? (e: GestureResponderEvent) => onSeek(e.nativeEvent.locationX / span) : undefined}
      onLongPress={onLongPress}
      delayLongPress={300}
      hitSlop={{ top: 8, bottom: 8 }}
      accessible={false}
      style={{ width: span, height: BARS_HEIGHT }}
    >
      <View pointerEvents="none" className="flex-1 flex-row items-center" style={{ gap: BAR_GAP }}>
        {levels.map((level, i) => (
          <View
            // A fixed set of bars: each one's place is all it is.
            key={i}
            className={`rounded-[2px] ${i < played ? done : rest}`}
            style={{ width: BAR, height: Math.max(3, Math.round(level * BARS_HEIGHT)) }}
          />
        ))}
      </View>
    </Pressable>
  );
}

/** The round button: play, pause, or the spinner while it loads. Faded when there's nothing to play yet. */
function PlayCircle({
  mine,
  playing,
  loading,
  canPlay,
  onPress,
  onLongPress,
}: {
  mine: boolean;
  playing: boolean;
  loading: boolean;
  canPlay: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  // White on yours with the bubble's colour inside it; the bubble's colour on theirs.
  const ink = mine ? palette.action : palette.actionForeground;
  return (
    <Pressable
      onPress={canPlay ? onPress : undefined}
      onLongPress={onLongPress}
      delayLongPress={300}
      disabled={!canPlay}
      hitSlop={4}
      accessible={false}
      className={`rounded-full items-center justify-center active:opacity-80 ${
        mine ? 'bg-action-foreground' : 'bg-action'
      } ${canPlay ? '' : 'opacity-50'}`}
      style={{ width: CIRCLE, height: CIRCLE }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={ink} />
      ) : playing ? (
        <PauseIcon size={16} color={ink} fill={ink} strokeWidth={0} />
      ) : (
        <PlayIcon size={16} color={ink} fill={ink} strokeWidth={2} strokeLinejoin="round" style={{ marginLeft: 2 }} />
      )}
    </Pressable>
  );
}

/** "1×", "1.5×", "2×": one tap moves to the next, for this note and the ones after it. */
function SpeedChip({ mine, rate, onPress }: { mine: boolean; rate: VoiceRate; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8 }}
      accessible={false}
      className={`w-11 h-7 rounded-full items-center justify-center active:opacity-70 ${
        mine ? 'bg-action-foreground/20' : 'bg-muted'
      }`}
    >
      <Text className={`text-[12px] font-bold ${mine ? 'text-action-foreground' : 'text-foreground'}`}>
        {voiceRateLabel(rate)}
      </Text>
    </Pressable>
  );
}

/**
 * A voice note in the thread, as board ChatVoicePlay draws it. Yours: the
 * bubble's colour, a white play circle, white bars and the length. Theirs: a
 * white card, the play circle in the bubble's colour, and under the bars the
 * length, or "0:21 / 0:48" while it plays. The speed chip shows while it is
 * the note playing or paused.
 *
 * The screen reader reads the whole message as one (FilesMessage's wrapper),
 * with Play or Pause and the speed as its actions; the parts here are for
 * touch.
 */
export const VoiceNote = memo(function VoiceNote({
  voice,
  mine,
  sendingHere = false,
  onHold,
}: {
  voice: VoiceNoteState;
  mine: boolean;
  /** Yours, with its bytes still going from this phone: the line under it says how far. */
  sendingHere?: boolean;
  onHold: () => void;
}) {
  const { width, bars } = useVoiceLayout(mine);
  const { playback, active, durationMs, playable } = voice;
  const status = statusOf(voice, mine, sendingHere);
  const playing = active && playback.playing;
  const progress = active && durationMs > 0 ? Math.min(1, playback.positionMs / durationMs) : null;
  const going = underway(voice);
  const retry = active && playback.failed;

  const circle = (
    <PlayCircle
      mine={mine}
      playing={playing && !playback.loading}
      loading={active && playback.loading}
      canPlay={playable}
      onPress={voice.toggle}
      onLongPress={onHold}
    />
  );
  const waveform = (
    <Bars
      waveform={voice.attachment?.waveform}
      count={bars}
      mine={mine}
      progress={progress}
      onSeek={active ? voice.seekTo : undefined}
      onLongPress={onHold}
    />
  );
  // Not while it says it couldn't play: the words need the room.
  const chip = active && !retry ? <SpeedChip mine={mine} rate={playback.rate} onPress={voice.cycleRate} /> : null;

  /*
   * The bubble itself is a plain View, and each part holds the long press
   * (reply, forward, delete) itself. As a Pressable around the play circle,
   * the bubble took the press in the web build, so play never started; the
   * parts carrying it themselves behave the same everywhere.
   */
  const words = (text: string, className: string, numberOfLines: number, style?: { width: number }) => (
    <Pressable
      onPress={retry ? voice.toggle : undefined}
      onLongPress={onHold}
      delayLongPress={300}
      accessible={false}
    >
      <Text className={className} style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    </Pressable>
  );

  if (mine) {
    return (
      <View
        className="rounded-[20px] bg-action flex-row items-center py-2 pl-2 pr-3.5"
        style={{ width, gap: GAP }}
      >
        {circle}
        <View className="flex-1 min-w-0 gap-1">
          {waveform}
          {status ? words(status, 'text-action-foreground text-[12px] leading-4', 2) : null}
        </View>
        {words(
          going ? voiceClock(playback.positionMs) : voiceLength(durationMs),
          'text-action-foreground text-[13px] font-semibold text-right',
          1,
          { width: LENGTH_WIDTH },
        )}
        {chip}
      </View>
    );
  }

  const line = status ?? (going ? `${voiceClock(playback.positionMs)} / ${voiceLength(durationMs)}` : voiceLength(durationMs));
  return (
    <View
      className="rounded-[20px] bg-card border border-border/40 flex-row items-center py-2 pl-2 pr-2.5"
      style={{ width, gap: GAP }}
    >
      {circle}
      <View className="flex-1 min-w-0 gap-1">
        {waveform}
        {words(line, `text-[12px] leading-4 ${retry ? 'text-primary font-semibold' : 'text-muted-foreground'}`, 2)}
      </View>
      {chip}
    </View>
  );
});

/**
 * Your voice note before its message is in the chat (it is waiting for a
 * connection, or was turned down): the length, and nothing to play yet. The
 * line under it says where it has got.
 */
export function PendingVoiceNote({ durationMs }: { durationMs: number }) {
  const { width, bars } = useVoiceLayout(true);
  return (
    <View
      className="rounded-[20px] bg-action flex-row items-center py-2 pl-2 pr-3.5"
      style={{ width, gap: GAP }}
    >
      <PlayCircle mine playing={false} loading={false} canPlay={false} />
      <View className="flex-1 min-w-0">
        <Bars waveform={null} count={bars} mine progress={null} />
      </View>
      <Text
        className="text-action-foreground text-[13px] font-semibold text-right"
        style={{ width: LENGTH_WIDTH }}
        numberOfLines={1}
      >
        {voiceLength(durationMs)}
      </Text>
    </View>
  );
}
