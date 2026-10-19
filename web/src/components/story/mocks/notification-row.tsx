import type { ReactNode } from 'react';
import {
  Bell,
  BriefcaseBusiness,
  Calendar,
  CreditCard,
  FileText,
  Gift,
  Heart,
  LifeBuoy,
  MessageCircle,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { TOPIC_CATEGORY, TOPIC_ICON, type Category, type Topic } from '../data/strings/common';

/**
 * One notification, as the app lists it — static, for the story.
 *
 * - `platform="web"` follows `web/src/components/notification-bell.tsx`
 *   (NotificationRow + TopicIcon): px-4 py-3, a 32 px icon circle tinted at
 *   /15 per category, 14 px title (semibold when unread), 11 px tabular time,
 *   12 px body clamped to two lines, a 6 px unread dot.
 * - `platform="phone"` follows `mobile/app/(app)/notifications/index.tsx`
 *   (Row + NotificationIcon): px-3.5 py-3, a 36 px circle at 1F alpha with a
 *   17 px icon, 15 px title, 12 px time, 13 px body, an 8 px dot. The phone
 *   tints albums with the brand accent where the web uses chart-3.
 *
 * The icon and category come from the topic, through the app's own tables
 * (copied into strings/common.ts and checked against the app).
 *
 * Parts: notification (data-state), notification-icon, notification-title,
 * notification-time, notification-body, unread-dot.
 */

export type NotificationRowState = 'unread' | 'read';

const ICONS: Record<(typeof TOPIC_ICON)[Topic], LucideIcon> = {
  UserPlus,
  Users,
  Calendar,
  MessageCircle,
  BriefcaseBusiness,
  FileText,
  CreditCard,
  Trash2,
  Heart,
  LifeBuoy,
  Gift,
  Sparkles,
};

/** notification-bell.tsx TINTS, resolved to the dark theme. */
const WEB_TINT: Record<Category, { bg: string; fg: string }> = {
  bookings: { bg: 'rgba(209,138,90,0.10)', fg: '#D18A5A' },
  albums: { bg: 'rgba(139,94,60,0.15)', fg: '#8B5E3C' },
  jobs: { bg: 'rgba(109,144,177,0.15)', fg: '#6D90B1' },
  hire: { bg: 'rgba(109,144,177,0.15)', fg: '#6D90B1' },
  network: { bg: 'rgba(125,165,92,0.15)', fg: '#7DA55C' },
  schedule: { bg: 'rgba(217,152,106,0.15)', fg: '#D9986A' },
  billing: { bg: '#2A2522', fg: '#A08E84' },
  updates: { bg: 'rgba(182,106,64,0.15)', fg: '#B66A40' },
  offers: { bg: 'rgba(182,106,64,0.15)', fg: '#B66A40' },
  support: { bg: '#2A2522', fg: '#A08E84' },
};

/** notification-topics.ts tintFor, resolved to the dark palette. */
const PHONE_TINT: Record<Category, string> = {
  bookings: '#D18A5A',
  albums: '#B66A40',
  updates: '#B66A40',
  offers: '#B66A40',
  jobs: '#6D90B1',
  hire: '#6D90B1',
  network: '#7DA55C',
  schedule: '#D9986A',
  billing: '#A08E84',
  support: '#A08E84',
};

export function NotificationRow({
  platform,
  topic,
  title,
  body,
  time,
  state = 'unread',
  first = false,
}: {
  platform: 'web' | 'phone';
  topic: Topic;
  title: string;
  body: string;
  /** As the list writes it: "now", "4m", or a time of day under a day heading. */
  time: string;
  state?: NotificationRowState;
  /** Phone only: the first row in a card has no top hairline. */
  first?: boolean;
}) {
  const unread = state === 'unread';
  const category = TOPIC_CATEGORY[topic];
  const Icon = ICONS[TOPIC_ICON[topic]] ?? Bell;

  if (platform === 'web') {
    const tint = WEB_TINT[category];
    return (
      <div
        data-part="notification"
        data-state={state}
        className={`relative flex items-start gap-3 px-4 py-3 ${unread ? 'bg-[rgba(209,138,90,0.045)]' : ''}`}
      >
        <span
          data-part="notification-icon"
          className="flex size-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: tint.bg, color: tint.fg }}
        >
          <Icon aria-hidden className="size-[45%]" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="flex items-baseline gap-2">
            <span
              data-part="notification-title"
              className={`min-w-0 flex-1 text-sm leading-snug text-[#F2EDE8] ${unread ? 'font-semibold' : 'font-medium'}`}
            >
              {title}
            </span>
            <span data-part="notification-time" className="shrink-0 text-[11px] tabular-nums text-[#A08E84]">
              {time}
            </span>
          </span>
          <span
            data-part="notification-body"
            className={`mt-0.5 line-clamp-2 block text-xs leading-relaxed ${unread ? 'text-[#F2EDE8]/75' : 'text-[#A08E84]'}`}
          >
            {keepDatesWhole(body)}
          </span>
        </span>
        {unread && <span data-part="unread-dot" className="mt-2 size-1.5 shrink-0 rounded-full bg-[#D18A5A]" />}
      </div>
    );
  }

  const tint = PHONE_TINT[category];
  return (
    <div
      data-part="notification"
      data-state={state}
      className="flex items-start gap-3 px-3.5 py-3"
      style={{
        background: unread ? '#D18A5A0D' : '#1E1B18',
        borderTop: first ? undefined : '1px solid #362F2B80',
      }}
    >
      <span
        data-part="notification-icon"
        className="flex size-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: `${tint}1F`, color: tint }}
      >
        <Icon aria-hidden size={17} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span
            data-part="notification-title"
            className="min-w-0 flex-1 text-[15px] leading-5 text-[#F2EDE8]"
            style={{ fontWeight: unread ? 600 : 500 }}
          >
            {title}
          </span>
          <span data-part="notification-time" className="text-[12px] text-[#A08E84]">
            {time}
          </span>
        </span>
        <span
          data-part="notification-body"
          className={`line-clamp-2 text-[13px] leading-[18px] ${unread ? 'text-[#F2EDE8]/80' : 'text-[#A08E84]'}`}
        >
          {keepDatesWhole(body)}
        </span>
      </span>
      {unread && <span data-part="unread-dot" className="mt-2 size-2 shrink-0 rounded-full bg-[#D18A5A]" />}
    </div>
  );
}

/**
 * The list a row sits in, with its day heading: the web page's bordered card
 * (heading 11 px semibold, rows divided at border/60) or the phone's inset
 * card (heading 11 px bold, 14 px radius, 16 px side margins).
 */
export function NotificationList({
  platform,
  heading,
  children,
  className = '',
}: {
  platform: 'web' | 'phone';
  /** The day heading as the app writes it ("Today"); drawn uppercase. */
  heading?: string;
  children: ReactNode;
  className?: string;
}) {
  if (platform === 'web') {
    return (
      <div data-part="notification-list" className={`overflow-hidden rounded-xl border border-[#362F2B] bg-[#1E1B18] ${className}`}>
        {heading && (
          <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A08E84]">
            {heading}
          </p>
        )}
        <div className="divide-y divide-[#362F2B]/60">{children}</div>
      </div>
    );
  }
  return (
    <div data-part="notification-list" className={className}>
      {heading && (
        <p className="px-5 pb-2 pt-4 text-[11px] font-bold uppercase tracking-[1.5px] text-[#A08E84]">{heading}</p>
      )}
      <div className="mx-4 overflow-hidden rounded-[14px] border border-[#362F2B] bg-[#1E1B18]">{children}</div>
    </div>
  );
}

/**
 * ISO dates ("2026-12-12 at 06:00", as the move notice prints them) never
 * break at their hyphens when a body wraps; the rest of the text wraps freely.
 */
const ISO_DATE = /(\d{4}-\d{2}-\d{2}(?: at \d{2}:\d{2})?)/;

function keepDatesWhole(text: string) {
  const parts = text.split(ISO_DATE);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="whitespace-nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
