import type { CSSProperties, ReactNode } from 'react';
import { BookUser, MessageCircle, Search, type LucideIcon } from 'lucide-react';
import { WHEN } from '../data/story';
import { CHAT_CARDS, type ChatCard } from '../data/strings/ch1';
import { LockScreen, lockDate, lockTime } from '../frames/lock-screen';
import { Perspective } from '../frames/perspective';
import { Plate } from './plate';

/**
 * Ch1's mess: the same question in three group chats, a group that keeps
 * talking about everything else, "Seen by 14", a story reply left on Seen,
 * and a contacts search for a Kenn she half remembers — piling up on a lock
 * screen from 11:42 to 11:57 PM.
 *
 * Generic chrome on purpose: no app's name, colours or layout (no brand's
 * bubble colour, no brand's icon), and none of it is Virgo. The chapter's
 * footnote says so. Text sits on warm greys so nothing reads as a product.
 *
 * Depth (storyboard §1.13): the cards are a deck seen from one eye. The
 * newest card faces the reader at z = 0; every older one sits a step further
 * back on z and a step up, so its header peeks over the card in front, with
 * a small twist so the pile reads as a pile, and a little darker. Perspective
 * does the shrinking (about 0.96× a step), not a scale. Every card is the
 * same height, so the peeks line up whatever each card says.
 *
 * One DOM for every count. Cards that have not landed yet sit at the entry
 * pose (below and in front, transparent), so a Phase 4 island moves only
 * `transform` and `opacity` (and each fog layer's opacity):
 * `chatCardPose(depth)` gives any card's rest pose, `chatCardPose(null)` the
 * entry pose. The lock screen's clock is the newest card's time
 * (`chatStackClock`): write it into `lock-time` (and the phone's
 * `status-time`) as a counter.
 *
 * States: a count, 0–7 (0–5 on the 5-card deck phones get), or 'frozen' —
 * the full pile under a `#161311` overlay at 60%. The default is the full
 * pile with no overlay, which is what a static reader sees.
 *
 * Fills `PhoneFrame`'s content area (absolute inset-0); pass
 * `screen={LOCK_WALLPAPER}` to the phone.
 *
 * Parts: chat-stack (data-state, data-count), perspective (the pile: the
 * cards are its direct children, so they share its eye), chat-card-1…7
 * (data-kind, data-on, data-depth), chat-card-1…7-fog, freeze; plus the lock
 * screen's own (lock-time, lock-date…).
 */

export type ChatStackCount = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type ChatStackState = ChatStackCount | 'frozen';
/** Desktop shows the 7-card deck; phones the 5 cards marked `mobile`. */
export type ChatDeck = 5 | 7;

/** The pile's geometry, in px. Shared with Phase 4 so its poses match the rest poses. */
export const CHAT_PILE = {
  /** Every card's height. */
  height: 162,
  /** How much of each older card shows above the one in front. */
  peek: 30,
  /** How far back on z each older card sits. */
  depth: 44,
  /** The twist and sideways nudge per depth: a pile, not a stack. */
  twist: [0, -1.6, 1.2, -1, 1.4, -1.2, 0.9],
  nudge: [0, -3, 4, -2, 3, -4, 2],
  /** How much each step back darkens, through the card's fog layer (cards stay opaque). */
  fog: 0.11,
  fogMax: 0.62,
} as const;

export function chatDeck(cards: ChatDeck = 7): readonly ChatCard[] {
  return cards === 7 ? CHAT_CARDS : CHAT_CARDS.filter((c) => c.mobile);
}

function landed(state: ChatStackState, deck: readonly ChatCard[]): number {
  return state === 'frozen' ? deck.length : Math.max(0, Math.min(state, deck.length));
}

/** The lock screen's clock in a state: the newest card's time ("11:57"), 11:42 before any. */
export function chatStackClock(state: ChatStackState = 7, cards: ChatDeck = 7): string {
  const deck = chatDeck(cards);
  const n = landed(state, deck);
  return lockTime(n === 0 ? WHEN.panic : deck[n - 1].at);
}

