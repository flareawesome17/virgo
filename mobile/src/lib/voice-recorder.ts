import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioQuality,
  IOSOutputFormat,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import type { QueryClient } from '@tanstack/react-query';
import { MIN_VOICE_MS, VOICE_BIT_RATE, VOICE_SAMPLE_RATE } from '@/src/api';
import { enterRecordMode, enterVoiceMode, setVoiceActive } from '@/src/lib/audio-mode';
import { keepChatFile } from '@/src/lib/chat-files';
import { queueChatFiles } from '@/src/lib/chat-uploads';
import { pauseVoice } from '@/src/lib/voice-player';

/**
 * Recording a voice note (phase 5): AAC in an .m4a, one channel, 22.05 kHz,
 * 24 kbps, about 180 KB a minute (weak-signal rule 5). The server re-encodes
 * to the same, so what is recorded here is what is sent.
 *
 * NEEDS THE STORE BUILD. Only mount a component that calls this hook when
 * NATIVE_FEATURES.microphone is true: the installed builds were made without
 * the microphone permission, and on iOS asking for it there ends the app.
 */
export const VOICE_RECORDING: RecordingOptions = {
  extension: '.m4a',
  sampleRate: VOICE_SAMPLE_RATE,
  numberOfChannels: 1,
  bitRate: VOICE_BIT_RATE,
  // The live bars while recording.
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    sampleRate: VOICE_SAMPLE_RATE,
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    extension: '.m4a',
    sampleRate: VOICE_SAMPLE_RATE,
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: VOICE_BIT_RATE,
  },
};

/** How many recent levels the recorder's live bars show. */
const LEVELS = 28;

/** A level from the recorder's metering (dBFS, -160 to 0) as 0 to 1. */
function levelOf(db: number | undefined): number {
  if (db === undefined || !Number.isFinite(db)) return 0.1;
  return Math.max(0.1, Math.min(1, (db + 50) / 50));
}

/**
 * - started: the microphone is on.
 * - asked: iOS or Android just asked for the microphone. The hold that
 *   started it was interrupted by the question, so nothing records; the next
 *   hold does.
 * - denied: the microphone is switched off for Virgo; the screen says where
 *   to switch it on.
 * - failed: it wouldn't start (another app has the microphone, say).
 */
export type VoiceStart = 'started' | 'asked' | 'denied' | 'failed';

export interface VoiceTake {
  /** The recording, in this app's cache folder. */
  uri: string;
  durationMs: number;
}

export interface VoiceRecorder {
  recording: boolean;
  durationMs: number;
  /** The last few levels, oldest first, each from 0 to 1. */
  levels: number[];
  start: () => Promise<VoiceStart>;
  /** Stops and keeps it; null when it was too short to be a voice note. */
  finish: () => Promise<VoiceTake | null>;
  /** Stops and throws it away. */
  cancel: () => Promise<void>;
}

/**
 * Sends a recording through the chat upload queue: words first ("Sent a
 * voice note (0:32)" is in the chat at once), then the bytes, waiting out a
 * dropped connection, and picked up again after the app is closed. Returns
 * the send's client id.
 */
export async function sendVoiceNote(
  queryClient: QueryClient,
  input: {
    conversationId: string;
    take: VoiceTake;
    replyToId?: string;
    replyToSender?: string | null;
    replyToLine?: string | null;
  },
): Promise<string> {
  const info = await FileSystem.getInfoAsync(input.take.uri);
  const size = info.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0;
  if (size <= 0) throw new Error('The recording is empty.');
  const kept = await keepChatFile({
    uri: input.take.uri,
    name: 'Voice note.m4a',
    contentType: 'audio/mp4',
    size,
    width: null,
    height: null,
    durationMs: input.take.durationMs,
  });
  return queueChatFiles(queryClient, {
    conversationId: input.conversationId,
    kind: 'voice',
    files: [kept],
    caption: null,
    replyToId: input.replyToId,
    replyToSender: input.replyToSender,
    replyToLine: input.replyToLine,
  });
}

export function useVoiceRecorder(): VoiceRecorder {
  const recorder = useAudioRecorder(VOICE_RECORDING);
  const status = useAudioRecorderState(recorder, 100);
  const [levels, setLevels] = useState<number[]>(() => new Array<number>(LEVELS).fill(0.1));
  const live = useRef(false);

  useEffect(() => {
    if (!status.isRecording) return;
    setLevels((prev) => [...prev.slice(1 - LEVELS), levelOf(status.metering)]);
  }, [status.isRecording, status.durationMillis, status.metering]);

  const release = useCallback(async () => {
    live.current = false;
    setVoiceActive(false);
    // Straight back out of recording mode: left in it, iOS plays every sound
    // after through the earpiece.
    await enterVoiceMode();
  }, []);

  const stop = useCallback(async (): Promise<VoiceTake | null> => {
    if (!live.current) return null;
    const durationMs = recorder.getStatus().durationMillis;
    try {
      await recorder.stop();
    } catch {
      // Already stopped by the system (a call came in): what was recorded stays.
    }
    await release();
    const uri = recorder.uri;
    return uri ? { uri, durationMs } : null;
  }, [recorder, release]);

  const start = useCallback(async (): Promise<VoiceStart> => {
    try {
      const now = await getRecordingPermissionsAsync();
      if (!now.granted) {
        if (!now.canAskAgain) return 'denied';
        const asked = await requestRecordingPermissionsAsync();
        return asked.granted ? 'asked' : 'denied';
      }
      pauseVoice();
      setVoiceActive(true);
      await enterRecordMode();
      await recorder.prepareToRecordAsync();
      recorder.record();
      live.current = true;
      setLevels(new Array<number>(LEVELS).fill(0.1));
      return 'started';
    } catch {
      await release();
      return 'failed';
    }
  }, [recorder, release]);

  const finish = useCallback(async () => {
    const take = await stop();
    if (!take) return null;
    if (take.durationMs < MIN_VOICE_MS) {
      void FileSystem.deleteAsync(take.uri, { idempotent: true }).catch(() => undefined);
      return null;
    }
    return take;
  }, [stop]);

  const cancel = useCallback(async () => {
    const take = await stop();
    if (take) void FileSystem.deleteAsync(take.uri, { idempotent: true }).catch(() => undefined);
  }, [stop]);

  // Leaving the screen mid-recording throws the recording away.
  useEffect(
    () => () => {
      if (live.current) void cancel();
    },
    [cancel],
  );

  return {
    recording: status.isRecording,
    durationMs: status.durationMillis,
    levels,
    start,
    finish,
    cancel,
  };
}
