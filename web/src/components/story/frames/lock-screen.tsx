import type { ReactNode } from 'react';
import { APP_NAME, OS } from '../data/strings/common';
import { AppIconTile } from './mark';

/**
 * A generic lock screen, for the inside of a `PhoneFrame`: the date, the
 * time large, and notifications below. Neither Android's nor iOS's — no
 * widgets, no shortcuts, no carrier — because the reminder that rings at
 * 5:00 AM is an ordinary local notification on both (research-app-ui mock
 * 13), and the footnote names this as generic OS chrome.
 *
 * Parts: lock-screen, lock-date, lock-time, lock-notifications,
 * lock-notification.
 */

const MANILA = 'Asia/Manila';

/** "Saturday, December 12": the lock screen's date line for an ISO instant. */
export function lockDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: MANILA,
  }).format(new Date(iso));
}

/** "5:00": the lock screen's clock for an ISO instant (12-hour, no AM/PM). */
export function lockTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: MANILA,
  })
    .format(new Date(iso))
    .replace(/\s?[AP]M$/i, '');
}

/**
 * The wallpaper, for `PhoneFrame`'s `screen` prop so it runs up behind the
 * status bar as a real one does. Plain warm-dark: generic, and quiet enough
 * that the notification is what the eye lands on.
 */
export const LOCK_WALLPAPER =
  'radial-gradient(130% 70% at 50% 0%, #3b2618 0%, #22170f 38%, #120d0a 72%, #0c0908 100%)';

export function LockScreen({
  time,
  date,
  children,
  className = '',
}: {
  /** The big clock: "5:00". `lockTime(iso)` makes one. */
  time: string;
  /** The line above it: "Saturday, December 12". `lockDate(iso)` makes one. */
  date: string;
  /** `LockNotification`s, newest first. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-part="lock-screen"
      className={`absolute inset-0 flex flex-col items-center px-3 pt-[12%] text-[#F7F2ED] ${className}`}
    >
      <p data-part="lock-date" className="text-[16px] font-medium tracking-[0.01em] text-white/85">
        {date}
      </p>
      <p
        data-part="lock-time"
        className="mt-1 text-[84px] font-semibold leading-[0.95] tracking-[-0.045em] tabular-nums text-white/95"
      >
        {time}
      </p>
      <div data-part="lock-notifications" className="mt-auto flex w-full flex-col gap-2 pb-[18%]">
        {children}
      </div>
    </div>
  );
}

/**
 * A notification as a lock screen shows it: the app's icon and name, the
 * age, a title and a body. Translucent dark with no blur — a backdrop blur
 * is a live filter, and the wallpaper behind it is plain anyway.
 */
export function LockNotification({
  title,
  body,
  when = OS.now,
  className = '',
}: {
  title: string;
  body: string;
  /** "now", or a time. */
  when?: string;
  className?: string;
}) {
  return (
    <div
      data-part="lock-notification"
      className={`w-full rounded-[20px] bg-[rgba(44,37,33,0.86)] px-3.5 pb-3 pt-2.5 text-left shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07),0_8px_24px_-12px_rgba(0,0,0,0.6)] ${className}`}
    >
      <div className="flex items-center gap-2">
        <AppIconTile size={20} />
        <span className="flex-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-white/70">{APP_NAME}</span>
        <span className="text-[12px] text-white/55">{when}</span>
      </div>
      <p className="mt-1.5 text-[15px] font-semibold leading-[1.25] text-white">{title}</p>
      <p className="mt-0.5 text-[14px] leading-[1.35] text-white/85">{body}</p>
    </div>
  );
}
