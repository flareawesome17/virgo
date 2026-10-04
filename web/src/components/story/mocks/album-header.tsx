import { ArrowLeft, ChevronDown, Heart, Link as LinkIcon, Link2, MoreHorizontal, Shield, Upload } from 'lucide-react';
import { ALBUM, CLIENT } from '../data/story';
import {
  ALBUM_COUNTS,
  COUNT_JOIN,
  COUNT_WORDS,
  EMPTY,
  HEADER,
  PICKS_WORDS,
  STATUS_LABEL,
  type AlbumStatusKey,
} from '../data/strings/ch5';

/**
 * The top of an album, as each app draws it: "Reyes & Santos — Wedding", its
 * status pill, and what it holds.
 *
 * - `platform="web"` follows `albums/[id]/page-client.tsx`: the header band
 *   (bg-card/40, border-b), the "Albums / Reyes & Santos" breadcrumb, a 24 px
 *   (30 px from 640) semibold title, the 11 px uppercase status pill, the
 *   tabular counts, then outline "Client link", the action-filled "Upload"
 *   menu button and the ghost "…". Its breakpoints are container queries on
 *   the header itself, so it lays out by the frame it sits in, not the window.
 * - `platform="phone"` follows `mobile/app/(app)/albums/[albumId]/index.tsx`:
 *   back and menu discs, the workspace eyebrow over an 18 px bold title, the
 *   pill row (status, the retention pill "Files deleted 90 days after
 *   upload", counts) and two equal buttons. Phone radii are NativeWind's:
 *   rounded-md is 14 px there, rounded-xl 12 px.
 *
 * The counts line is the app's own template (copied: the page keeps its
 * `plural` local): "412 photos · 1 film", or "Empty".
 *
 * States: `empty` (made on Friday, Draft, Empty) · `draft` (rest: Saturday
 * night, 412 photos · 1 film) · `delivered` (Day 21: 412 photos · 8 films ·
 * 2 recordings, and on the web the link to the couple's "12 client picks",
 * which the page shows once there are picks; the phone carries them as a
 * section chip instead) · `cleared` (after Day 112: Delivered, Empty — the
 * picked files went with the rest).
 *
 * Parts: album-header (data-state), album-title, album-status (data-status),
 * album-counts, album-picks (web), album-retention (phone).
 */

export type AlbumHeaderState = 'empty' | 'draft' | 'delivered' | 'cleared';

const STATES: Record<
  AlbumHeaderState,
  { status: AlbumStatusKey; counts: { image: number; video: number; audio: number }; picks: number }
> = {
  empty: { status: 'draft', counts: ALBUM_COUNTS.empty, picks: 0 },
  draft: { status: 'draft', counts: ALBUM_COUNTS.saturday, picks: 0 },
  delivered: { status: 'delivered', counts: ALBUM_COUNTS.complete, picks: ALBUM.picks },
  cleared: { status: 'delivered', counts: ALBUM_COUNTS.empty, picks: 0 },
};

/** The page's own `plural`, word for word. */
function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** "412 photos · 1 film", or "Empty": the counts line on both apps. */
export function countsLine(counts: { image: number; video: number; audio: number }): string {
  return (
    [
      counts.image ? plural(counts.image, COUNT_WORDS.photo.one, COUNT_WORDS.photo.many) : null,
      counts.video ? plural(counts.video, COUNT_WORDS.film.one, COUNT_WORDS.film.many) : null,
      counts.audio ? plural(counts.audio, COUNT_WORDS.recording.one, COUNT_WORDS.recording.many) : null,
    ]
      .filter(Boolean)
      .join(COUNT_JOIN) || EMPTY
  );
}

/** The pill tints, per app: muted / warning/15 / success/15, resolved to dark. */
const WEB_PILL: Record<AlbumStatusKey, string> = {
  draft: 'bg-[#2A2522] text-[#A08E84]',
  review: 'bg-[rgba(217,152,106,0.15)] text-[#D9986A]',
  delivered: 'bg-[rgba(125,165,92,0.15)] text-[#7DA55C]',
};

