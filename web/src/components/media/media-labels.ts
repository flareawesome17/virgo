import type { StoredFile } from '@/api';
import { dayKey } from '@/lib/media-days';

/*
 * The words the viewer, the film player and the recordings put on a file:
 * when it was taken, how long it is, what kind it is. One place, so a
 * recording's "21 December · 3:48 PM" and a photo's "21 December, 4:12 PM"
 * are built the same way, and the same way the phone builds them.
 */

type Timed = Pick<StoredFile, 'takenAt' | 'createdAt'>;

const DAY = { day: 'numeric', month: 'long' } as const;
const DAY_YEAR = { day: 'numeric', month: 'long', year: 'numeric' } as const;
const TIME = { hour: 'numeric', minute: '2-digit' } as const;

/**
 * A capture time, from its parts.
 *
 * Built rather than parsed: it carries no zone, and parsing would move a
 * frame shot late at night onto another day for anyone outside the zone it
 * was taken in.
 */
function wallClock(takenAt: string): Date {
  const [date, time = '00:00:00'] = takenAt.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

/** "1:12" of a length or a position in seconds. */
export function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

/** When it reached Virgo, "23 December 2025": a real instant, so this one is parsed. */
export function uploadedLabel(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString('en-GB', DAY_YEAR);
}

/** "21 December 2025, 4:12 PM", as the camera wrote it. */
export function takenLabel(takenAt: string): string {
  const at = wallClock(takenAt);
  return `${at.toLocaleDateString('en-GB', DAY_YEAR)}, ${at.toLocaleTimeString('en-US', TIME)}`;
}

/** "21 December, 4:12 PM" from the camera; the upload day when it wrote none. */
export function whenLabel(file: Timed): string {
  if (!file.takenAt) return uploadedLabel(file.createdAt);
  const at = wallClock(file.takenAt);
  return `${at.toLocaleDateString('en-GB', DAY)}, ${at.toLocaleTimeString('en-US', TIME)}`;
}

/** "21 December · 3:48 PM", from the recorder when it wrote one, else the upload day. */
export function recordedLabel(file: Timed): string {
  // An upload time is an instant, and its hour says when the file arrived,
  // not when anyone spoke: only the recorder's own clock is shown as a time.
  if (!file.takenAt) return new Date(file.createdAt).toLocaleDateString('en-GB', DAY);
  const at = wallClock(file.takenAt);
  const day = at.toLocaleDateString('en-GB', DAY);
  return file.takenAt.includes('T') ? `${day} · ${at.toLocaleTimeString('en-US', TIME)}` : day;
}

/** A day key, `2025-12-21`, as a date; null for `undated`. */
function dayOf(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  return new Date(year, month - 1, day);
}

/** "21 December": the day a film was shot, else the day it arrived. */
export function dayLabel(file: Timed): string {
  return dayOf(dayKey(file))?.toLocaleDateString('en-GB', DAY) ?? '';
}

/** "Sat, 21 Dec" over a day's recordings, with the year when it is not this one. */
export function shortDayTitle(key: string, now: Date = new Date()): string {
  const date = dayOf(key);
  if (!date) return 'Undated';
  // In two pieces: asked for together, the weekday comes back with a comma
  // only when the year is there too.
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'short' });
  const day = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
  return `${weekday}, ${day}`;
}

/** "JPEG" from `image/jpeg`; the file's extension when the type is unknown. */
export function typeLabel(file: Pick<StoredFile, 'contentType' | 'originalName'>): string {
  const subtype = file.contentType?.split('/')[1]?.split(/[+;]/)[0]?.replace(/^x-/, '');
  if (subtype) return subtype.toUpperCase();
  const extension = /\.([a-z0-9]{1,5})$/i.exec(file.originalName)?.[1];
  return extension ? extension.toUpperCase() : 'Unknown';
}
