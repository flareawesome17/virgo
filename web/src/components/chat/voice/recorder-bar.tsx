'use client';

import { useEffect, useRef, type Ref } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { MAX_VOICE_MS, voiceClock } from '@/api';
import {
  discardRecording,
  sendRecording,
  useRecorderMeter,
  type RecorderPhase,
} from '@/components/chat/voice/voice-recorder';

/** From here the clock turns red: ten seconds before it stops and sends by itself. */
const NEAR_LIMIT_MS = MAX_VOICE_MS - 10_000;

/**
 * The composer while a voice note is recording (board ChatVoiceRecord, for a
 * keyboard and a mouse): a red dot, the clock, the live bars, Discard and
 * Send. Escape discards. Only this redraws as the clock moves.
 */
export function RecorderBar({ phase, rowRef }: { phase: RecorderPhase; rowRef?: Ref<HTMLDivElement> }) {
  const { elapsedMs, levels } = useRecorderMeter();
  const sendRef = useRef<HTMLButtonElement>(null);
  const discardRef = useRef<HTMLButtonElement>(null);
  const recording = phase === 'recording';

  // The mic button is gone: focus goes to what is there now — Discard while
  // the browser asks for the microphone, then Send.
  useEffect(() => {
    (recording ? sendRef : discardRef).current?.focus();
  }, [recording]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      discardRecording();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      ref={rowRef}
      role="group"
      aria-label="Recording a voice note"
      className="flex shrink-0 items-center gap-3 border-t p-3"
    >
      <span className="sr-only" role="status">
        {recording ? 'Recording. Escape discards it.' : 'Waiting for the microphone'}
      </span>
      <span
        aria-hidden
        className={cn(
          'ml-1 size-2.5 shrink-0 rounded-full',
          recording ? 'bg-destructive motion-safe:animate-pulse' : 'bg-muted-foreground/40',
        )}
      />
      <span
        aria-hidden
        className={cn(
          'w-10 shrink-0 text-[15px] font-bold tabular-nums',
          elapsedMs >= NEAR_LIMIT_MS && 'text-destructive',
        )}
      >
        {voiceClock(elapsedMs)}
      </span>
      {recording ? (
        <span aria-hidden className="flex h-7 min-w-0 flex-1 items-center gap-[2px] overflow-hidden">
          {levels.map((level, i) => (
            <span
              key={i}
              className="w-[3px] shrink-0 rounded-full bg-primary"
              style={{ height: `${Math.max(3, Math.round(level * 28))}px` }}
            />
          ))}
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          Allow the microphone to start recording
        </span>
      )}
      <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">
        Esc to discard · up to 2 minutes
      </span>
      <Button
        ref={discardRef}
        size="icon"
        variant="ghost"
        onClick={discardRecording}
        aria-label="Discard the voice note"
        title="Discard"
      >
        <Trash2 className="size-4" />
      </Button>
      <Button
        ref={sendRef}
        size="icon"
        onClick={sendRecording}
        disabled={!recording}
        aria-label="Send the voice note"
        title="Send"
      >
        <Send className="size-4" />
      </Button>
    </div>
  );
}
