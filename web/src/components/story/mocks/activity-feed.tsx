import { Activity } from 'lucide-react';
import type { WorkspaceActivityItem } from '@/api';
import { describeActivity, relativeTime } from '@/lib/workspaces';
import { NOW } from '../data/story';
import {
  ACTIVITY,
  ACTIVITY_ALBUM,
  ACTIVITY_CLIENT,
  ACTIVITY_EMPTY,
  ACTIVITY_TITLE,
  wallClock,
  wallClockString,
} from '../data/strings/ch5';
import { Avatar } from './avatar';

/**
 * The workspace's "What’s been happening" card on Saturday night, newest
 * first: "You uploaded 248 files to Reyes & Santos — Wedding" (Owner),
 * "Ernie uploaded 164 files to …" (Photographer), "Kenn uploaded a file to …"
 * (Editor). The line names the album, never a section, and each person's
 * upload is one row because the API folds a person's files per album and
 * hour.
 *
 * Every word of a row comes from the app: `describeActivity` builds the line
 * and its role subline, `relativeTime` the time ("Sat", with Ch5's Monday
 * morning `now` read as Cebu's wall clock). The face is PersonAvatar's look
 * (`Avatar surface="workspace"`): first and last initials on primary/15.
 *
 * - `platform="web"` follows `activity-feed.tsx` inside the workspace page's
 *   card: rounded-2xl, 15 px semibold title, rows with a hairline between,
 *   semibold names, 12 px muted subline and time.
 * - `platform="phone"` follows `WorkspaceActivity.tsx` in its Card: bold
 *   names, the border colour between rows.
 *
 * States: `empty` (the feed's own empty state) · `first` (Kenn's row) ·
 * `second` (Ernie's above it) · `all` (rest). Rows arrive at the top, as a
 * newest-first feed fills; every row keeps its room in every state, so a
 * stage can fade rows in without moving anything. A row shows when it has
 * `data-on`, and the empty state when the root's `data-state` is `empty`;
 * the hairline sits under each row but the last, so a hidden row takes its
 * line with it.
 *
 * Parts: activity-feed (data-state), activity-row (data-who, data-on),
 * activity-empty.
 */

export type ActivityFeedState = 'empty' | 'first' | 'second' | 'all';

const SHOWN: Record<ActivityFeedState, number> = { empty: 0, first: 1, second: 2, all: 3 };

/** The rows as the API would send them: hand-built WorkspaceActivityItems. */
function items(): WorkspaceActivityItem[] {
  return ACTIVITY.map((row) => ({
    id: row.id,
    kind: 'upload',
    count: row.count,
    data: {},
    // The wall clock, without its zone: relativeTime reads it as local time,
    // against a local `now` with the same wall clock (see wallClock).
    created_at: wallClockString(row.at),
    actor: { id: row.who, name: row.name, avatar_url: null, role: row.role, is_you: row.isYou },
    subject: null,
    album: { id: ACTIVITY_ALBUM.id, name: ACTIVITY_ALBUM.name },
  }));
}

export function ActivityFeed({
  platform,
  state = 'all',
  now: when = NOW.ch5,
  className = '',
}: {
  platform: 'web' | 'phone';
  state?: ActivityFeedState;
  /** When the feed is read, a story instant in Cebu: "Sat" from Monday, "7m ago" at 11:55 PM on Saturday. */
  now?: string;
  className?: string;
}) {
  const now = wallClock(when);
  const rows = items();
  const shown = SHOWN[state];
  /** Rows fill from the bottom: the oldest arrives first. */
  const on = (i: number) => i >= rows.length - shown;
  const web = platform === 'web';

  return (
    <div
      aria-hidden
      data-part="activity-feed"
      data-state={state}
      className={
        web
          ? `group/feed rounded-2xl border border-[#362F2B] bg-[#1E1B18] px-4 pb-1 pt-3.5 font-sans text-[#F2EDE8] ${className}`
          : `group/feed rounded-[16px] border border-[rgba(54,47,43,0.4)] bg-[#1E1B18] px-3.5 pt-3 text-[#F2EDE8] ${className}`
      }
    >
      <p className={web ? 'mb-1 text-[15px] font-semibold' : 'text-sm font-semibold leading-5'}>{ACTIVITY_TITLE}</p>

      <div className="relative">
        {rows.map((item, i) => {
          const { parts, subline } = describeActivity(item);
          const last = i === rows.length - 1;
          return (
            <div
              key={item.id}
              data-part="activity-row"
              data-who={item.actor?.id ?? undefined}
              data-on={on(i) ? '' : undefined}
              className={`flex items-start gap-3 py-3 opacity-0 data-[on]:opacity-100 ${last ? '' : 'border-b border-[#362F2B]'}`}
            >
              {/* PersonAvatar on both apps: primary/15, first and last initials. The
                  web one carries the Avatar's 1 px border overlay; the phone's
                  (WorkspaceBits) has none, so its ring is dropped here. */}
              <Avatar
                surface="workspace"
                name={item.actor?.name ?? ACTIVITY_CLIENT}
                size={32}
                className={web ? '' : 'shadow-none!'}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-5">
                  {parts.map((part, j) =>
                    part.strong ? (
                      <strong key={j} className={web ? 'font-semibold' : 'font-bold'}>
                        {part.text}
                      </strong>
                    ) : (
                      <span key={j}>{part.text}</span>
                    ),
                  )}
                </p>
                {subline && <p className="mt-0.5 text-xs text-[#A08E84]">{subline}</p>}
              </div>
              <span className="shrink-0 whitespace-nowrap text-xs text-[#A08E84]">{relativeTime(item.created_at, now)}</span>
            </div>
          );
        })}

        <div
          data-part="activity-empty"
          className="absolute inset-0 flex items-center justify-center opacity-0 group-data-[state=empty]/feed:opacity-100"
        >
          {web ? (
            <div className="flex flex-col items-center gap-1 py-8 text-center">
              <Activity aria-hidden className="size-5 text-[#A08E84]" />
              <p className="text-sm font-medium">{ACTIVITY_EMPTY.title}</p>
              <p className="text-xs text-[#A08E84]">{ACTIVITY_EMPTY.body}</p>
            </div>
          ) : (
            <p className="py-4 text-sm text-[#A08E84]">{ACTIVITY_EMPTY.phone}</p>
          )}
        </div>
      </div>
    </div>
  );
}
