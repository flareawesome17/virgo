import { ImageIcon, Music, Video } from 'lucide-react';
import { CLIENT, COHORTS, NOW } from '../data/story';
import { ALBUM_COUNTS, ALBUM_TILES, STATUS_LABEL, type AlbumStatusKey } from '../data/strings/ch5';
import { ALBUM_TIMES, CARD } from '../data/strings/ch7';
import { Plate } from './plate';

/**
 * The album as a card in the albums list: the cover (the newest photograph,
 * when nobody chose one), the status pill on it, the name, what it holds, and
 * when the album last changed. Ch5 ends by folding the grid into this card;
 * Ch7 ends on it emptied — DELIVERED, "Empty", no cover — because the album
 * and its link stay when the files go.
 *
 * - `platform="web"` follows `albums/page-client.tsx › AlbumCard`: 16.8 px
 *   radius, a 4:3 cover on the muted surface, the pill on card/95 in the
 *   status colour, a 14 px semibold name, then icon counts and `ago()`.
 * - `platform="phone"` follows `mobile/app/(app)/albums/index.tsx ›
 *   AlbumCard`: 16 px radius, a bold name, 11 px counts and `timeAgo()`.
 * Both apps set the pill at 10 px; here it is 11 px, the story's floor
 * (§1.6).
 *
 * The time is the app's own `ago` (web) or `timeAgo` (phone), copied with a
 * fixed `now` instead of Date.now(): uploads and clean-ups never touch the
 * album row, so it reads from when the album was made (Ch5) or marked
 * Delivered on Day 21 (Ch7). The web's date branch is pinned to en-US and
 * Manila, where the app follows the reader's browser.
 *
 * States, styled from the root's `data-state` where they only show or hide:
 * `draft` (Ch5: Draft, the cover, 412 · 1) · `delivered` (Ch7 before the
 * sweeps: Delivered, 412 · 8 · 2) · `empty` (rest: Delivered, no cover,
 * "Empty").
 *
 * Parts: album-card (data-state), card-cover, card-cover-empty, card-status
 * (data-status), card-counts, card-time.
 */

export type AlbumCardState = 'draft' | 'delivered' | 'empty';

const STATES: Record<
  AlbumCardState,
  { status: AlbumStatusKey; counts: { image: number; video: number; audio: number }; updated: string; now: string }
> = {
  draft: { status: 'draft', counts: ALBUM_COUNTS.saturday, updated: ALBUM_TIMES.made, now: NOW.ch5 },
  delivered: { status: 'delivered', counts: ALBUM_COUNTS.complete, updated: ALBUM_TIMES.delivered, now: COHORTS[0].sweep.at },
  empty: { status: 'delivered', counts: ALBUM_COUNTS.empty, updated: ALBUM_TIMES.delivered, now: NOW.ch7 },
};

/** The cover the API derives: the newest photograph in the album, Mika's last frame. */
const COVER_SEED = [...ALBUM_TILES].filter((t) => t.kind === 'image').sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt))[0].seed;

/** `albums/page-client.tsx › ago`, with `now` passed in. */
function webAgo(iso: string, now: string): string {
  const minutes = Math.floor((Date.parse(now) - Date.parse(iso)) / 60000);
  if (minutes < 1) return CARD.justNowWeb;
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'Asia/Manila' });
}

/** `mobile/app/(app)/albums/index.tsx › timeAgo`, with `now` passed in. */
function phoneAgo(iso: string, now: string): string {
  const mins = Math.floor((Date.parse(now) - Date.parse(iso)) / 60000);
  if (mins < 1) return CARD.justNowPhone;
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

const STATUS_TEXT: Record<AlbumStatusKey, string> = {
  draft: 'text-[#A08E84]',
  review: 'text-[#D9986A]',
  delivered: 'text-[#7DA55C]',
};

export function AlbumCard({
  platform,
  state = 'empty',
  className = '',
}: {
  platform: 'web' | 'phone';
  state?: AlbumCardState;
  className?: string;
}) {
  const { status, counts, updated, now } = STATES[state];
  const web = platform === 'web';
  const parts = [
    { n: counts.image, Icon: ImageIcon, key: 'image' },
    { n: counts.video, Icon: Video, key: 'video' },
    { n: counts.audio, Icon: Music, key: 'audio' },
  ].filter((p) => p.n > 0);
  const time = web ? webAgo(updated, now) : phoneAgo(updated, now);

  return (
    <div
      aria-hidden
      data-part="album-card"
      data-state={state}
      className={`group/card block w-full overflow-hidden border border-[#362F2B] bg-[#1E1B18] text-[#F2EDE8] ${
        web ? 'rounded-xl font-sans' : 'rounded-[16px]'
      } ${className}`}
    >
      <div className="relative aspect-[4/3] bg-[#2A2522]">
        <span data-part="card-cover-empty" className="absolute inset-0 grid place-items-center">
          <ImageIcon aria-hidden className="text-[#A08E84]" size={web ? 24 : 22} />
        </span>
        <div data-part="card-cover" className="absolute inset-0 group-data-[state=empty]/card:opacity-0">
          <Plate seed={COVER_SEED} aspect="fill" />
        </div>
        <span
          data-part="card-status"
          data-status={status}
          className={`absolute left-2 top-2 px-1.5 py-0.5 text-[11px] font-bold uppercase leading-[14px] tracking-wide ${
            web ? 'rounded-md bg-[rgba(30,27,24,0.95)]' : 'rounded-[14px] bg-[rgba(30,27,24,0.9)]'
          } ${STATUS_TEXT[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      {web ? (
        <div className="space-y-1.5 p-3">
          <p className="truncate text-sm font-semibold">{CLIENT.album}</p>
          <div className="flex items-center gap-3 text-xs text-[#A08E84]">
            <span data-part="card-counts" className="flex items-center gap-3">
              {parts.length > 0 ? (
                parts.map(({ n, Icon, key }) => (
                  <span key={key} className="inline-flex items-center gap-1 tabular-nums">
                    <Icon aria-hidden className="size-3.5" />
                    {n.toLocaleString()}
                  </span>
                ))
              ) : (
                <span>{CARD.empty}</span>
              )}
            </span>
            <span data-part="card-time" className="ml-auto">
              {time}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 p-3">
          <p className="truncate text-sm font-bold">{CLIENT.album}</p>
          <div className="flex flex-wrap items-center gap-2.5">
            <span data-part="card-counts" className="flex items-center gap-2.5">
              {parts.length > 0 ? (
                parts.map(({ n, Icon, key }) => (
                  <span key={key} className="flex items-center gap-1">
                    <Icon aria-hidden size={11} className="text-[#A08E84]" />
                    <span className="text-[11px] font-medium leading-[14px] text-[#A08E84]">{n.toLocaleString()}</span>
                  </span>
                ))
              ) : (
                <span className="text-[11px] leading-[14px] text-[#A08E84]">{CARD.empty}</span>
              )}
            </span>
            <span data-part="card-time" className="ml-auto text-[11px] leading-[14px] text-[#A08E84]">
              {time}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
