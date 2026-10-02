import type { ReactNode } from 'react';
import { ArrowLeft, Check, CheckCheck, Clock, Info, Send } from 'lucide-react';
import { THREAD } from '../data/strings/ch3';
import { Faces } from './booking-badge';

/**
 * A chat on the phone (storyboard Ch3, B10 GroupThread / Bubble): "the group
 * thread 'Reyes & Santos crew', text only: Mika, '@Kenn SDE by 9 PM?'; Kenn,
 * replying, 'Sure.'; the read ticks fill."
 *
 * Follows `mobile/app/(app)/chat/[id]/index.tsx`, dark:
 *
 * - `ChatHeader`: 44 px back and info tiles (16 px radius, card), the title
 *   16 px bold, and for a group the members underneath, 12 px muted, as the
 *   API orders them (by name, the viewer included). A direct chat shows the
 *   other person's name; its online / last-seen line is left out, as the
 *   brief keeps presence off the page.
 * - `Bubble`: 16 px radius, 14 px text, at most 80% wide. Yours on the action
 *   fill `#A85D35` with white; theirs on the card colour, with the sender's
 *   name above in a group. A reply quote sits inside, with a 2 px rail. An
 *   @mention is bold: `#FFE6D5` on your bubble, `#D18A5A` on theirs. Your
 *   bubble's footer carries the time and the delivery mark — a clock while
 *   sending, one tick when sent, two dim ticks when delivered to everyone,
 *   two solid ticks when everyone has read it — and, in a group, how many
 *   have read it.
 * - `Composer`: the field (16 px radius, `#A89489` placeholder) and the 44 px
 *   send button, muted while the field is empty.
 * - `ChatScreen` stacks the three; the thread is bottom-anchored, as the
 *   app's inverted list is.
 *
 * Text only: no images, no voice notes, no typing or presence indicator.
 *
 * Deviations: the times, the read count and the quote's sender are 11 px
 * (the app draws 10 px), because text is never under 11 px on the page.
 *
 * Parts (GroupThread): chat, chat-header, thread, bubble-ask (data-state),
 * ask-footer (faces: sending / time), ask-ticks (faces: sending, sent,
 * delivered, read), ask-seen (faces: 1, 3), bubble-reply, composer.
 */

const MINE_MENTION = '#FFE6D5';
const THEIR_MENTION = '#D18A5A';

