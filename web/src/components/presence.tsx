'use client';

import { cn } from '@/lib/utils';
import { lastSeenLabel, usePresence, useTypingIn, typingLabel } from '@/lib/presence-store';

/**
 * A dot on an avatar showing whether somebody is connected.
 *
 * Positioned absolutely, so the parent needs `relative`. Rendered as a ring
 * against the surface colour rather than a bare circle — a green dot on a
 * photograph is unreadable without something separating it from the image.
 */
export function PresenceDot({
  userId,
  className,
  /** Matches the surface it sits on, so the ring reads as a cut-out. */
  ringClass = 'ring-background',
}: {
  userId: string | null | undefined;
  className?: string;
  ringClass?: string;
}) {
  const { online } = usePresence(userId);
  if (!userId || !online) return null;

  return (
    <span
      // Decorative: the same fact is in the text beside it wherever it matters.
      aria-hidden
      className={cn(
        'absolute right-0 bottom-0 size-3 rounded-full bg-success ring-2',
        ringClass,
        className,
      )}
    />
  );
}

/**
 * "Online" or "Last seen 20m ago", for a conversation header.
 *
 * Falls back to the click-for-info line on a group, where presence is not a
 * single fact.
 */
export function PresenceLine({
  userId,
  fallback = 'Click for info',
}: {
  userId: string | null | undefined;
  fallback?: string;
}) {
  const { online, lastSeenAt } = usePresence(userId);
  if (!userId) return <span className="text-xs text-muted-foreground">{fallback}</span>;

  return (
    <span
      className={cn('text-xs', online ? 'font-medium text-success' : 'text-muted-foreground')}
    >
      {online ? 'Online' : lastSeenLabel(lastSeenAt)}
    </span>
  );
}

/**
 * The three-dot bubble at the foot of a thread.
 *
 * Renders nothing when nobody is typing, so it costs no space in the common
 * case and the message list does not jump as it appears — it sits below the
 * last message rather than between messages.
 */
export function TypingIndicator({
  conversationId,
  meId,
  className,
}: {
  conversationId: string | null | undefined;
  meId?: string | null;
  className?: string;
}) {
  const names = useTypingIn(conversationId, meId);
  if (names.length === 0) return null;

  return (
    <div className={cn('flex items-center gap-2 px-1 py-2', className)}>
      <span className="flex items-center gap-1 rounded-2xl bg-muted px-3 py-2.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70"
            // Staggered so it reads as a wave rather than three dots blinking
            // in unison.
            style={{ animationDelay: `${i * 140}ms`, animationDuration: '1s' }}
          />
        ))}
      </span>
      <span className="text-xs text-muted-foreground">{typingLabel(names)}</span>
    </div>
  );
}

/** A one-line "Ana is typing…" for a conversation row in the list. */
export function TypingPreview({
  conversationId,
  meId,
}: {
  conversationId: string;
  meId?: string | null;
}) {
  const names = useTypingIn(conversationId, meId);
  if (names.length === 0) return null;
  return (
    <span className="truncate text-xs font-medium text-primary">
      {typingLabel(names)}
    </span>
  );
}