/**
 * A card's pose. `depth` 0 is the newest card, facing the reader; each step
 * back is further on z, higher, twisted and darker. `null` is the entry pose
 * of a card that has not landed: below, in front, transparent.
 *
 * `opacity` goes on `chat-card-N`, `fog` on `chat-card-N-fog`. Cards stay
 * opaque once landed, so nothing behind one shows through it; the fog
 * darkens it as it recedes.
 */
export function chatCardPose(depth: number | null): { transform: string; opacity: number; fog: number } {
  if (depth === null) return { transform: 'translate3d(0px, 56px, 80px) rotate(0deg)', opacity: 0, fog: 0 };
  const k = Math.max(0, depth);
  const i = Math.min(k, CHAT_PILE.twist.length - 1);
  return {
    transform: `translate3d(${CHAT_PILE.nudge[i]}px, ${-k * CHAT_PILE.peek}px, ${-k * CHAT_PILE.depth}px) rotate(${CHAT_PILE.twist[i]}deg)`,
    opacity: 1,
    fog: Math.round(Math.min(CHAT_PILE.fogMax, k * CHAT_PILE.fog) * 100) / 100,
  };
}

// ─── The cards ───────────────────────────────────────────────────────────

const ICON: Record<ChatCard['kind'], LucideIcon> = {
  thread: MessageCircle,
  list: MessageCircle,
  notice: MessageCircle,
  story: MessageCircle,
  search: BookUser,
};

/** A neutral glyph tile: the generic stand-in for an app's icon. */
function Glyph({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-[#4A403A] text-white/85">
      <Icon aria-hidden size={12} strokeWidth={2.25} />
    </span>
  );
}

/** Your own message: a warm grey bubble, tail lower right. */
function Mine({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`rounded-[18px] rounded-br-[6px] bg-[#4D4239] px-3 py-2 text-[14px] leading-[19px] text-[#F7F2ED] ${className}`}>
      {children}
    </p>
  );
}

/** A name, or a contact, as a plain initial circle (generic: no app's tint). */
function Initials({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-white/75"
      style={{ width: size, height: size }}
    >
      {children}
    </span>
  );
}

function Body({ card }: { card: ChatCard }) {
  switch (card.kind) {
    case 'thread':
      return (
        <div className="mt-auto flex flex-col gap-1.5">
          {/* The group's last word before hers: about something else. */}
          <p className="max-w-[82%] self-start truncate rounded-[18px] rounded-bl-[6px] bg-white/[0.08] px-3 py-[7px] text-[13px] leading-[18px] text-white/75">
            {card.incoming}
          </p>
          <div className="flex flex-col items-end gap-1">
            <Mine className="max-w-[86%]">{card.mine}</Mine>
            <span className="text-[11px] font-medium leading-[14px] text-white/60">{card.receipt}</span>
          </div>
        </div>
      );
    case 'list':
      return (
        <div className="mt-1.5 flex flex-col gap-[3px]">
          {card.rows.map((r) => (
            <div key={r.name} className="flex items-center gap-2.5">
              <Initials>{r.initials}</Initials>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-[15px]">{r.name}</span>
                  <span className="shrink-0 text-[11px] leading-[15px] tabular-nums text-white/45">{r.time}</span>
                </div>
                <p className="truncate text-[12px] leading-[15px] text-white/60">{r.preview}</p>
              </div>
            </div>
          ))}
        </div>
      );
    case 'notice':
      return (
        <div className="mt-1.5">
          <p className="text-[15px] font-semibold leading-5">{card.summary}</p>
          <div className="mt-1 flex flex-col">
            {card.preview.map((line) => (
              <p key={line} className="truncate text-[13px] leading-[18px] text-white/75">
                {line}
              </p>
            ))}
          </div>
        </div>
      );
    case 'story':
      return (
        <div className="mt-2 flex gap-3">
          {/* The story itself: an abstract plate, never a person. */}
          <Plate seed={14} aspect="fill" className="h-[66px] w-11 shrink-0 rounded-[8px]" />
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <span className="text-[12px] leading-4 text-white/55">{card.label}</span>
            <Mine>{card.mine}</Mine>
            <span className="self-end text-[11px] font-medium leading-[14px] text-white/60">{card.receipt}</span>
          </div>
        </div>
      );
    case 'search':
      return (
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="flex h-8 items-center gap-2 rounded-full bg-white/10 px-3 text-[14px]">
            <Search aria-hidden size={14} className="shrink-0 text-white/55" />
            <span className="text-white">{card.query}</span>
            {/* The caret, mid-search. */}
            <span className="-ml-1.5 h-[17px] w-[1.5px] rounded-full bg-[#F7F2ED]/80" />
          </div>
          {card.results.map((name) => {
            const hit = name.slice(0, card.query.length);
            return (
              <div key={name} className="flex items-center gap-2.5 px-0.5">
                <Initials>{name.charAt(0)}</Initials>
                <p className="min-w-0 flex-1 truncate text-[14px] leading-[22px] text-white/70">
                  <span className="font-semibold text-white">{hit}</span>
                  {name.slice(hit.length)}
                </p>
              </div>
            );
          })}
        </div>
      );
  }
}