/** The body with every @name of a participant picked out, longest name first. */
function withMentions(body: string, mine: boolean, names: readonly string[]): ReactNode {
  const sorted = [...names].sort((x, y) => y.length - x.length);
  const escaped = sorted.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!escaped.length || !body.includes('@')) return body;
  const parts = body.split(new RegExp(`(@(?:${escaped.join('|')}))`, 'g'));
  const isMention = new Set(sorted.map((n) => `@${n}`));
  return parts.map((part, i) =>
    isMention.has(part) ? (
      <strong key={i} className="font-bold" style={{ color: mine ? MINE_MENTION : THEIR_MENTION }}>
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function ChatHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div data-part="chat-header" className="flex items-center gap-3 border-b border-[#2A2522] px-5 pb-3 pt-2">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-[16px] bg-[#1E1B18]">
        <ArrowLeft aria-hidden size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-bold leading-[22px]">{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-[12px] text-[#A08E84]">{subtitle}</span>}
      </span>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-[16px] bg-[#1E1B18]">
        <Info aria-hidden size={17} />
      </span>
    </div>
  );
}

export function Composer({ placeholder }: { placeholder: string }) {
  return (
    <div
      data-part="composer"
      className="flex items-end gap-2 border-t border-[#2A2522] bg-[#161311] px-4 pb-[30px] pt-2"
    >
      <span className="min-w-0 flex-1 truncate rounded-[16px] bg-[#1E1B18] px-4 py-2.5 text-[14px] leading-5 text-[#A89489]">
        {placeholder}
      </span>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#2A2522]">
        <Send aria-hidden size={17} className="text-[#A08E84]" />
      </span>
    </div>
  );
}

export function ChatScreen({
  title,
  subtitle,
  placeholder,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  placeholder: string;
  /** Bubbles and cards, oldest first. */
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-part="chat" className={`flex h-full min-h-0 flex-col bg-[#161311] text-[#F2EDE8] ${className}`}>
      <ChatHeader title={title} subtitle={subtitle} />
      {/* Bottom-anchored: an inverted list keeps the newest message on the
          composer, and older ones leave by the top. */}
      <div data-part="thread" className="flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-hidden p-4">
        {children}
      </div>
      <Composer placeholder={placeholder} />
    </div>
  );
}

export type Delivery = 'sending' | 'sent' | 'delivered' | 'read';

const TICK: Record<Delivery, ReactNode> = {
  sending: <Clock aria-hidden size={11} color="#FFFFFF88" />,
  sent: <Check aria-hidden size={12} color="#FFFFFF88" />,
  delivered: <CheckCheck aria-hidden size={12} color="#FFFFFF88" />,
  read: <CheckCheck aria-hidden size={12} color="#FFFFFF" />,
};

export function Bubble({
  mine,
  from,
  body,
  time,
  reply,
  delivery = 'read',
  seen,
  seenFaces = [],
  mentionable = [],
  part,
  className = '',
}: {
  mine: boolean;
  /** The sender's name, drawn above their bubble in a group. */
  from?: string;
  body: string;
  time: string;
  /** What this message answers. */
  reply?: { from: string; body: string };
  /** Yours only. Every mark is drawn in place; this picks the one shown. */
  delivery?: Delivery;
  /** Yours, in a group: how many have read it (0 draws none). */
  seen?: number;
  /** The read counts a stage may step through, drawn in place. */
  seenFaces?: readonly number[];
  /** Names an @mention can match. */
  mentionable?: readonly string[];
  /** Prefix for this bubble's parts: `<part>`, `<part>-footer`, `<part>-ticks`, `<part>-seen`. */
  part?: string;
  className?: string;
}) {
  const sending = mine && delivery === 'sending';
  const counts = [...new Set([...seenFaces, ...(seen ? [seen] : [])])].sort((x, y) => x - y);

  return (
    <div
      data-part={part}
      data-state={mine ? delivery : undefined}
      className={`flex flex-col ${mine ? 'items-end' : 'items-start'} ${className}`}
    >
      {!mine && from && <span className="mb-0.5 ml-1 text-[11px] text-[#A08E84]">{from}</span>}
      <div
        className={`max-w-[80%] rounded-[16px] px-3.5 py-2.5 ${mine ? 'bg-[#A85D35]' : 'bg-[#1E1B18]'}`}
        // An outgoing message sits a little faded until the server has it.
        style={sending ? { opacity: 0.85 } : undefined}
      >
        {reply && (
          <div
            // The phone's rounded-lg: the theme's radius × 1.5.
            className="mb-1.5 rounded-[21px] px-2 py-1.5"
            style={{
              background: mine ? '#00000022' : '#00000033',
              borderLeft: `2px solid ${mine ? '#FFFFFF99' : '#B66A40'}`,
            }}
          >
            <p className={`text-[11px] font-bold leading-[14px] ${mine ? 'text-white/80' : 'text-[#D18A5A]'}`}>
              {reply.from}
            </p>
            <p className={`truncate text-[11px] leading-[15px] ${mine ? 'text-white/70' : 'text-[#A08E84]'}`}>
              {reply.body}
            </p>
          </div>
        )}
        <p className={`text-[14px] leading-5 ${mine ? 'text-white' : 'text-[#F2EDE8]'}`}>
          {withMentions(body, mine, mentionable)}
        </p>
        <div className="mt-1 flex items-center gap-1">
          {mine ? (
            <>
              <Faces
                part={part && `${part}-footer`}
                on={sending ? 'sending' : 'time'}
                faces={{
                  sending: <span className="text-[11px] leading-[14px] text-white/60">{THREAD.sending}</span>,
                  time: <span className="text-[11px] leading-[14px] text-white/60">{time}</span>,
                }}
              />
              <Faces
                part={part && `${part}-ticks`}
                on={delivery}
                align="center"
                className="h-3 w-3 items-center"
                faces={TICK}
              />
              {counts.length > 0 && (
                <Faces
                  part={part && `${part}-seen`}
                  on={String(seen ?? 0)}
                  faces={Object.fromEntries(
                    counts.map((n) => [
                      String(n),
                      <span key={n} className="text-[11px] leading-[14px] tabular-nums text-white/70">
                        {n}
                      </span>,
                    ]),
                  )}
                />
              )}
            </>
          ) : (
            <span className="text-[11px] leading-[14px] text-[#A08E84]">{time}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** The thread's beats: Mika's message going out, read, answered. */
export type ThreadState = 'sending' | 'sent' | 'delivered' | 'replied' | 'read';

const DELIVERY: Record<ThreadState, Delivery> = {
  sending: 'sending',
  sent: 'sent',
  delivered: 'delivered',
  // Kenn has read it; it has reached Ernie and Bea but they have not.
  replied: 'delivered',
  // Every other member has read it.
  read: 'read',
};

const SEEN: Record<ThreadState, number> = { sending: 0, sent: 0, delivered: 0, replied: 1, read: THREAD.others };

/**
 * The crew's group thread, from Mika's phone. Kenn's reply is drawn only once
 * he has sent it (`replied`, `read`); before that the thread is the one
 * message, as the screen would show it.
 */
export function GroupThread({ state = 'read', className = '' }: { state?: ThreadState; className?: string }) {
  const answered = state === 'replied' || state === 'read';
  return (
    <ChatScreen
      title={THREAD.title}
      subtitle={THREAD.members}
      placeholder={THREAD.placeholder}
      className={className}
    >
      <Bubble
        part="bubble-ask"
        mine
        body={THREAD.ask.body}
        time={THREAD.ask.time}
        delivery={DELIVERY[state]}
        seen={SEEN[state]}
        seenFaces={[1, THREAD.others]}
        mentionable={THREAD.mentionable}
      />
      {answered && (
        <Bubble
          part="bubble-reply"
          mine={false}
          from={THREAD.reply.from}
          body={THREAD.reply.body}
          time={THREAD.reply.time}
          reply={{ from: THREAD.ask.from, body: THREAD.ask.body }}
          mentionable={THREAD.mentionable}
        />
      )}
    </ChatScreen>
  );
}