export function AlbumHeader({
  platform,
  state = 'draft',
  className = '',
}: {
  platform: 'web' | 'phone';
  state?: AlbumHeaderState;
  className?: string;
}) {
  const { status, counts, picks } = STATES[state];
  const line = countsLine(counts);

  if (platform === 'web') {
    return (
      <div
        aria-hidden
        data-part="album-header"
        data-state={state}
        className={`@container border-b border-[#362F2B] bg-[rgba(30,27,24,0.4)] font-sans text-[#F2EDE8] ${className}`}
      >
        <div className="px-4 py-5 @[40rem]:px-6 @[64rem]:px-8 @[64rem]:py-7">
          <div className="flex items-center gap-1.5 text-xs text-[#A08E84]">
            <span>{HEADER.albums}</span>
            <span>{HEADER.crumb}</span>
            <span className="truncate">{CLIENT.workspace}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p data-part="album-title" className="truncate text-2xl font-semibold tracking-tight @[40rem]:text-3xl">
                {CLIENT.album}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-[#A08E84]">
                <span
                  data-part="album-status"
                  data-status={status}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${WEB_PILL[status]}`}
                >
                  {STATUS_LABEL[status]}
                </span>
                <span data-part="album-counts" className="tabular-nums">
                  {line}
                </span>
                {picks > 0 && (
                  <span
                    data-part="album-picks"
                    className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium text-[#D18A5A]"
                  >
                    <Heart aria-hidden className="size-3.5 fill-current" />
                    {plural(picks, PICKS_WORDS.one, PICKS_WORDS.many)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#362F2B] bg-[rgba(54,47,43,0.3)] px-2.5 text-sm font-medium whitespace-nowrap">
                <Link2 aria-hidden className="size-4" />
                {HEADER.clientLink}
              </span>
              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#A85D35] px-2.5 text-sm font-medium whitespace-nowrap text-white">
                <Upload aria-hidden className="size-4" />
                {HEADER.upload}
                <ChevronDown aria-hidden className="size-3.5 opacity-70" />
              </span>
              <span className="grid size-8 place-items-center rounded-lg">
                <MoreHorizontal aria-hidden className="size-5" />
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const phonePill =
    status === 'delivered' ? 'bg-[rgba(125,165,92,0.15)] text-[#7DA55C]' : status === 'review' ? 'bg-[rgba(217,152,106,0.15)] text-[#D9986A]' : 'bg-[#2A2522] text-[#A08E84]';

  return (
    <div
      aria-hidden
      data-part="album-header"
      data-state={state}
      className={`flex flex-col gap-3 border-b border-[#362F2B] bg-[#1E1B18] px-4 pb-3 pt-2 text-[#F2EDE8] ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#2A2522]">
          <ArrowLeft aria-hidden size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-[#A08E84]">{CLIENT.workspace}</p>
          <p data-part="album-title" className="truncate text-lg font-bold leading-7">
            {CLIENT.album}
          </p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#2A2522]">
          <MoreHorizontal aria-hidden size={18} />
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          data-part="album-status"
          data-status={status}
          className={`rounded-[14px] px-2 py-1 text-[11px] font-bold uppercase leading-[13px] tracking-wide ${phonePill}`}
        >
          {STATUS_LABEL[status]}
        </span>
        <span data-part="album-retention" className="flex items-center gap-1 rounded-[14px] bg-[#2A2522] px-2 py-1">
          <Shield aria-hidden size={11} className="text-[#A08E84]" />
          <span className="text-[11px] font-semibold leading-[13px] text-[#A08E84]">{HEADER.retention}</span>
        </span>
        <span data-part="album-counts" className="text-xs text-[#A08E84]">
          {line}
        </span>
      </div>

      <div className="flex gap-2">
        <span className="flex flex-1 items-center justify-center gap-2 rounded-[12px] border border-[#362F2B] py-2.5">
          <LinkIcon aria-hidden size={15} />
          <span className="text-sm font-semibold">{HEADER.clientLink}</span>
        </span>
        <span className="flex flex-1 items-center justify-center gap-2 rounded-[12px] bg-[#A85D35] py-2.5 text-white">
          <Upload aria-hidden size={15} />
          <span className="text-sm font-bold">{HEADER.upload}</span>
        </span>
      </div>
    </div>
  );
}
