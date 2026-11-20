'use client';

import { useMemo, type KeyboardEvent, type MouseEvent } from 'react';
import { Loader2, Pause, Play, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { attachmentLink } from '@/hooks/useChatFiles';
import {
  voiceBars,
  voiceClock,
  voiceLength,
  voiceRateLabel,
  voiceSpokenLength,
  type ChatAttachment,
  type VoiceRate,
} from '@/api';
import { retryUpload, useLocalUpload } from '@/components/chat/files/send-queue';
import {
  cycleVoiceRate,
  pauseVoice,
  playVoice,
  seekVoice,
  useVoicePlayback,
} from '@/components/chat/voice/voice-player';

/*
 * A voice note in the thread (board ChatVoicePlay, the same on the web).
 *
 * Yours: your colour, a light play circle, light bars and the length. Theirs:
 * a card, a filled play circle, and bars that fill with your colour as it
 * plays. While one is playing or paused part-way it says "0:21 / 0:48" under
 * the bars and offers the speed; otherwise it says how long it is.
 *
 * Nothing loads until play (weak-signal rule 6). Your own note plays from
 * this computer's copy while it is still here, so it never downloads.
 */

/** The bars a bubble has room for at 280 px. */
const BARS = 30;
/** How far the arrow keys move along a note. */
const STEP_MS = 5000;

/** What a voice note's quote reads: "Voice note (0:32)". */
export function voiceQuote(durationMs: number | null | undefined): string {
  return durationMs ? `Voice note (${voiceLength(durationMs)})` : 'Voice note';
}

/** "1.5 times", for a screen reader. */
function rateSpoken(rate: VoiceRate): string {
  return rate === 1 ? 'normal' : `${rate} times`;
}

/** The parts of an attachment a voice bubble draws. */
type VoiceModel = Pick<ChatAttachment, 'id' | 'status' | 'url' | 'durationMs' | 'waveform'>;

export function VoiceNote({
  conversationId,
  messageId,
  note,
  mine,
  className,
}: {
  conversationId: string;
  /** Null while it is still only on this computer: the row under it says how it is going. */
  messageId: string | null;
  note: VoiceModel;
  mine: boolean;
  className?: string;
}) {
  const local = useLocalUpload(note.id);
  const playback = useVoicePlayback(note.id);
  const localUrl = local?.file.previewUrl ?? null;
  const known = note.durationMs ?? local?.file.durationMs ?? null;
  const durationMs = (playback.id ? playback.durationMs : 0) || known || 0;
  const active = playback.id !== null && (playback.playing || playback.loading || playback.positionMs > 0);
  const stuck = note.status === 'failed' || local?.status === 'failed';
  const retryable = !!local && stuck;
  // Yours plays from this computer's copy before it has arrived.
  const playable = !stuck && (note.status === 'ready' || !!localUrl);
  const bars = useMemo(() => voiceBars(note.waveform, BARS), [note.waveform]);
  const progress = active && durationMs > 0 ? Math.min(1, playback.positionMs / durationMs) : 0;
  const whose = mine ? 'your voice note' : 'voice note';
  const spoken = voiceSpokenLength(durationMs);

  const freshUrl = async (): Promise<string | null> => {
    if (localUrl) return localUrl;
    if (!messageId) return null;
    const { url } = await attachmentLink(conversationId, messageId, note.id);
    return url;
  };

  const play = (startMs?: number) =>
    playVoice({
      id: note.id,
      url: localUrl ?? (note.status === 'ready' ? note.url : null),
      durationMs: known,
      freshUrl,
      startMs,
    });

  /** What it says under the bars, when there is something to say. */
  let line: string | null = null;
  if (playback.failed) line = "Couldn't play · Try again";
  else if (active) line = `${voiceClock(playback.positionMs)} / ${voiceLength(durationMs)}`;
  else if (retryable) line = "Didn't send · Click to retry";
  else if (note.status === 'failed') line = "Didn't arrive";
  else if (note.status === 'uploading') {
    if (!mine) line = 'Arriving…';
    else if (!local) line = 'Sending…';
    // Before the message exists, the row under the bubble says it.
    else if (messageId) {
      line =
        local.status === 'waiting'
          ? 'Waiting for a connection'
          : local.status === 'uploading'
            ? `Sending… ${Math.round(local.progress * 100)}%`
            : 'Sending…';
    }
  }

  const seekTo = (ms: number) => {
    if (playback.id === note.id) seekVoice(note.id, ms);
    else play(ms);
  };

  const onBarsClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!playable) return;
    // On the waveform, not the bubble behind it.
    event.stopPropagation();
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = box.width > 0 ? Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) : 0;
    if (durationMs > 0) seekTo(fraction * durationMs);
    else if (!playback.playing) play();
  };

  const onBarsKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!active || durationMs <= 0) return;
    const at = playback.positionMs;
    let to: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') to = at + STEP_MS;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') to = at - STEP_MS;
    else if (event.key === 'Home') to = 0;
    else if (event.key === 'End') to = durationMs;
    if (to === null) return;
    event.preventDefault();
    event.stopPropagation();
    seekVoice(note.id, Math.max(0, Math.min(durationMs, to)));
  };

  const circle = cn(
    'grid size-10 shrink-0 place-items-center rounded-full transition-opacity',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    mine
      ? 'bg-primary-foreground text-primary focus-visible:ring-offset-primary'
      : 'bg-action text-action-foreground focus-visible:ring-offset-card',
    'disabled:cursor-default disabled:opacity-50',
  );

  return (
    <div
      className={cn(
        'flex w-[280px] max-w-full items-center gap-2.5 rounded-2xl py-2 pl-2 pr-2.5',
        mine
          ? 'rounded-br-md bg-primary text-primary-foreground'
          : 'rounded-bl-md border bg-card text-card-foreground',
        className,
      )}
    >
      {retryable ? (
        <button
          type="button"
          onClick={() => retryUpload(note.id)}
          aria-label="Send the voice note again"
          title="Try again"
          className={circle}
        >
          <RotateCcw className="size-4" aria-hidden />
        </button>
      ) : playback.failed ? (
        <button
          type="button"
          onClick={() => play()}
          aria-label={`Try playing ${whose} again, ${spoken}`}
          title="Try again"
          className={circle}
        >
          <RotateCcw className="size-4" aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          disabled={!playable}
          onClick={(event) => {
            event.stopPropagation();
            if (playback.playing || playback.loading) pauseVoice();
            else play();
          }}
          aria-label={
            !playable
              ? `${mine ? 'Your voice note' : 'Voice note'}, ${spoken}${line ? `, ${line}` : ''}`
              : `${playback.playing || playback.loading ? 'Pause' : 'Play'} ${whose}, ${spoken}`
          }
          aria-busy={playback.loading || undefined}
          className={circle}
        >
          {playback.loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : playback.playing ? (
            <Pause className="size-4" fill="currentColor" strokeWidth={0} aria-hidden />
          ) : (
            <Play className="ml-0.5 size-4" fill="currentColor" aria-hidden />
          )}
        </button>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div
          // A slider while it is the note in hand; before that, a click on
          // the waveform plays from there and the button is the way in.
          role={active ? 'slider' : undefined}
          tabIndex={active ? 0 : undefined}
          aria-hidden={active ? undefined : true}
          aria-label={active ? `Position in ${whose}` : undefined}
          aria-valuemin={active ? 0 : undefined}
          aria-valuemax={active ? Math.round(durationMs / 1000) : undefined}
          aria-valuenow={active ? Math.round(playback.positionMs / 1000) : undefined}
          aria-valuetext={
            active ? `${voiceClock(playback.positionMs)} of ${voiceLength(durationMs)}` : undefined
          }
          onClick={onBarsClick}
          onKeyDown={onBarsKey}
          className={cn(
            'flex h-[26px] items-center justify-between gap-px rounded-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            playable && 'cursor-pointer',
          )}
        >
          {bars.map((level, i) => {
            const played = active && (i + 0.5) / bars.length <= progress;
            return (
              <span
                key={i}
                className={cn(
                  'w-[3px] shrink-0 rounded-full',
                  mine
                    ? played
                      ? 'bg-primary-foreground'
                      : 'bg-primary-foreground/55'
                    : played
                      ? 'bg-primary'
                      : 'bg-muted-foreground/30',
                )}
                style={{ height: `${Math.max(3, Math.round(level * 26))}px` }}
              />
            );
          })}
        </div>
        {line &&
          (playback.failed ? (
            <button
              type="button"
              onClick={() => play()}
              className={cn(
                'self-start text-left text-xs leading-4 underline-offset-2 hover:underline',
                mine ? 'text-primary-foreground/85' : 'text-destructive',
              )}
            >
              {line}
            </button>
          ) : retryable ? (
            <button
              type="button"
              onClick={() => retryUpload(note.id)}
              className={cn(
                'self-start text-left text-xs leading-4 underline-offset-2 hover:underline',
                mine ? 'text-primary-foreground/85' : 'text-destructive',
              )}
            >
              {line}
            </button>
          ) : (
            <span
              className={cn(
                'truncate text-xs leading-4 tabular-nums',
                mine ? 'text-primary-foreground/80' : 'text-muted-foreground',
              )}
            >
              {line}
            </span>
          ))}
      </div>

      {active ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            cycleVoiceRate();
          }}
          aria-label={`Playback speed, ${rateSpoken(playback.rate)}`}
          title="Playback speed"
          className={cn(
            'h-7 min-w-10 shrink-0 rounded-full px-2 text-xs font-bold tabular-nums transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            mine
              ? 'bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30'
              : 'bg-muted text-foreground hover:bg-accent',
          )}
        >
          {voiceRateLabel(playback.rate)}
        </button>
      ) : (
        durationMs > 0 && (
          <span className="min-w-10 shrink-0 text-right text-[13px] font-semibold tabular-nums">
            {voiceLength(durationMs)}
          </span>
        )
      )}
    </div>
  );
}