function Card({ card, index, depth }: { card: ChatCard; index: number; depth: number | null }) {
  const pose = chatCardPose(depth);
  const style: CSSProperties = { height: CHAT_PILE.height, transform: pose.transform, opacity: pose.opacity };
  const part = `chat-card-${index + 1}`;
  return (
    <div
      data-part={part}
      data-kind={card.kind}
      data-on={depth === null ? undefined : ''}
      data-depth={depth ?? undefined}
      className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-[20px] bg-[#2B2420] px-3.5 pb-3 pt-2.5 text-left text-[#F7F2ED] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07),inset_0_1px_0_rgba(255,255,255,0.06),0_14px_30px_-14px_rgba(0,0,0,0.75)]"
      style={style}
    >
      <div className="flex items-center gap-2">
        <Glyph icon={ICON[card.kind]} />
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold leading-5 text-white/80">{card.title}</span>
        <span className="shrink-0 text-[12px] leading-5 tabular-nums text-white/50">{card.time}</span>
      </div>
      <Body card={card} />
      {/* Depth haze: darkens the card as it recedes, without letting the cards behind show through. */}
      <span
        data-part={`${part}-fog`}
        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[#0c0908]"
        style={{ opacity: pose.fog }}
      />
    </div>
  );
}

export function ChatCardStack({
  state,
  cards = 7,
  className = '',
}: {
  /** How many cards have landed, or 'frozen'. Defaults to the full deck. */
  state?: ChatStackState;
  cards?: ChatDeck;
  className?: string;
}) {
  const deck = chatDeck(cards);
  const resolved: ChatStackState = state ?? (deck.length as ChatStackCount);
  const n = landed(resolved, deck);
  const frozen = resolved === 'frozen';
  const pileHeight = CHAT_PILE.height + (deck.length - 1) * CHAT_PILE.peek;

  return (
    <div
      aria-hidden
      data-part="chat-stack"
      data-state={String(resolved)}
      data-count={n}
      className={`absolute inset-0 ${className}`}
    >
      <LockScreen time={chatStackClock(resolved, cards)} date={lockDate(WHEN.panic)}>
        <Perspective className="relative w-full" origin="50% 0%">
          {/* A sized box for the absolutely placed cards; Perspective's own children are the cards. */}
          <div aria-hidden className="w-full" style={{ height: pileHeight }} />
          {deck.map((card, i) => (
            <Card key={`${card.kind}-${card.at}`} card={card} index={i} depth={i < n ? n - 1 - i : null} />
          ))}
        </Perspective>
      </LockScreen>
      {/* Up over the status bar too: the whole screen stops. The phone's screen clips the overshoot. */}
      <div
        data-part="freeze"
        className="pointer-events-none absolute inset-x-0 -top-16 bottom-0 z-40 bg-[#161311]"
        style={{ opacity: frozen ? 0.6 : 0 }}
      />
    </div>
  );
}
