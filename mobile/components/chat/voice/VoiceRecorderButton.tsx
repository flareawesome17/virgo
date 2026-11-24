import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  PanResponder,
  Platform,
  Pressable,
  Text,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeftIcon, ChevronUpIcon, LockIcon, MicIcon, SendIcon, Trash2Icon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { MAX_VOICE_MS, voiceClock, type ConversationMessage } from '@/src/api';
import { sendVoiceNote, useVoiceRecorder, type VoiceStart } from '@/src/lib/voice-recorder';
import { alertTurnedOff, quoteLine } from '../files/files-words';

for (const Icon of [ChevronLeftIcon, ChevronUpIcon, LockIcon, MicIcon, SendIcon, Trash2Icon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** Slid this far left, the recording is thrown away. */
const CANCEL_DISTANCE = 120;
/** Slid this far up, it carries on hands-free. */
const LOCK_DISTANCE = 80;
/** The send button's place in the composer row. */
const SLOT = 44;
/** The raised microphone while held, and its soft ring (board ChatVoiceRecord). */
const RAISED = 72;
const RING = 92;
/** How far the raised microphone sits above the row's middle. */
const LIFT = 12;
/** The lock pill: its size, and how far above the row's top it sits. */
const PILL_WIDTH = 52;
const PILL_HEIGHT = 112;
const PILL_ABOVE = 64;
/** Live bars: 3 px wide, 2 px apart, 28 px tall at most. */
const BAR = 3;
const BAR_GAP = 2;
const BARS_HEIGHT = 28;
/** While held, as many as the board has room for beside "Slide to cancel". */
const HOLD_BARS = 10;
const HINT_MS = 2400;
/** Held this long before the microphone goes on: a tap never switches it on. */
const PRESS_MS = 150;

const HOLD_HINT = 'Hold to record, let go to send';

/**
 * - idle: the microphone, waiting.
 * - starting: held, and the microphone is being switched on.
 * - holding: recording while the finger stays down.
 * - locked: recording hands-free, after a slide up.
 * - busy: stopping, and sending or throwing it away.
 */
type Phase = 'idle' | 'starting' | 'holding' | 'locked' | 'busy';

function buzz(kind: 'light' | 'medium' | 'warning'): void {
  if (Platform.OS === 'web') return;
  const done =
    kind === 'warning'
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      : Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  done.catch(() => undefined);
}

/** The microphone's levels as bars, newest on the right. */
function LiveBars({ levels }: { levels: number[] }) {
  return (
    <View className="flex-row items-center" style={{ height: BARS_HEIGHT, gap: BAR_GAP }}>
      {levels.map((level, i) => (
        <View
          // A rolling window: each bar's place is all it is.
          key={i}
          className="rounded-[2px] bg-action"
          style={{ width: BAR, height: Math.max(4, Math.round(level * BARS_HEIGHT)) }}
        />
      ))}
    </View>
  );
}

/**
 * Where send is when nothing is typed: hold to record a voice note, let go
 * to send it (board ChatVoiceRecord). Slide left to throw it away, slide up
 * to carry on hands-free, with a bin and a send button. It sends by itself
 * at two minutes.
 *
 * NEEDS THE STORE BUILD: it records, so the composer mounts it only when
 * NATIVE_FEATURES.microphone is true.
 *
 * A plain PanResponder, not a gesture-handler Pan, which blocks scrolling on
 * iOS once it has begun. While it records it lays the recorder over the
 * whole composer row, so it renders into the row: put it last in it.
 */
export function VoiceRecorderButton({
  conversationId,
  replyTo,
  onSent,
  hidden,
  bottomPad,
}: {
  conversationId: string;
  /** What the voice note answers, if anything. */
  replyTo: ConversationMessage | null;
  /** It has gone into the chat: the reply is done with, and the newest is the one to see. */
  onSent?: () => void;
  /** Something is typed: send is showing instead. Kept mounted, so the recorder is too. */
  hidden: boolean;
  /** The row's padding under the button: the safe area, unless the keyboard is up. */
  bottomPad: number;
}) {
  const queryClient = useQueryClient();
  const recorder = useVoiceRecorder();
  const [phase, setPhaseState] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const setPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };

  /** The finger lifted while the microphone was still switching on: a tap, not a hold. */
  const released = useRef(false);
  /** Slid away while it was switching on: thrown away once it is on. */
  const slidOff = useRef(false);
  /** What this touch is: a hold that records, or a tap on send while locked. */
  const gesture = useRef<'hold' | 'tap-locked' | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Where the raised microphone has been slid to, along one way at a time. */
  const drag = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const cancelFade = useMemo(
    () => drag.x.interpolate({ inputRange: [-CANCEL_DISTANCE, 0], outputRange: [0.25, 1], extrapolate: 'clamp' }),
    [drag],
  );

  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(hintTimer.current), []);
  const showHint = (words: string) => {
    clearTimeout(hintTimer.current);
    setHint(words);
    AccessibilityInfo.announceForAccessibility(words);
    hintTimer.current = setTimeout(() => setHint(null), HINT_MS);
  };

  // The latest of each, for the gesture, which is made once.
  const latest = useRef({ recorder, conversationId, replyTo, onSent });
  latest.current = { recorder, conversationId, replyTo, onSent };

  const begin = async (locked: boolean) => {
    if (phaseRef.current !== 'idle') return;
    released.current = false;
    slidOff.current = false;
    clearTimeout(hintTimer.current);
    setHint(null);
    setPhase('starting');
    if (!locked) {
      await new Promise((resolve) => setTimeout(resolve, PRESS_MS));
      if (!mounted.current) return;
      if (released.current || slidOff.current) {
        setPhase('idle');
        if (!slidOff.current) showHint(HOLD_HINT);
        return;
      }
    }
    // Before the microphone is on: iOS holds back haptics while it records.
    buzz('light');
    let result: VoiceStart;
    try {
      result = await latest.current.recorder.start();
    } catch {
      result = 'failed';
    }
    if (!mounted.current) {
      if (result === 'started') void latest.current.recorder.cancel().catch(() => undefined);
      return;
    }
    if (result !== 'started') {
      setPhase('idle');
      // The question about the microphone came up over the hold: the next hold records.
      if (result === 'asked') showHint(locked ? 'Double-tap again to record' : 'Hold again to record');
      else if (result === 'denied') alertTurnedOff('microphone');
      else showHint("The microphone couldn't start. Try again.");
      return;
    }
    if (slidOff.current || (!locked && released.current)) {
      setPhase('busy');
      await latest.current.recorder.cancel().catch(() => undefined);
      setPhase('idle');
      if (!slidOff.current) showHint(HOLD_HINT);
      return;
    }
    setPhase(locked ? 'locked' : 'holding');
    if (locked) AccessibilityInfo.announceForAccessibility('Recording. Send it when you are done, or throw it away.');
  };

  const lockNow = () => {
    if (phaseRef.current !== 'holding') return;
    setPhase('locked');
    drag.setValue({ x: 0, y: 0 });
    buzz('medium');
  };

  const cancelNow = async () => {
    const p = phaseRef.current;
    if (p !== 'holding' && p !== 'locked') return;
    setPhase('busy');
    drag.setValue({ x: 0, y: 0 });
    await latest.current.recorder.cancel().catch(() => undefined);
    // The microphone is off again, so this one is felt.
    buzz('warning');
    if (mounted.current) setPhase('idle');
  };

  const sendNow = async () => {
    const p = phaseRef.current;
    if (p !== 'holding' && p !== 'locked') return;
    setPhase('busy');
    drag.setValue({ x: 0, y: 0 });
    const take = await latest.current.recorder.finish().catch(() => null);
    if (!mounted.current) return;
    if (!take) {
      // Under a second: a slip of the thumb, not a voice note.
      setPhase('idle');
      showHint(HOLD_HINT);
      return;
    }
    const { conversationId: chatId, replyTo: answering, onSent: sent } = latest.current;
    try {
      // Words first, then the bytes, through the upload queue: it waits out
      // a dropped connection, and carries on after the app is closed.
      await sendVoiceNote(queryClient, {
        conversationId: chatId,
        take,
        replyToId: answering?.id,
        replyToSender: answering?.sender_name ?? null,
        replyToLine: answering ? quoteLine(answering) : null,
      });
      buzz('light');
      sent?.();
    } catch {
      showHint("Couldn't keep that voice note. Check your phone has some space, then try again.");
    } finally {
      if (mounted.current) setPhase('idle');
    }
  };

  /** The touch ended: let go (send), or taken away by the system (keep it going, hands-free). */
  const end = (terminated: boolean) => {
    const kind = gesture.current;
    gesture.current = null;
    const p = phaseRef.current;
    if (kind === 'tap-locked') {
      if (!terminated && p === 'locked') void sendNow();
      return;
    }
    if (p === 'starting') {
      released.current = true;
      return;
    }
    if (p === 'holding') {
      // A call coming in, or the system taking the touch: nothing is lost or sent by surprise.
      if (terminated) lockNow();
      else void sendNow();
      return;
    }
    drag.setValue({ x: 0, y: 0 });
  };

  const act = useRef({ begin, lockNow, cancelNow, sendNow, end });
  act.current = { begin, lockNow, cancelNow, sendNow, end };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // Held, nothing else takes the touch: the hold is the recording.
        onPanResponderTerminationRequest: () => phaseRef.current !== 'holding' && phaseRef.current !== 'starting',
        onPanResponderGrant: () => {
          gesture.current = phaseRef.current === 'locked' ? 'tap-locked' : 'hold';
          if (gesture.current === 'hold') void act.current.begin(false);
        },
        onPanResponderMove: (_e, g) => {
          if (gesture.current !== 'hold') return;
          const p = phaseRef.current;
          if (p === 'starting') {
            if (g.dx < -CANCEL_DISTANCE) slidOff.current = true;
            return;
          }
          if (p !== 'holding') return;
          if (g.dx < -CANCEL_DISTANCE) {
            void act.current.cancelNow();
            return;
          }
          if (g.dy < -LOCK_DISTANCE) {
            act.current.lockNow();
            return;
          }
          // Along the way the finger is mostly going: left to cancel, up to lock.
          if (Math.abs(g.dx) >= Math.abs(g.dy)) drag.setValue({ x: Math.min(0, g.dx), y: 0 });
          else drag.setValue({ x: 0, y: Math.min(0, g.dy) });
        },
        onPanResponderRelease: () => act.current.end(false),
        onPanResponderTerminate: () => act.current.end(true),
      }),
    [drag],
  );

  const holding = phase === 'holding';
  const locked = phase === 'locked';
  const recording = holding || locked;

  // Two minutes is the most a voice note can be: it goes by itself there.
  useEffect(() => {
    if (recording && recorder.durationMs >= MAX_VOICE_MS) void act.current.sendNow();
  }, [recording, recorder.durationMs]);

  /** Locked, the bars have the row to themselves: as many as fit. */
  const [lockedBars, setLockedBars] = useState(recorder.levels.length);
  const onBarsRoom = (e: LayoutChangeEvent) => {
    const fit = Math.floor((e.nativeEvent.layout.width + BAR_GAP) / (BAR + BAR_GAP));
    const next = Math.max(1, Math.min(recorder.levels.length, fit));
    if (next !== lockedBars) setLockedBars(next);
  };

  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName !== 'activate') return;
    // A hold can't be done with a screen reader: it starts hands-free instead.
    if (phaseRef.current === 'idle') void begin(true);
    else if (phaseRef.current === 'locked') void sendNow();
  };

  const clock = voiceClock(recorder.durationMs);
  // Under the recorder when there is room in the row's foot, otherwise just above the row.
  const footRoom = bottomPad >= 22;
  const footLine = holding ? 'Let go to send · up to 2 minutes' : "Tap send when you're done · up to 2 minutes";

  return (
    <>
      {/* Recording: the composer row becomes the recorder. */}
      {recording ? (
        <View className="absolute left-0 right-0 top-0 bottom-0 bg-card border-t border-border/50">
          <View
            className="flex-row items-center pl-4"
            style={{
              height: SLOT,
              marginTop: 8,
              gap: 10,
              // Clear of the button, and of the raised microphone while held.
              paddingRight: 12 + SLOT + (holding ? (RAISED - SLOT) / 2 + 8 : 10),
            }}
          >
            {locked ? (
              <Pressable
                onPress={() => void cancelNow()}
                accessibilityRole="button"
                accessibilityLabel="Throw away this voice note"
                className="w-11 h-11 -ml-2 rounded-full items-center justify-center active:bg-muted"
              >
                <Trash2Icon size={20} className="text-destructive" />
              </Pressable>
            ) : null}
            <View className="w-2.5 h-2.5 rounded-full bg-destructive" />
            <Text
              className="text-foreground text-[15px] font-bold"
              style={{ width: 40, fontVariant: ['tabular-nums'] }}
              accessibilityLabel={`Recording, ${clock}`}
            >
              {clock}
            </Text>
            {holding ? (
              <>
                <View accessible={false} importantForAccessibility="no-hide-descendants">
                  <LiveBars levels={recorder.levels.slice(-HOLD_BARS)} />
                </View>
                <Animated.View style={{ flex: 1, opacity: cancelFade }}>
                  <View className="flex-row items-center justify-center gap-1">
                    <ChevronLeftIcon size={16} className="text-muted-foreground" />
                    <Text className="text-muted-foreground text-[14px]" numberOfLines={1}>
                      Slide to cancel
                    </Text>
                  </View>
                </Animated.View>
              </>
            ) : (
              <View
                className="flex-1 min-w-0 overflow-hidden"
                onLayout={onBarsRoom}
                accessible={false}
                importantForAccessibility="no-hide-descendants"
              >
                <LiveBars levels={recorder.levels.slice(-lockedBars)} />
              </View>
            )}
          </View>
          {footRoom ? (
            <Text
              className="absolute left-0 right-0 text-center text-muted-foreground text-[12px] leading-4"
              style={{ bottom: Math.max(4, Math.round((bottomPad - 16) / 2)) }}
              numberOfLines={1}
            >
              {footLine}
            </Text>
          ) : null}
        </View>
      ) : null}
      {recording && !footRoom ? (
        <Text
          pointerEvents="none"
          className="absolute left-4 text-muted-foreground text-[12px] leading-4"
          style={{ top: -22 }}
          numberOfLines={1}
        >
          {footLine}
        </Text>
      ) : null}

      <View
        {...responder.panHandlers}
        accessible
        accessibilityRole="button"
        accessibilityLabel={
          holding ? 'Recording. Let go to send' : locked ? 'Send voice note' : 'Hold to record a voice note'
        }
        accessibilityHint={locked || holding ? undefined : 'Or double-tap to record hands-free'}
        accessibilityActions={
          locked
            ? [{ name: 'activate', label: 'Send voice note' }]
            : holding
              ? []
              : [{ name: 'activate', label: 'Record hands-free' }]
        }
        onAccessibilityAction={onAccessibilityAction}
        style={{ width: SLOT, height: SLOT, display: hidden && !recording ? 'none' : 'flex' }}
      >
        {holding ? (
          // Raised over the row, with a soft ring, and following the finger.
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: (SLOT - RING) / 2,
              top: (SLOT - RING) / 2 - LIFT,
              width: RING,
              height: RING,
              transform: drag.getTranslateTransform(),
            }}
          >
            <View className="flex-1 rounded-full bg-action/15 items-center justify-center">
              <View className="rounded-full bg-action items-center justify-center" style={{ width: RAISED, height: RAISED }}>
                <MicIcon size={28} className="text-action-foreground" />
              </View>
            </View>
          </Animated.View>
        ) : (
          <View
            pointerEvents="none"
            className={`w-11 h-11 rounded-full bg-action items-center justify-center ${
              phase === 'starting' ? 'scale-[0.94]' : phase === 'busy' ? 'opacity-60' : ''
            }`}
          >
            {locked ? (
              <SendIcon size={17} className="text-action-foreground" />
            ) : (
              <MicIcon size={20} className="text-action-foreground" />
            )}
          </View>
        )}

        {/* Slide up to keep recording hands-free. */}
        {holding ? (
          <>
            <View
              pointerEvents="none"
              className="absolute rounded-full bg-card border border-border/40 items-center justify-between py-3.5"
              style={{
                left: (SLOT - PILL_WIDTH) / 2,
                bottom: SLOT + PILL_ABOVE,
                width: PILL_WIDTH,
                height: PILL_HEIGHT,
                shadowColor: '#000',
                shadowOpacity: 0.12,
                shadowRadius: 9,
                shadowOffset: { width: 0, height: 6 },
                elevation: 4,
              }}
            >
              <LockIcon size={20} className="text-secondary-foreground" />
              <ChevronUpIcon size={18} className="text-muted-foreground" />
            </View>
            {/* On its own backing: it floats over the thread, often over a bubble's time. */}
            <View
              pointerEvents="none"
              className="absolute rounded-full bg-background/95 border border-border/50 px-2.5 py-1"
              style={{ right: SLOT + 8, bottom: SLOT + PILL_ABOVE + 60 }}
            >
              <Text className="text-muted-foreground text-[12px] leading-4" numberOfLines={1}>
                Slide up to lock
              </Text>
            </View>
          </>
        ) : null}

        {/* A word about what just happened: too short, asked, or couldn't start. */}
        {hint ? (
          <View pointerEvents="none" className="absolute items-end" style={{ right: -4, bottom: SLOT + 10, width: 240 }}>
            <View className="rounded-xl bg-foreground px-3 py-2">
              <Text className="text-background text-[13px] leading-[18px] font-semibold">{hint}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </>
  );
}
